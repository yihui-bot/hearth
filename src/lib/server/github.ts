import { graphql } from '@octokit/graphql';
import { env } from '$env/dynamic/private';
import { renderMarkdown } from '$lib/markdown';

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

	const privateKey = privateKeyRaw.replace(/\\n/g, '\n');

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
// REST API fallback (for anonymous access — 60 req/hr, no auth needed)
// ---------------------------------------------------------------------------

const emojiShortcodes: Record<string, string> = {
	':speech_balloon:': '💬', ':mega:': '📣', ':bulb:': '💡',
	':pray:': '🙏', ':raised_hands:': '🙌', ':star:': '⭐',
	':star2:': '🌟', ':question:': '❓', ':books:': '📚',
	':hammer_and_wrench:': '🛠️', ':handshake:': '🤝', ':tada:': '🎉',
	':rocket:': '🚀', ':bug:': '🐛', ':sparkles:': '✨',
	':art:': '🎨', ':zap:': '⚡', ':recycle:': '♻️',
	':lock:': '🔒', ':bookmark:': '🔖', ':construction:': '🚧',
	':pencil:': '✏️', ':pencil2:': '✏️', ':package:': '📦',
	':fire:': '🔥', ':memo:': '📝', ':heart:': '❤️',
	':thumbsup:': '👍', ':thumbsdown:': '👎', ':eyes:': '👀',
	':100:': '💯', ':white_check_mark:': '✅', ':x:': '❌',
	':warning:': '⚠️', ':information_source:': 'ℹ️', ':gear:': '⚙️',
	':wrench:': '🔧', ':link:': '🔗', ':wave:': '👋',
	':newspaper:': '📰', ':loudspeaker:': '📢', ':trophy:': '🏆',
	':label:': '🏷️', ':pushpin:': '📌', ':chart_with_upwards_trend:': '📈',
	':clipboard:': '📋', ':earth_americas:': '🌎',
};

function convertEmoji(code: string | null | undefined): string {
	if (!code) return '';
	return emojiShortcodes[code] || '';
}

/** Persistent map: category node_id → numeric REST id */
const categoryNumericIdMap = new Map<string, number>();

async function restGet(path: string): Promise<any> {
	const res = await fetch(`https://api.github.com${path}`, {
		headers: {
			'Accept': 'application/vnd.github+json',
			'User-Agent': 'Gitorum',
			'X-GitHub-Api-Version': '2022-11-28'
		}
	});

	if (res.status === 403 || res.status === 429) {
		const text = await res.text();
		if (text.toLowerCase().includes('rate limit')) {
			throw new RateLimitError();
		}
		throw new Error(`GitHub REST API error: ${res.status} - ${text}`);
	}

	if (!res.ok) {
		throw new Error(`GitHub REST API error: ${res.status}`);
	}

	return res.json();
}

function normalizeRestAuthor(user: any): any {
	if (!user) return null;
	return {
		login: user.login,
		avatarUrl: user.avatar_url,
		url: user.html_url
	};
}

function normalizeRestReactions(reactions: any): any {
	if (!reactions) return { nodes: [], totalCount: 0 };

	const mapping: Record<string, string> = {
		'+1': 'THUMBS_UP', '-1': 'THUMBS_DOWN', 'laugh': 'LAUGH',
		'hooray': 'HOORAY', 'confused': 'CONFUSED', 'heart': 'HEART',
		'rocket': 'ROCKET', 'eyes': 'EYES'
	};

	const nodes: any[] = [];
	for (const [key, graphqlName] of Object.entries(mapping)) {
		const count = reactions[key];
		if (count && count > 0) {
			for (let i = 0; i < count; i++) {
				nodes.push({ content: graphqlName });
			}
		}
	}

	return {
		nodes,
		totalCount: reactions.total_count || 0
	};
}

async function fetchCategoriesViaRest(owner: string, repo: string): Promise<any[]> {
	// The REST API doesn't have a standalone categories endpoint, so we
	// extract unique categories from the discussions list.
	const data = await restGet(`/repos/${owner}/${repo}/discussions?per_page=100`);
	const seen = new Map<number, any>();
	for (const d of data) {
		const c = d.category;
		if (c && !seen.has(c.id)) {
			categoryNumericIdMap.set(c.node_id, c.id);
			seen.set(c.id, {
				id: c.node_id,
				name: c.name,
				description: c.description || '',
				emoji: convertEmoji(c.emoji),
				slug: c.slug
			});
		}
	}
	return Array.from(seen.values());
}

