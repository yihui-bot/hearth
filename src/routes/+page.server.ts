import { fetchCategories } from '$lib/server/github';
import type { PageServerLoad } from './$types';

export const load: PageServerLoad = async ({ locals, setHeaders }) => {
	setHeaders({ 'Cache-Control': 'public, max-age=120, s-maxage=120, stale-while-revalidate=300' });
	const categories = await fetchCategories(locals.userToken);
	return { categories };
};
