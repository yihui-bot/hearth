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
// Rate-limit error detection
// ---------------------------------------------------------------------------

export class RateLimitError extends Error {
	constructor(message: string = 'GitHub API rate limit exceeded') {
		super(message);
		this.name = 'RateLimitError';
	}
}

function isRateLimitError(err: unknown): boolean {
	if (err instanceof Error) {
		const msg = err.message.toLowerCase();
		return msg.includes('rate limit') || msg.includes('api rate limit');
	}
	return false;
}

// ---------------------------------------------------------------------------
// GitHub App installation token support
// ---------------------------------------------------------------------------

interface AppToken {
	token: string;
	expiresAt: number;
}

/**
 * Encode a DER length value.
 */
function derLength(len: number): number[] {
	if (len < 128) return [len];
	if (len < 256) return [0x81, len];
	return [0x82, (len >> 8) & 0xff, len & 0xff];
}

/**
 * Convert a PKCS#1 RSA private key (DER) to PKCS#8 (unencrypted PrivateKeyInfo).
 * GitHub App private keys are downloaded in PKCS#1 format; Web Crypto requires PKCS#8.
 */
function pkcs1ToPkcs8(pkcs1: Uint8Array): Uint8Array {
	// AlgorithmIdentifier: SEQUENCE { OID rsaEncryption (1.2.840.113549.1.1.1), NULL }
	const algorithmId = new Uint8Array([
		0x30, 0x0d, 0x06, 0x09, 0x2a, 0x86, 0x48, 0x86, 0xf7, 0x0d, 0x01, 0x01, 0x01, 0x05, 0x00
	]);
	const versionBytes = new Uint8Array([0x02, 0x01, 0x00]); // INTEGER 0
	const octetHeader = new Uint8Array([0x04, ...derLength(pkcs1.length)]);
	const innerLen =
		versionBytes.length + algorithmId.length + octetHeader.length + pkcs1.length;
	const seqHeader = new Uint8Array([0x30, ...derLength(innerLen)]);

	const pkcs8 = new Uint8Array(seqHeader.length + innerLen);
	let offset = 0;
	pkcs8.set(seqHeader, offset);
	offset += seqHeader.length;
	pkcs8.set(versionBytes, offset);
	offset += versionBytes.length;
	pkcs8.set(algorithmId, offset);
	offset += algorithmId.length;
	pkcs8.set(octetHeader, offset);
	offset += octetHeader.length;
	pkcs8.set(pkcs1, offset);
	return pkcs8;
}

let appTokenCache: AppToken | null = null;

function hasAppConfig(): boolean {
	return !!(env.GITHUB_APP_ID && env.GITHUB_APP_PRIVATE_KEY && env.GITHUB_APP_INSTALLATION_ID);
}

/**
 * Generate a JWT for a GitHub App, then exchange it for an installation token.
 * If `forceRefresh` is true, bypass the cache to get a fresh token (used on
 * rate-limit to rotate tokens automatically).
 */
