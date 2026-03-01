import { redirect } from '@sveltejs/kit';
import { env } from '$env/dynamic/private';
import type { RequestHandler } from './$types';

export const GET: RequestHandler = async ({ url, cookies }) => {
	const clientId = env.GITHUB_OAUTH_CLIENT_ID;
	if (!clientId) throw new Error('Missing GITHUB_OAUTH_CLIENT_ID');

	const baseUrl = env.BASE_URL || url.origin;
	const state = crypto.randomUUID();

	cookies.set('oauth_state', state, {
		path: '/',
		httpOnly: true,
		secure: true,
		sameSite: 'lax',
		maxAge: 600
	});

	const redirectTo = url.searchParams.get('redirect') || '/';
	cookies.set('oauth_redirect', redirectTo, {
		path: '/',
		httpOnly: true,
		secure: true,
		sameSite: 'lax',
		maxAge: 600
	});

	const authUrl = new URL('https://github.com/login/oauth/authorize');
	authUrl.searchParams.set('client_id', clientId);
	authUrl.searchParams.set('redirect_uri', `${baseUrl}/auth/callback`);
	authUrl.searchParams.set('scope', 'public_repo');
	authUrl.searchParams.set('state', state);

	redirect(302, authUrl.toString());
};
