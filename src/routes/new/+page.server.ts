import { fetchCategories, fetchRepoId, createDiscussion } from '$lib/server/github';
import { redirect, error } from '@sveltejs/kit';
import { slugify } from '$lib/utils';
import type { PageServerLoad, Actions } from './$types';

export const load: PageServerLoad = async ({ locals }) => {
	if (!locals.user) {
		redirect(302, '/auth/login?redirect=/new');
	}

	const categories = await fetchCategories();
	return { categories };
};

export const actions: Actions = {
	default: async ({ request, locals }) => {
		if (!locals.user || !locals.userToken) {
			error(401, 'Not authenticated');
		}

		const data = await request.formData();
		const title = data.get('title') as string;
		const categoryId = data.get('categoryId') as string;
		const body = data.get('body') as string;

		if (!title?.trim() || !categoryId || !body?.trim()) {
			return { error: 'All fields are required', title, categoryId, body };
		}

		const repoId = await fetchRepoId();
		const discussion = await createDiscussion(
			locals.userToken,
			repoId,
			categoryId,
			title.trim(),
			body.trim()
		);

		const slug = slugify(discussion.title);
		redirect(303, `/t/${discussion.number}/${slug}`);
	}
};
