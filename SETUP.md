# Gitorum — Admin Setup Guide

This guide walks you through setting up Gitorum as a forum administrator.

---

## 1. Prerequisites

1. **A GitHub repository with Discussions enabled**
   - Go to your repo → Settings → General → scroll to "Features" → check "Discussions"
   - Create Discussion categories that map to your forum categories (e.g. "General", "Help", "Announcements")

2. **Node.js 18+** installed locally for development

---

## 2. Environment Variables

Copy `.env.example` to `.env` and fill in the values:

```bash
cp .env.example .env
```

### Required

| Variable | Description |
|----------|-------------|
| `GITHUB_REPO_OWNER` | GitHub username or org that owns the Discussions repo |
| `GITHUB_REPO_NAME` | Name of the repo with Discussions enabled |

### Optional — Authentication (for posting)

| Variable | Description |
|----------|-------------|
| `GITHUB_OAUTH_CLIENT_ID` | From your GitHub OAuth App |
| `GITHUB_OAUTH_CLIENT_SECRET` | From your GitHub OAuth App |
| `BASE_URL` | Your production URL (e.g. `https://forum.example.com`) |

### Optional — Customization

| Variable | Description |
|----------|-------------|
| `FORUM_TITLE` | Custom forum title (default: `Gitorum`) |
| `FORUM_LOGO_URL` | URL to a custom logo image (replaces the default SVG icon) |
| `FORUM_FOOTER_HTML` | Custom footer content in Markdown format (rendered and sanitized before display) |

### API Rate Limits

Gitorum reads from the GitHub API. Without any server-side token, it uses anonymous access (**60 requests/hour**). This is fine for personal or low-traffic forums.

For higher traffic, set up a **GitHub App** (see below) which provides **5,000 requests/hour** with automatic token renewal. When a GitHub App token hits its rate limit, Gitorum automatically requests a fresh token and retries.

---

## 3. Setting Up a GitHub App (Recommended for Production)

A GitHub App provides automatic short-lived token generation (tokens expire after 1 hour and are renewed automatically). When a token's rate limit is exhausted, Gitorum will automatically generate a new one and retry the request.

### Step 1: Create the GitHub App

