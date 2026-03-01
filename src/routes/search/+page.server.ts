import { searchDiscussions } from '$lib/server/github';
import { error } from '@sveltejs/kit';
import type { PageServerLoad } from './$types';

export const load: PageServerLoad = async ({ url, locals }) => {
	const q = url.searchParams.get('q') || '';
	const after = url.searchParams.get('after') || undefined;

	if (!q.trim()) {
		return { query: q, results: [], pageInfo: null, totalCount: 0 };
	}

	try {
		const search = await searchDiscussions(q.trim(), 20, after, locals.userToken);

		if (!search) {
			return { query: q, results: [], pageInfo: null, totalCount: 0 };
		}

		return {
			query: q,
			results: search.nodes,
			pageInfo: search.pageInfo,
			totalCount: search.discussionCount
		};
	} catch (err) {
		error(503, err instanceof Error ? err.message : 'Search unavailable');
	}
};
