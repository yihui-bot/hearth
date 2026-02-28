import { fetchThread } from '$lib/server/github';
import { error } from '@sveltejs/kit';
import type { PageServerLoad } from './$types';

export const load: PageServerLoad = async ({ params, locals, setHeaders }) => {
	const number = parseInt(params.number, 10);
	if (isNaN(number)) error(400, 'Invalid thread number');

	const thread = await fetchThread(number, locals.userToken);
	if (!thread) error(404, 'Thread not found');

	setHeaders({ 'Cache-Control': 'public, max-age=60, s-maxage=60, stale-while-revalidate=120' });

	return { thread };
};
