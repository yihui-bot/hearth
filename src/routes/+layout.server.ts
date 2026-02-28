import type { LayoutServerLoad } from './$types';
import { env } from '$env/dynamic/private';

export const load: LayoutServerLoad = async ({ locals }) => {
	return {
		user: locals.user,
		forumTitle: env.FORUM_TITLE || 'Gitorum',
		forumLogoUrl: env.FORUM_LOGO_URL || '',
		forumFooterHtml: env.FORUM_FOOTER_HTML || ''
	};
};
