# Action Plan: Build a Lightweight Forum on Top of GitHub Discussions

## Project Overview

Build a standalone web forum UI powered by **GitHub Discussions as the data and auth backend**. The result should look and feel like a modern forum (inspired by waterhole.dev) but require zero backend infrastructure to manage. Users can browse as guests; posting requires a GitHub account. There is no image upload — users may link to external images in post text.

---

## Architecture

- **Frontend**: SvelteKit (preferred) or Next.js — SSR is required for SEO and guest performance
- **Data layer**: GitHub GraphQL API via Octokit (`@octokit/graphql`)
- **Auth**: GitHub OAuth App (not GitHub App) — standard OAuth 2.0 flow
- **Proxy**: SvelteKit/Next.js server-side routes act as the API proxy, attaching a server-side GitHub token to all read requests to avoid the 60 req/hr anonymous rate limit (authenticated server token gives 5,000 req/hr)
- **Hosting**: Vercel or Cloudflare Pages — free tier is sufficient; edge functions handle the proxy natively
- **No database. No user table. No file storage.**

---

## GitHub Setup (Prerequisites — Done Manually Before Coding)

1. Create a GitHub repository that will hold all Discussions data (can be a dedicated repo, e.g. `my-forum-data`)
2. Enable Discussions on that repository in GitHub settings
3. Create Discussion categories that map to your forum categories (e.g. "General", "Help", "Announcements")
4. Register a **GitHub OAuth App** at github.com/settings/developers:
   - Set the callback URL to `https://yourdomain.com/auth/callback`
   - Note the `Client ID` and `Client Secret`
5. Generate a **Personal Access Token** (or use a bot account token) with `read:discussion` scope for server-side read proxying

---

## Environment Variables

```
GITHUB_REPO_OWNER=your-org-or-username
GITHUB_REPO_NAME=your-forum-data-repo
GITHUB_SERVER_TOKEN=ghp_xxxx           # server-side read proxy token
GITHUB_OAUTH_CLIENT_ID=xxxx
GITHUB_OAUTH_CLIENT_SECRET=xxxx
BASE_URL=https://yourdomain.com
```

---

## Data Model Mapping

| Forum Concept     | GitHub Discussions Equivalent         |
|-------------------|---------------------------------------|
| Forum category    | Discussion category                   |
| Thread / post     | Discussion                            |
| Reply             | Comment on a Discussion               |
| Nested reply      | Reply to a comment                    |
| Author            | GitHub user (login, avatar_url)       |
| Reactions / likes | Discussion/comment reactions          |
| Pinned thread     | Pinned Discussion                     |
| Search            | GitHub search API                     |

---

## Pages to Build

### 1. `/` — Home / Category List
- Fetch all Discussion categories via GraphQL
- Display as forum-style category cards with name, description, and recent thread count
- No auth required

### 2. `/c/[category]` — Thread List
- Fetch paginated Discussions filtered by category
- Display as a thread list: title, author avatar + name, reply count, last activity timestamp
- Support sorting by: Latest, Top (most reactions), Unanswered
- No auth required

### 3. `/t/[id]/[slug]` — Thread Detail
- Fetch a single Discussion and all its comments/replies
- Render in a forum thread style: original post at top, replies below in chronological order
- Show reactions on each post
- If user is authenticated: show reply box at the bottom
- If guest: show "Log in with GitHub to reply" prompt
- No auth required to read

### 4. `/new` — Create New Thread
- Authenticated users only — redirect to login if not authenticated
- Form: title, category selector, body (markdown supported, plain textarea is fine)
- On submit: call GitHub GraphQL `createDiscussion` mutation using the user's OAuth token

### 5. `/search` — Search
- Use GitHub search API (`search/discussions`) scoped to the repo
- Display results like a thread list

### 6. `/auth/login` — Initiate OAuth
- Redirect user to GitHub OAuth authorization URL with correct scopes: `public_repo` (needed to post discussions)

### 7. `/auth/callback` — OAuth Callback
- Exchange code for access token via GitHub API
- Store access token in a secure httpOnly cookie (session)
- Redirect to previous page or home

### 8. `/auth/logout`
- Clear the session cookie
- Redirect to home

