import { fetchCategories, fetchLatestDiscussions, fetchPinnedDiscussions, RateLimitError } from '$lib/server/github';
import { error } from '@sveltejs/kit';
import type { PageServerLoad } from './$types';

export const load: PageServerLoad = async ({ locals, setHeaders }) => {
	setHeaders({ 'Cache-Control': 'public, max-age=60, s-maxage=60, stale-while-revalidate=120' });
	try {
		const [categories, latest, pinned] = await Promise.all([
			fetchCategories(locals.userToken),
			fetchLatestDiscussions(30, locals.userToken),
			fetchPinnedDiscussions(locals.userToken)
		]);
		return { categories, latest, pinned, rateLimited: false };
	} catch (err) {
		if (err instanceof RateLimitError) {
			return { categories: null, latest: [], pinned: [], rateLimited: true };
		}
		error(503, err instanceof Error ? err.message : 'Failed to load categories');
	}
};
