import type { Handle } from '@sveltejs/kit';
import { env } from '$env/dynamic/private';

export const handle: Handle = async ({ event, resolve }) => {
	const token = event.cookies.get('gh_token');

	if (token) {
		try {
			const res = await fetch('https://api.github.com/graphql', {
				method: 'POST',
				headers: {
					Authorization: `bearer ${token}`,
					'Content-Type': 'application/json'
				},
				body: JSON.stringify({
					query: '{ viewer { login avatarUrl } }'
				})
			});

			if (res.ok) {
				const json = await res.json();
				if (json.data?.viewer) {
					event.locals.user = json.data.viewer;
					event.locals.userToken = token;
				}
			} else if (res.status === 401) {
				// Token explicitly rejected — clear it so the user can re-authenticate
				event.cookies.delete('gh_token', { path: '/' });
			}
			// For other non-OK statuses (5xx etc.) keep the token; treat as
			// anonymous for this request only so a transient GitHub outage does
			// not permanently sign the user out.
		} catch {
			// Network error — keep the token and treat as anonymous for this
			// request only; do NOT delete so a transient error doesn't sign out
			// the user permanently.
		}
	}

	if (!event.locals.user) {
		event.locals.user = null;
		event.locals.userToken = null;
	}

	return resolve(event, { preload: ({ type }) => type !== 'css' });
};
