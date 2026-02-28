import { fetchCategoryBySlug, fetchThreadsByCategory } from '$lib/server/github';
import { error } from '@sveltejs/kit';
import type { PageServerLoad } from './$types';

export const load: PageServerLoad = async ({ params, url }) => {
	const category = await fetchCategoryBySlug(params.slug);
	if (!category) error(404, 'Category not found');

	const after = url.searchParams.get('after') || undefined;
	const sort = url.searchParams.get('sort') || 'UPDATED_AT';

	const orderBy = sort === 'CREATED_AT' ? 'CREATED_AT' : 'UPDATED_AT';
	const discussions = await fetchThreadsByCategory(category.id, 20, after, orderBy);

	return {
		category,
		threads: discussions.nodes,
		pageInfo: discussions.pageInfo,
		sort
	};
};
