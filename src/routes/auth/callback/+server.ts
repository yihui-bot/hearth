import { redirect, error } from '@sveltejs/kit';
import { env } from '$env/dynamic/private';
import type { RequestHandler } from './$types';

export const GET: RequestHandler = async ({ url, cookies }) => {
	const code = url.searchParams.get('code');
	const state = url.searchParams.get('state');
	const savedState = cookies.get('oauth_state');

	if (!code || !state || state !== savedState) {
		error(400, 'Invalid OAuth callback');
	}

	cookies.delete('oauth_state', { path: '/' });

	const clientId = env.GITHUB_OAUTH_CLIENT_ID;
	const clientSecret = env.GITHUB_OAUTH_CLIENT_SECRET;

	if (!clientId || !clientSecret) {
		error(500, 'OAuth not configured');
	}

	const tokenRes = await fetch('https://github.com/login/oauth/access_token', {
		method: 'POST',
		headers: {
			Accept: 'application/json',
			'Content-Type': 'application/json'
		},
		body: JSON.stringify({
			client_id: clientId,
			client_secret: clientSecret,
			code
		})
	});

	const tokenData = await tokenRes.json();

	if (!tokenData.access_token) {
		error(400, 'Failed to obtain access token');
	}

	cookies.set('gh_token', tokenData.access_token, {
		path: '/',
		httpOnly: true,
		secure: true,
		sameSite: 'lax',
		maxAge: 60 * 60 * 24 * 30 // 30 days
	});

	const redirectTo = cookies.get('oauth_redirect') || '/';
	cookies.delete('oauth_redirect', { path: '/' });

	redirect(302, redirectTo);
};
