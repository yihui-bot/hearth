import type { LayoutServerLoad } from './$types';
import { env } from '$env/dynamic/private';
import { renderMarkdown } from '$lib/markdown';

export const load: LayoutServerLoad = async ({ locals }) => {
	// Sanitize admin-provided footer HTML for defense-in-depth
	const rawFooter = env.FORUM_FOOTER_HTML || '';
	const footerHtml = rawFooter ? renderMarkdown(rawFooter) : '';

	return {
		user: locals.user,
		forumTitle: env.FORUM_TITLE || 'Gitorum',
		forumLogoUrl: env.FORUM_LOGO_URL || '',
		forumFooterHtml: footerHtml
	};
};
