import { graphql } from '@octokit/graphql';
import { env } from '$env/dynamic/private';

// ---------------------------------------------------------------------------
// In-memory cache (server-side, survives across requests within one process)
// ---------------------------------------------------------------------------
interface CacheEntry<T> {
	data: T;
	expiresAt: number;
}

const cache = new Map<string, CacheEntry<unknown>>();

function getCached<T>(key: string): T | undefined {
	const entry = cache.get(key) as CacheEntry<T> | undefined;
	if (!entry) return undefined;
	if (Date.now() > entry.expiresAt) {
		cache.delete(key);
		return undefined;
	}
	return entry.data;
}

function setCache<T>(key: string, data: T, ttlSeconds: number): void {
	cache.set(key, { data, expiresAt: Date.now() + ttlSeconds * 1000 });
}

// ---------------------------------------------------------------------------
// GitHub App installation token support
// ---------------------------------------------------------------------------

interface AppToken {
	token: string;
	expiresAt: number;
}

let appTokenCache: AppToken | null = null;

/**
 * Generate a JWT for a GitHub App, then exchange it for an installation token.
 * Requires GITHUB_APP_ID, GITHUB_APP_PRIVATE_KEY, GITHUB_APP_INSTALLATION_ID.
 */
async function getAppInstallationToken(): Promise<string | null> {
	const appId = env.GITHUB_APP_ID;
	const privateKeyRaw = env.GITHUB_APP_PRIVATE_KEY;
	const installationId = env.GITHUB_APP_INSTALLATION_ID;

	if (!appId || !privateKeyRaw || !installationId) return null;

	// Return cached token if still valid (with 60s buffer)
	if (appTokenCache && Date.now() < appTokenCache.expiresAt - 60_000) {
		return appTokenCache.token;
	}

	// Build JWT using Web Crypto (works in Node 18+ and edge runtimes)
	const now = Math.floor(Date.now() / 1000);
	const payload = { iat: now - 60, exp: now + 600, iss: appId };

	const privateKey = privateKeyRaw.replace(/\\n/g, '\n');

	// Import PKCS#8 PEM key
	const pemBody = privateKey
		.replace(/-----BEGIN RSA PRIVATE KEY-----/, '')
		.replace(/-----END RSA PRIVATE KEY-----/, '')
		.replace(/-----BEGIN PRIVATE KEY-----/, '')
		.replace(/-----END PRIVATE KEY-----/, '')
		.replace(/\s/g, '');
	const binaryKey = Uint8Array.from(atob(pemBody), (c) => c.charCodeAt(0));

	let cryptoKey: CryptoKey;
	try {
		cryptoKey = await crypto.subtle.importKey(
			'pkcs8',
			binaryKey,
			{ name: 'RSASSA-PKCS1-v1_5', hash: 'SHA-256' },
			false,
			['sign']
		);
	} catch {
		console.error('Failed to import GitHub App private key');
		return null;
	}

	const enc = new TextEncoder();
	const header = btoa(JSON.stringify({ alg: 'RS256', typ: 'JWT' }))
		.replace(/=/g, '')
		.replace(/\+/g, '-')
		.replace(/\//g, '_');
	const body = btoa(JSON.stringify(payload))
		.replace(/=/g, '')
		.replace(/\+/g, '-')
		.replace(/\//g, '_');
	const sigInput = enc.encode(`${header}.${body}`);
	const sigBuf = await crypto.subtle.sign('RSASSA-PKCS1-v1_5', cryptoKey, sigInput);
	const sig = btoa(String.fromCharCode(...new Uint8Array(sigBuf)))
		.replace(/=/g, '')
		.replace(/\+/g, '-')
		.replace(/\//g, '_');
	const jwt = `${header}.${body}.${sig}`;

	// Exchange JWT for installation token
	try {
		const res = await fetch(
			`https://api.github.com/app/installations/${installationId}/access_tokens`,
			{
				method: 'POST',
				headers: {
					Authorization: `Bearer ${jwt}`,
					Accept: 'application/vnd.github+json',
					'User-Agent': 'Gitorum'
				}
			}
		);

		if (!res.ok) {
			console.error('Failed to get installation token:', res.status, await res.text());
			return null;
		}

		const data = await res.json();
		appTokenCache = {
			token: data.token,
			expiresAt: new Date(data.expires_at).getTime()
		};
		return data.token;
	} catch (err) {
		console.error('Error fetching installation token:', err);
		return null;
	}
}

// ---------------------------------------------------------------------------
// GraphQL client helpers
// ---------------------------------------------------------------------------

function getOptionalEnv(key: string): string | undefined {
	return env[key] || undefined;
}

function getRequiredEnv(key: string): string {
	const value = env[key];
	if (!value) throw new Error(`Missing environment variable: ${key}`);
	return value;
}

/**
 * Returns the best available server-side read token, trying in order:
 * 1. GITHUB_SERVER_TOKEN (PAT)
 * 2. GitHub App installation token (auto-generated)
 * 3. null (no server token available)
 */
export async function getServerToken(): Promise<string | null> {
	const pat = getOptionalEnv('GITHUB_SERVER_TOKEN');
	if (pat) return pat;

	const appToken = await getAppInstallationToken();
	if (appToken) return appToken;

	return null;
}

/**
 * Whether the server is running without a dedicated server token.
 * When true, reads will use the user's OAuth token if available.
 */
export async function isAnonymousMode(): Promise<boolean> {
	return (await getServerToken()) === null;
}

/**
 * Get a GraphQL client for read operations. Priority:
 * 1. Server token (PAT or GitHub App)
 * 2. User's OAuth token (fallback when no server token)
 * 3. null if no token available at all
 */
export async function getReadClient(userToken?: string | null): Promise<ReturnType<typeof graphql.defaults> | null> {
	const serverToken = await getServerToken();
	const token = serverToken || userToken;

	if (!token) return null;

	return graphql.defaults({
		headers: {
			authorization: `bearer ${token}`
		}
	});
}

export function getUserClient(token: string) {
	return graphql.defaults({
		headers: {
			authorization: `bearer ${token}`
		}
	});
}

export function getRepoOwner(): string {
	return getRequiredEnv('GITHUB_REPO_OWNER');
}

export function getRepoName(): string {
	return getRequiredEnv('GITHUB_REPO_NAME');
}

export async function fetchCategories(userToken?: string | null) {
	const cacheKey = 'categories';
	const cached = getCached<any[]>(cacheKey);
	if (cached) return cached;

	const gql = await getReadClient(userToken);
	if (!gql) return null;

	const owner = getRepoOwner();
	const repo = getRepoName();

	const result: any = await gql(
		`query($owner: String!, $repo: String!) {
			repository(owner: $owner, name: $repo) {
				discussionCategories(first: 20) {
					nodes { id name description emoji slug }
				}
			}
		}`,
		{ owner, repo }
	);

	const categories = result.repository.discussionCategories.nodes;
	setCache(cacheKey, categories, 120); // cache 2 minutes
	return categories;
}

export async function fetchCategoryBySlug(slug: string, userToken?: string | null) {
	const categories = await fetchCategories(userToken);
	if (!categories) return null;
	return categories.find((c: any) => c.slug === slug) || null;
}

export async function fetchThreadsByCategory(
	categoryId: string,
	first: number = 20,
	after?: string,
	orderBy: string = 'UPDATED_AT',
	userToken?: string | null
) {
	const cacheKey = `threads:${categoryId}:${first}:${after || ''}:${orderBy}`;
	const cached = getCached<any>(cacheKey);
	if (cached) return cached;

	const gql = await getReadClient(userToken);
	if (!gql) return null;

	const owner = getRepoOwner();
	const repo = getRepoName();

	const result: any = await gql(
		`query($owner: String!, $repo: String!, $categoryId: ID!, $first: Int!, $after: String, $orderBy: DiscussionOrderField!) {
			repository(owner: $owner, name: $repo) {
				discussions(first: $first, categoryId: $categoryId, after: $after, orderBy: { field: $orderBy, direction: DESC }) {
					pageInfo { hasNextPage endCursor }
					nodes {
						id number title createdAt
						author { login avatarUrl url }
						comments { totalCount }
						reactions { totalCount }
					}
				}
			}
		}`,
		{ owner, repo, categoryId, first, after: after || null, orderBy }
	);

	const discussions = result.repository.discussions;
	setCache(cacheKey, discussions, 60); // cache 1 minute
	return discussions;
}

export async function fetchThread(number: number, userToken?: string | null) {
	const cacheKey = `thread:${number}`;
	const cached = getCached<any>(cacheKey);
	if (cached) return cached;

	const gql = await getReadClient(userToken);
	if (!gql) return null;

	const owner = getRepoOwner();
	const repo = getRepoName();

	const result: any = await gql(
		`query($owner: String!, $repo: String!, $number: Int!) {
			repository(owner: $owner, name: $repo) {
				discussion(number: $number) {
					id title body bodyHTML createdAt
					author { login avatarUrl url }
					category { name slug }
					reactions(first: 10) { nodes { content } totalCount }
					comments(first: 50) {
						totalCount
						pageInfo { hasNextPage endCursor }
						nodes {
							id body bodyHTML createdAt
							author { login avatarUrl url }
							reactions(first: 10) { nodes { content } totalCount }
							replies(first: 20) {
								nodes {
									id body bodyHTML createdAt
									author { login avatarUrl url }
								}
							}
						}
					}
				}
			}
		}`,
		{ owner, repo, number }
	);

	const thread = result.repository.discussion;
	setCache(cacheKey, thread, 60); // cache 1 minute
	return thread;
}

export async function fetchRepoId(userToken?: string | null) {
	const cacheKey = 'repoId';
	const cached = getCached<string>(cacheKey);
	if (cached) return cached;

	const gql = await getReadClient(userToken);
	if (!gql) return null;

	const owner = getRepoOwner();
	const repo = getRepoName();

	const result: any = await gql(
		`query($owner: String!, $repo: String!) {
			repository(owner: $owner, name: $repo) { id }
		}`,
		{ owner, repo }
	);

	const id = result.repository.id;
	setCache(cacheKey, id, 3600); // cache 1 hour
	return id;
}

export async function createDiscussion(
	token: string,
	repoId: string,
	categoryId: string,
	title: string,
	body: string
) {
	const gql = getUserClient(token);

	const result: any = await gql(
		`mutation($repoId: ID!, $categoryId: ID!, $title: String!, $body: String!) {
			createDiscussion(input: {
				repositoryId: $repoId
				categoryId: $categoryId
				title: $title
				body: $body
			}) {
				discussion { number title }
			}
		}`,
		{ repoId, categoryId, title, body }
	);

	return result.createDiscussion.discussion;
}

export async function addComment(token: string, discussionId: string, body: string) {
	const gql = getUserClient(token);

	const result: any = await gql(
		`mutation($discussionId: ID!, $body: String!) {
			addDiscussionComment(input: {
				discussionId: $discussionId
				body: $body
			}) {
				comment { id createdAt }
			}
		}`,
		{ discussionId, body }
	);

	return result.addDiscussionComment.comment;
}

export async function searchDiscussions(query: string, first: number = 20, after?: string, userToken?: string | null) {
	const cacheKey = `search:${query}:${first}:${after || ''}`;
	const cached = getCached<any>(cacheKey);
	if (cached) return cached;

	const gql = await getReadClient(userToken);
	if (!gql) return null;
	const owner = getRepoOwner();
	const repo = getRepoName();

	const searchQuery = `${query} repo:${owner}/${repo} type:discussion`;

	const result: any = await gql(
		`query($searchQuery: String!, $first: Int!, $after: String) {
			search(query: $searchQuery, type: DISCUSSION, first: $first, after: $after) {
				discussionCount
				pageInfo { hasNextPage endCursor }
				nodes {
					... on Discussion {
						id number title createdAt
						author { login avatarUrl url }
						comments { totalCount }
						reactions { totalCount }
						category { name slug }
					}
				}
			}
		}`,
		{ searchQuery, first, after: after || null }
	);

	const search = result.search;
	setCache(cacheKey, search, 60); // cache 1 minute
	return search;
}
