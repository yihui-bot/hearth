import { fetchCategoryBySlug, fetchThreadsByPage, RateLimitError } from '$lib/server/github';
import { error } from '@sveltejs/kit';
import type { PageServerLoad } from './$types';

const PER_PAGE = 20;

export const load: PageServerLoad = async ({ params, url, locals, setHeaders }) => {
	try {
		const category = await fetchCategoryBySlug(params.slug, locals.userToken);
		if (!category) error(404, 'Category not found');

		const page = Math.max(1, parseInt(url.searchParams.get('page') || '1', 10) || 1);
		const sort = url.searchParams.get('sort') || 'UPDATED_AT';
		const orderBy = sort === 'CREATED_AT' ? 'CREATED_AT' : 'UPDATED_AT';

		const discussions = await fetchThreadsByPage(category.id, page, PER_PAGE, orderBy, locals.userToken);

		setHeaders({ 'Cache-Control': 'public, max-age=60, s-maxage=60, stale-while-revalidate=120' });

		const totalCount: number = discussions?.totalCount ?? 0;
		const totalPages = Math.max(1, Math.ceil(totalCount / PER_PAGE));

		return {
			category,
			threads: discussions?.nodes || [],
			page,
			totalPages,
			totalCount,
			sort,
			rateLimited: false
		};
	} catch (err) {
		if (err instanceof RateLimitError) {
			return {
				category: { name: params.slug.replace(/-/g, ' '), slug: params.slug, emoji: '', description: '', id: '' },
				threads: [],
				page: 1,
				totalPages: 1,
				totalCount: 0,
				sort: 'UPDATED_AT',
				rateLimited: true
			};
		}
		error(503, err instanceof Error ? err.message : 'Failed to load category');
	}
};
