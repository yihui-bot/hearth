import { isAnonymousMode } from '$lib/server/github';
import type { LayoutServerLoad } from './$types';

export const load: LayoutServerLoad = async ({ locals }) => {
	return {
		user: locals.user,
		anonymousMode: await isAnonymousMode()
	};
};
