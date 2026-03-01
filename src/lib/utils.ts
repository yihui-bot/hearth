export function slugify(text: string): string {
	return text
		.toLowerCase()
		.replace(/[^a-z0-9]+/g, '-')
		.replace(/(^-|-$)+/g, '');
}

export function formatDate(dateString: string): string {
	return new Date(dateString).toLocaleDateString(undefined, {
		year: 'numeric',
		month: 'short',
		day: 'numeric'
	});
}

export function reactionEmoji(content: string): string {
	const map: Record<string, string> = {
		THUMBS_UP: '👍',
		THUMBS_DOWN: '👎',
		LAUGH: '😄',
		HOORAY: '🎉',
		CONFUSED: '😕',
		HEART: '❤️',
		ROCKET: '🚀',
		EYES: '👀'
	};
	return map[content] || content;
}
