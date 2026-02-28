import { fetchCategories } from '$lib/server/github';
import type { PageServerLoad } from './$types';

export const load: PageServerLoad = async () => {
	const categories = await fetchCategories();
	return { categories };
};
