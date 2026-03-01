import { fetchCategories, RateLimitError } from '$lib/server/github';
import type { PageServerLoad } from './$types';

export const load: PageServerLoad = async ({ locals, setHeaders }) => {
	setHeaders({ 'Cache-Control': 'public, max-age=120, s-maxage=120, stale-while-revalidate=300' });
	try {
		const categories = await fetchCategories(locals.userToken);
		return { categories, rateLimited: false };
	} catch (err) {
		if (err instanceof RateLimitError) {
			return { categories: null, rateLimited: true };
		}
		throw err;
	}
};