---

## Key GraphQL Operations to Implement

### Fetch categories
```graphql
query {
  repository(owner: $owner, name: $repo) {
    discussionCategories(first: 20) {
      nodes { id name description emoji slug }
    }
  }
}
```

### Fetch thread list by category
```graphql
query($categoryId: ID!, $after: String) {
  repository(owner: $owner, name: $repo) {
    discussions(first: 20, categoryId: $categoryId, after: $after) {
      pageInfo { hasNextPage endCursor }
      nodes {
        id number title createdAt
        author { login avatarUrl }
        comments { totalCount }
        reactions { totalCount }
      }
    }
  }
}
```

### Fetch single thread with replies
```graphql
query($number: Int!) {
  repository(owner: $owner, name: $repo) {
    discussion(number: $number) {
      id title body createdAt
      author { login avatarUrl url }
      reactions(first: 10) { nodes { content } totalCount }
      comments(first: 50) {
        nodes {
          id body createdAt
          author { login avatarUrl url }
          reactions(first: 10) { nodes { content } totalCount }
          replies(first: 20) {
            nodes {
              id body createdAt
              author { login avatarUrl url }
            }
          }
        }
      }
    }
  }
}
```

### Create a discussion (uses user's OAuth token)
```graphql
mutation($repoId: ID!, $categoryId: ID!, $title: String!, $body: String!) {
  createDiscussion(input: {
    repositoryId: $repoId
    categoryId: $categoryId
    title: $title
    body: $body
  }) {
    discussion { number url }
  }
}
```

### Add a comment (uses user's OAuth token)
```graphql
mutation($discussionId: ID!, $body: String!) {
  addDiscussionComment(input: {
    discussionId: $discussionId
    body: $body
  }) {
    comment { id createdAt }
  }
}
```

---

## Auth Flow Implementation

1. On `/auth/login`: redirect to `https://github.com/login/oauth/authorize?client_id=CLIENT_ID&scope=public_repo&state=RANDOM_STATE`
2. On `/auth/callback`: POST to `https://github.com/login/oauth/access_token` with code + client secret, receive `access_token`
3. Store `access_token` in a signed httpOnly cookie
4. On every request: read cookie, fetch `viewer { login avatarUrl }` to validate and hydrate user context
5. For mutations: use the user's token from the cookie as the `Authorization: bearer TOKEN` header in GraphQL calls

---

## Rate Limiting Strategy

- All **read requests** (fetching threads, categories, comments) go through server-side routes using the `GITHUB_SERVER_TOKEN` — never expose this token to the client
- All **write requests** (create discussion, add comment) use the authenticated user's own OAuth token — this is per-user so rate limits are per-user
- Cache category lists and thread lists aggressively (e.g. 60-second cache headers or SvelteKit's `load` caching) to reduce API calls

---

## Markdown Rendering

- GitHub stores and returns body content as raw Markdown
- Use `marked` or `remark` + `rehype` on the client/server to render it to HTML
- Apply sanitization with `DOMPurify` or `rehype-sanitize` to prevent XSS
- Do not build a rich text editor — a plain `<textarea>` with a markdown preview toggle is sufficient and matches GitHub's own UX

---

## Styling Goals (Waterhole-Inspired)

- Clean, content-first layout with a left sidebar for categories
- Thread list with user avatars, reply counts, and timestamps
- No heavy UI framework — Tailwind CSS is sufficient
- Mobile-responsive
- Dark mode support via Tailwind's `dark:` classes
- No image upload UI — remove or hide any affordance for it

---

## Deployment

1. Push to GitHub
2. Connect repo to Vercel or Cloudflare Pages
3. Set all environment variables in the hosting dashboard
4. Set the OAuth callback URL in your GitHub OAuth App settings to match your production domain
5. Done — no server to manage, no database to provision

---

## Out of Scope (Deliberately)

- Image uploads (users can paste external image URLs in markdown)
- Email notifications (GitHub handles this natively for watched discussions)
- User profile customization (GitHub profiles are used as-is)
- Moderation tooling beyond what GitHub already provides (close discussion, lock, delete)
- Custom user roles (GitHub repo collaborators can moderate via GitHub directly)