async function getAppInstallationToken(forceRefresh = false): Promise<string | null> {
	const appId = env.GITHUB_APP_ID;
	const privateKeyRaw = env.GITHUB_APP_PRIVATE_KEY;
	const installationId = env.GITHUB_APP_INSTALLATION_ID;

	if (!appId || !privateKeyRaw || !installationId) return null;

	// Return cached token if still valid (with 60s buffer) and not forced
	if (!forceRefresh && appTokenCache && Date.now() < appTokenCache.expiresAt - 60_000) {
		return appTokenCache.token;
	}

	// Build JWT using Web Crypto (works in Node 18+ and edge runtimes)
	const now = Math.floor(Date.now() / 1000);
	const payload = { iat: now - 60, exp: now + 600, iss: appId };

	// Support both literal-\n (escaped) and actual newlines so the PEM can be
	// pasted as-is from the downloaded .pem file without any manual escaping.
	const privateKey = privateKeyRaw.replace(/\\n/g, '\n');

	const isPkcs1 = privateKey.includes('-----BEGIN RSA PRIVATE KEY-----');
	const pemBody = privateKey
		.replace(/-----BEGIN RSA PRIVATE KEY-----/, '')
		.replace(/-----END RSA PRIVATE KEY-----/, '')
		.replace(/-----BEGIN PRIVATE KEY-----/, '')
		.replace(/-----END PRIVATE KEY-----/, '')
		.replace(/\s/g, '');
	const binaryKey = Uint8Array.from(atob(pemBody), (c) => c.charCodeAt(0));
	// GitHub App keys are PKCS#1; Web Crypto requires PKCS#8.
	const keyBytes = isPkcs1 ? pkcs1ToPkcs8(binaryKey) : binaryKey;
	// .slice() on ArrayBufferLike returns ArrayBufferLike, but Web Crypto requires a plain
	// ArrayBuffer. The cast is safe because both pkcs1ToPkcs8 and Uint8Array.from() always
	// allocate a regular ArrayBuffer (never a SharedArrayBuffer).
	const keyBuffer = keyBytes.buffer.slice(
		keyBytes.byteOffset,
		keyBytes.byteOffset + keyBytes.byteLength
	) as ArrayBuffer;

	let cryptoKey: CryptoKey;
	try {
		cryptoKey = await crypto.subtle.importKey(
			'pkcs8',
			keyBuffer,
			{ name: 'RSASSA-PKCS1-v1_5', hash: 'SHA-256' },
			false,
			['sign']
		);
	} catch (err) {
		console.error(
			`Failed to import GitHub App private key (detected format: ${isPkcs1 ? 'PKCS#1' : 'PKCS#8'}):`,
			err
		);
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

function getRequiredEnv(key: string): string {
	const value = env[key];
	if (!value) throw new Error(`Missing environment variable: ${key}`);
	return value;
}

/** Best available server-side read token (GitHub App). */
async function getServerToken(): Promise<string | null> {
	return await getAppInstallationToken();
}

/** Returns the best available token for read operations (App token or user OAuth). */
async function getReadToken(userToken?: string | null): Promise<string | null> {
	return (await getServerToken()) || userToken || null;
}

/**
 * Execute a read query with automatic retry on rate limit.
 * If a GitHub App is configured and the first attempt hits a rate limit,
 * forces a token refresh and retries once.
 */
async function executeGraphQLRead<T>(
	token: string,
	queryFn: (gql: ReturnType<typeof graphql.defaults>) => Promise<T>
): Promise<T> {
	const gql = graphql.defaults({ headers: { authorization: `bearer ${token}` } });
	try {
		return await queryFn(gql);
	} catch (err) {
		if (isRateLimitError(err) && hasAppConfig()) {
			appTokenCache = null;
			const freshToken = await getAppInstallationToken(true);
			if (freshToken) {
				const freshGql = graphql.defaults({ headers: { authorization: `bearer ${freshToken}` } });
				return await queryFn(freshGql);
			}
		}
		if (isRateLimitError(err)) {
			throw new RateLimitError();
		}
		throw err;
	}
}

export function getUserClient(token: string) {
	return graphql.defaults({ headers: { authorization: `bearer ${token}` } });
}

export function getRepoOwner(): string {
	return getRequiredEnv('GITHUB_REPO_OWNER');
}

export function getRepoName(): string {
	return getRequiredEnv('GITHUB_REPO_NAME');
}

// ---------------------------------------------------------------------------
// Exported data functions (GraphQL via GitHub App or user token)
// ---------------------------------------------------------------------------

export async function fetchCategories(userToken?: string | null) {
	const cacheKey = 'categories';
	const cached = getCached<any[]>(cacheKey);
	if (cached) return cached;

	const owner = getRepoOwner();
	const repo = getRepoName();
	const token = await getReadToken(userToken);

	if (!token) throw new Error('No API token available. Please configure a GitHub App.');

	const result: any = await executeGraphQLRead(token, (gql) =>
		gql(
			`query($owner: String!, $repo: String!) {
				repository(owner: $owner, name: $repo) {
					discussionCategories(first: 20) {
						nodes { id name description emoji slug }
					}
				}
			}`,
			{ owner, repo }
		)
	);
	const categories = result.repository.discussionCategories.nodes;

	setCache(cacheKey, categories, 120);
	return categories;
}

export async function fetchCategoryBySlug(slug: string, userToken?: string | null) {
	const categories = await fetchCategories(userToken);
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

	const owner = getRepoOwner();
	const repo = getRepoName();
	const token = await getReadToken(userToken);

	if (!token) throw new Error('No API token available. Please configure a GitHub App.');

	const result: any = await executeGraphQLRead(token, (gql) =>
		gql(
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
		)
	);
	const discussions = result.repository.discussions;

	setCache(cacheKey, discussions, 60);
	return discussions;
}

export async function fetchThread(number: number, userToken?: string | null) {
	const cacheKey = `thread:${number}`;
	const cached = getCached<any>(cacheKey);
	if (cached) return cached;

	const owner = getRepoOwner();
	const repo = getRepoName();
	const token = await getReadToken(userToken);

	if (!token) throw new Error('No API token available. Please configure a GitHub App.');

	const result: any = await executeGraphQLRead(token, (gql) =>
		gql(
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
		)
	);
	const thread = result.repository.discussion;

	setCache(cacheKey, thread, 60);
	return thread;
}

export async function fetchRepoId(userToken?: string | null) {
	const cacheKey = 'repoId';
	const cached = getCached<string>(cacheKey);
	if (cached) return cached;

	const owner = getRepoOwner();
	const repo = getRepoName();
	const token = await getReadToken(userToken);

	if (!token) return null;

	const result: any = await executeGraphQLRead(token, (gql) =>
		gql(
			`query($owner: String!, $repo: String!) {
				repository(owner: $owner, name: $repo) { id }
			}`,
			{ owner, repo }
		)
	);

	const id = result.repository.id;
	setCache(cacheKey, id, 3600);
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

	const token = await getReadToken(userToken);
	if (!token) return null;

	const owner = getRepoOwner();
	const repo = getRepoName();
	const searchQuery = `${query} repo:${owner}/${repo} type:discussion`;

	const result: any = await executeGraphQLRead(token, (gql) =>
		gql(
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
		)
	);

	const search = result.search;
	setCache(cacheKey, search, 60);
	return search;
}
