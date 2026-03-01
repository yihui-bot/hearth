import { marked } from 'marked';

// Note: no HTML sanitization here — this function is only called with admin-controlled
// content (FORUM_FOOTER_HTML env var). Do not use it with user-generated content.
export function renderMarkdown(markdown: string): string {
	return marked.parse(markdown, { async: false }) as string;
}
