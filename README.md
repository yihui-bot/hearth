# Gitorum

**Git + Forum** — A lightweight forum UI powered by [GitHub Discussions](https://docs.github.com/en/discussions) as the data and auth backend.

Gitorum looks and feels like a modern forum but requires **zero backend infrastructure** to manage. Users can browse as guests; posting requires a GitHub account. There is no database, no user table, and no file storage — GitHub is the entire backend.

## Features

- 📁 **Category browsing** — maps to GitHub Discussion categories
- 💬 **Thread list & detail** — full discussion rendering with comments and nested replies
- ✍️ **Create threads & reply** — via GitHub GraphQL API using the user's own OAuth token
- 🔍 **Search** — powered by GitHub's search API
- 🔐 **GitHub OAuth** — sign in with your GitHub account
- 🌙 **Dark mode** — automatic via Tailwind CSS
- 📱 **Responsive** — mobile-first design
- ⚡ **Server-side caching** — in-memory + HTTP cache headers for Cloudflare/CDN
- 🤖 **GitHub App support** — auto-generate short-lived tokens to avoid rate limits
- 🎨 **Customizable** — configure forum title, logo, and footer via environment variables

## Quick Start

```bash
# Install dependencies
npm install

# Copy and fill in environment variables
cp .env.example .env

# Start dev server
npm run dev
```

At minimum, set `GITHUB_REPO_OWNER` and `GITHUB_REPO_NAME` to point at a repository with Discussions enabled. The forum works immediately with anonymous API access (60 req/hr). See [SETUP.md](SETUP.md) for full configuration including GitHub App and OAuth setup.

## Documentation

- **[SETUP.md](SETUP.md)** — Admin setup guide: environment variables, GitHub App, OAuth, Cloudflare caching
- **[IMPLEMENTATION.md](IMPLEMENTATION.md)** — Architecture and implementation plan

## Tech Stack

- [SvelteKit](https://kit.svelte.dev/) — SSR framework
- [Tailwind CSS v4](https://tailwindcss.com/) — styling
- [Octokit GraphQL](https://github.com/octokit/graphql.js) — GitHub API client
- [marked](https://marked.js.org/) + [DOMPurify](https://github.com/cure53/DOMPurify) — Markdown rendering with XSS protection

## License

MIT
