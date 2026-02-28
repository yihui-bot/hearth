import { fetchCategoryBySlug, fetchThreadsByCategory, RateLimitError } from '$lib/server/github';
import { error } from '@sveltejs/kit';
import type { PageServerLoad } from './$types';

export const load: PageServerLoad = async ({ params, url, locals, setHeaders }) => {
	try {
		const category = await fetchCategoryBySlug(params.slug, locals.userToken);
		if (!category) error(404, 'Category not found');

		const after = url.searchParams.get('after') || undefined;
		const sort = url.searchParams.get('sort') || 'UPDATED_AT';

		const orderBy = sort === 'CREATED_AT' ? 'CREATED_AT' : 'UPDATED_AT';
		const discussions = await fetchThreadsByCategory(category.id, 20, after, orderBy, locals.userToken);

		setHeaders({ 'Cache-Control': 'public, max-age=60, s-maxage=60, stale-while-revalidate=120' });

		return {
			category,
			threads: discussions?.nodes || [],
			pageInfo: discussions?.pageInfo || { hasNextPage: false, endCursor: '' },
			sort,
			rateLimited: false
		};
	} catch (err) {
		if (err instanceof RateLimitError) {
			return {
				category: { name: params.slug, slug: params.slug, emoji: '', description: '', id: '' },
				threads: [],
				pageInfo: { hasNextPage: false, endCursor: '' },
				sort: 'UPDATED_AT',
				rateLimited: true
			};
		}
		throw err;
	}
};
