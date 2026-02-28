import { graphql } from '@octokit/graphql';
import { env } from '$env/dynamic/private';

function getEnv(key: string): string {
	const value = env[key];
	if (!value) throw new Error(`Missing environment variable: ${key}`);
	return value;
}

export function getServerClient() {
	return graphql.defaults({
		headers: {
			authorization: `bearer ${getEnv('GITHUB_SERVER_TOKEN')}`
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
	return getEnv('GITHUB_REPO_OWNER');
}

export function getRepoName(): string {
	return getEnv('GITHUB_REPO_NAME');
}

export async function fetchCategories() {
	const gql = getServerClient();
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

	return result.repository.discussionCategories.nodes;
}

export async function fetchCategoryBySlug(slug: string) {
	const categories = await fetchCategories();
	return categories.find((c: any) => c.slug === slug) || null;
}

export async function fetchThreadsByCategory(
	categoryId: string,
	first: number = 20,
	after?: string,
	orderBy: string = 'UPDATED_AT'
) {
	const gql = getServerClient();
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

	return result.repository.discussions;
}

export async function fetchThread(number: number) {
	const gql = getServerClient();
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

	return result.repository.discussion;
}

export async function fetchRepoId() {
	const gql = getServerClient();
	const owner = getRepoOwner();
	const repo = getRepoName();

	const result: any = await gql(
		`query($owner: String!, $repo: String!) {
			repository(owner: $owner, name: $repo) { id }
		}`,
		{ owner, repo }
	);

	return result.repository.id;
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

export async function searchDiscussions(query: string, first: number = 20, after?: string) {
	const gql = getServerClient();
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

	return result.search;
}