async function fetchThreadsViaRest(
	owner: string,
	repo: string,
	categoryNodeId: string,
	first: number,
	after: string | undefined,
	orderBy: string
): Promise<any> {
	let numericId = categoryNumericIdMap.get(categoryNodeId);
	if (!numericId) {
		// Populate the map by fetching categories
		await fetchCategoriesViaRest(owner, repo);
		numericId = categoryNumericIdMap.get(categoryNodeId);
		if (!numericId) return { nodes: [], pageInfo: { hasNextPage: false, endCursor: '' } };
	}

	const page = after && /^\d+$/.test(after) ? parseInt(after) : 1;
	const sort = orderBy === 'CREATED_AT' ? 'created' : 'updated';

	const data = await restGet(
		`/repos/${owner}/${repo}/discussions?category_id=${numericId}&per_page=${first}&page=${page}&sort=${sort}&direction=desc`
	);

	const nodes = data.map((d: any) => ({
		id: d.node_id,
		number: d.number,
		title: d.title,
		createdAt: d.created_at,
		author: normalizeRestAuthor(d.user),
		comments: { totalCount: d.comments },
		reactions: { totalCount: d.reactions?.total_count || 0 }
	}));

	const hasNextPage = nodes.length >= first;
	const endCursor = hasNextPage ? String(page + 1) : '';

	return { nodes, pageInfo: { hasNextPage, endCursor } };
}

async function fetchThreadViaRest(owner: string, repo: string, number: number): Promise<any> {
	const discussion = await restGet(`/repos/${owner}/${repo}/discussions/${number}`);

	// Fetch comments (separate API call)
	let commentNodes: any[] = [];
	try {
		const commentsData = await restGet(
			`/repos/${owner}/${repo}/discussions/${number}/comments?per_page=50`
		);
		commentNodes = commentsData.map((c: any) => ({
			id: c.node_id,
			body: c.body,
			bodyHTML: renderMarkdown(c.body || ''),
			createdAt: c.created_at,
			author: normalizeRestAuthor(c.user),
			reactions: normalizeRestReactions(c.reactions),
			replies: { nodes: [] }
		}));
	} catch {
		// If comments fail (e.g., rate limit), show thread without comments
	}

	return {
		id: discussion.node_id,
		title: discussion.title,
		body: discussion.body,
		bodyHTML: renderMarkdown(discussion.body || ''),
		createdAt: discussion.created_at,
		author: normalizeRestAuthor(discussion.user),
		category: {
			name: discussion.category?.name || '',
			slug: discussion.category?.slug || ''
		},
		reactions: normalizeRestReactions(discussion.reactions),
		comments: {
			totalCount: discussion.comments,
			pageInfo: { hasNextPage: false, endCursor: '' },
			nodes: commentNodes
		}
	};
}

// ---------------------------------------------------------------------------
// GraphQL client helpers
// ---------------------------------------------------------------------------

function getRequiredEnv(key: string): string {
	const value = env[key];
	if (!value) throw new Error(`Missing environment variable: ${key}`);
	return value;
}

/** Best available server-side read token (GitHub App only, no PAT). */
async function getServerToken(): Promise<string | null> {
	return await getAppInstallationToken();
}

/** Returns the best available token for read operations, or null for REST fallback. */
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
// Exported data functions (GraphQL with App/user token, REST fallback)
// ---------------------------------------------------------------------------

export async function fetchCategories(userToken?: string | null) {
	const cacheKey = 'categories';
	const cached = getCached<any[]>(cacheKey);
	if (cached) return cached;

	const owner = getRepoOwner();
	const repo = getRepoName();
	const token = await getReadToken(userToken);

	let categories;
	if (token) {
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
		categories = result.repository.discussionCategories.nodes;
	} else {
		categories = await fetchCategoriesViaRest(owner, repo);
	}

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

	let discussions;
	if (token) {
		// Skip REST-format page numbers for GraphQL cursors
		const graphqlAfter = after && !/^\d+$/.test(after) ? after : undefined;
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
				{ owner, repo, categoryId, first, after: graphqlAfter || null, orderBy }
			)
		);
		discussions = result.repository.discussions;
	} else {
		discussions = await fetchThreadsViaRest(owner, repo, categoryId, first, after, orderBy);
	}

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

	let thread;
	if (token) {
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
		thread = result.repository.discussion;
	} else {
		thread = await fetchThreadViaRest(owner, repo, number);
	}

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
