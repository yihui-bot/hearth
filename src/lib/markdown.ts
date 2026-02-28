import { marked } from 'marked';
import DOMPurify from 'isomorphic-dompurify';

export function renderMarkdown(markdown: string): string {
	const raw = marked.parse(markdown, { async: false }) as string;
	return DOMPurify.sanitize(raw);
}