1. Go to **Settings → Developer settings → GitHub Apps → New GitHub App**
   (Direct link: https://github.com/settings/apps/new)

2. Fill in the form:
   - **GitHub App name**: `Gitorum Forum` (or any unique name)
   - **Homepage URL**: Your forum's URL
   - **Webhook**: Uncheck "Active" (not needed)

3. Set **Permissions**:
   - Under "Repository permissions":
     - **Discussions**: Read-only
     - **Metadata**: Read-only (auto-selected)
   - No other permissions needed

4. Under "Where can this GitHub App be installed?": Select "Only on this account"

5. Click **Create GitHub App**

### Step 2: Generate a Private Key

1. On the App settings page, scroll to "Private keys"
2. Click **Generate a private key**
3. A `.pem` file will download — keep it safe

### Step 3: Install the App on Your Repo

1. Go to your App's page → "Install App" tab
2. Click **Install** next to your account
3. Select "Only select repositories" → choose your Discussions repository
4. Click **Install**

### Step 4: Gather the IDs

You need three values:

| Variable | Where to find it |
|----------|-----------------|
| `GITHUB_APP_ID` | Your App's settings page → "App ID" at the top |
| `GITHUB_APP_PRIVATE_KEY` | Contents of the `.pem` file (replace newlines with `\n` for env vars) |
| `GITHUB_APP_INSTALLATION_ID` | Go to Settings → Integrations → your app → the number in the URL (e.g. `https://github.com/settings/installations/12345678` → `12345678`) |

### Step 5: Set Environment Variables

```
GITHUB_APP_ID=123456
GITHUB_APP_PRIVATE_KEY="-----BEGIN RSA PRIVATE KEY-----\nMIIE...\n-----END RSA PRIVATE KEY-----"
GITHUB_APP_INSTALLATION_ID=12345678
```

When these are set, Gitorum will automatically generate short-lived installation tokens for read requests and renew them when they expire or hit rate limits.

---

## 4. Setting Up GitHub OAuth (for user sign-in)

This allows users to sign in and create threads/replies.

1. Go to **Settings → Developer settings → OAuth Apps → New OAuth App**
   (Direct link: https://github.com/settings/developers)

2. Fill in the form:
   - **Application name**: `Gitorum`
   - **Homepage URL**: `https://yourdomain.com`
   - **Authorization callback URL**: `https://yourdomain.com/auth/callback`

3. Click **Register application**

4. Copy the **Client ID** and generate a **Client Secret**

5. Set in your `.env`:
   ```
   GITHUB_OAUTH_CLIENT_ID=Iv1.xxxxxxxxx
   GITHUB_OAUTH_CLIENT_SECRET=xxxxxxxxxxxxxxxxxx
   BASE_URL=https://yourdomain.com
   ```

---

## 5. Caching Strategy

Gitorum uses two layers of caching to minimize GitHub API usage:

### Layer 1: Server-Side In-Memory Cache (built-in)

All read operations are cached in memory on the SvelteKit server:

| Data | TTL |
|------|-----|
| Categories | 2 minutes |
| Thread lists | 1 minute |
| Thread detail | 1 minute |
| Search results | 1 minute |
| Repo ID | 1 hour |

This reduces redundant API calls within a single server process.

### Layer 2: HTTP Cache Headers (for CDN/Cloudflare)

All read pages return `Cache-Control` headers with `s-maxage` for CDN/edge caching.

### Setting Up Cloudflare Caching

If you deploy to **Cloudflare Pages** or put Cloudflare in front of your deployment:

1. **Go to**: Cloudflare Dashboard → your domain → Caching → Configuration

2. **Browser Cache TTL**: Set to "Respect existing headers" (so our `Cache-Control` headers are honored)

3. **Create a Cache Rule** (Rules → Cache Rules → Create rule):
   - **Rule name**: `Forum page cache`
   - **When**: Custom filter expression:
     ```
     (http.request.uri.path eq "/" or
      http.request.uri.path matches "^/c/.*" or
      http.request.uri.path matches "^/t/.*" or
      http.request.uri.path matches "^/search.*")
     ```
   - **Then**: Eligible for cache
     - **Edge TTL**: Override — `60 seconds`
     - **Browser TTL**: Override — `60 seconds`

4. **Exclude auth routes** — The `/auth/*` and `/api/*` routes should **not** be cached. If needed, create an exclusion rule:
   - **When**: `http.request.uri.path matches "^/(auth|api)/.*"`
   - **Then**: Bypass cache

5. (Optional) **Cloudflare Workers** — For more control, you can use a Cloudflare Worker to add caching logic. Cloudflare Pages Functions already support `Cache-Control` headers natively.

### Cloudflare Page Rules (alternative)

If you prefer Page Rules:
- `yourdomain.com/` → Cache Level: Cache Everything, Edge Cache TTL: 2 minutes
- `yourdomain.com/c/*` → Cache Level: Cache Everything, Edge Cache TTL: 1 minute
- `yourdomain.com/t/*` → Cache Level: Cache Everything, Edge Cache TTL: 1 minute
- `yourdomain.com/auth/*` → Cache Level: Bypass
- `yourdomain.com/api/*` → Cache Level: Bypass

---

## 6. Deployment

### Cloudflare Pages (recommended)

1. Push your code to GitHub
2. Go to Cloudflare Dashboard → Workers & Pages → Create → Pages → Connect to Git
3. Select your repository and configure:
   - **Build command**: `npm run build`
   - **Build output directory**: `.svelte-kit/cloudflare`
   - **Node.js version**: `18` or later
4. Add all environment variables in Settings → Environment variables
5. Set the OAuth callback URL in your GitHub OAuth App to match your production domain

### Vercel

1. Push your code to GitHub
2. Import the repo in Vercel dashboard
3. Vercel auto-detects SvelteKit — no special config needed
4. Add all environment variables in Project Settings → Environment Variables
5. Set the OAuth callback URL in your GitHub OAuth App to match your production domain

---

## 7. Complete Environment Variables Reference

```bash
# Required
GITHUB_REPO_OWNER=your-org-or-username
GITHUB_REPO_NAME=your-forum-data-repo

# GitHub App (recommended for production)
GITHUB_APP_ID=123456
GITHUB_APP_PRIVATE_KEY="-----BEGIN RSA PRIVATE KEY-----\n...\n-----END RSA PRIVATE KEY-----"
GITHUB_APP_INSTALLATION_ID=12345678

# OAuth (for user sign-in/posting)
GITHUB_OAUTH_CLIENT_ID=Iv1.xxxxxxxxx
GITHUB_OAUTH_CLIENT_SECRET=xxxxxxxxxxxxxxxxxx
BASE_URL=https://yourdomain.com

# Customization (optional)
FORUM_TITLE=My Forum
FORUM_LOGO_URL=https://example.com/logo.svg
FORUM_FOOTER_HTML=Powered by [Gitorum](https://github.com) · [My Site](https://example.com)
```
