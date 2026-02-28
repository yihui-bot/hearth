import { fetchThread } from '$lib/server/github';
import { error } from '@sveltejs/kit';
import type { PageServerLoad } from './$types';

export const load: PageServerLoad = async ({ params }) => {
	const number = parseInt(params.number, 10);
	if (isNaN(number)) error(400, 'Invalid thread number');

	const thread = await fetchThread(number);
	if (!thread) error(404, 'Thread not found');

	return { thread };
};
