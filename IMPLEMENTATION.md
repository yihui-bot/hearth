# Gitorum — Implementation Plan

## Architecture

- **Frontend**: SvelteKit — SSR is required for SEO and guest performance
- **Data layer**: GitHub GraphQL API via Octokit (`@octokit/graphql`)
- **Auth**: GitHub OAuth App — standard OAuth 2.0 flow
- **Token strategy**:
  1. **GitHub App installation tokens** (preferred) — auto-generated, short-lived, 5,000 req/hr
  2. **Personal Access Token** (fallback) — set `GITHUB_SERVER_TOKEN`, 5,000 req/hr
  3. **Anonymous** — no token configured, 60 req/hr with user login prompt
- **Caching**: Two-layer — in-memory server cache + HTTP `Cache-Control` headers for CDN/edge
- **Hosting**: Cloudflare Pages or Vercel — free tier is sufficient
- **No database. No user table. No file storage.**

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

## Pages

### 1. `/` — Home / Category List
- Fetch all Discussion categories via GraphQL
- Display as forum-style category cards with name, description, and emoji
- No auth required

### 2. `/c/[slug]` — Thread List
- Fetch paginated Discussions filtered by category
- Display as a thread list: title, author avatar + name, reply count, last activity timestamp
- Support sorting by: Latest, Newest
- No auth required

### 3. `/t/[number]/[slug]` — Thread Detail
- Fetch a single Discussion and all its comments/replies
- Render in a forum thread style: original post at top, replies below in chronological order
- Show reactions on each post
- If user is authenticated: show reply box at the bottom
- If guest: show "Sign in with GitHub to reply" prompt
- No auth required to read

### 4. `/new` — Create New Thread
- Authenticated users only — redirect to login if not authenticated
- Form: title, category selector, body (markdown supported, plain textarea with preview)
- On submit: call GitHub GraphQL `createDiscussion` mutation using the user's OAuth token

### 5. `/search` — Search
- Use GitHub search API (`search/discussions`) scoped to the repo
- Display results like a thread list

### 6. `/auth/login` — Initiate OAuth
- Redirect user to GitHub OAuth authorization URL with `public_repo` scope

### 7. `/auth/callback` — OAuth Callback
- Exchange code for access token via GitHub API
- Store access token in a secure httpOnly cookie
- Redirect to previous page or home

### 8. `/auth/logout`
- Clear the session cookie
- Redirect to home

---

## Key GraphQL Operations

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
      id title body bodyHTML createdAt
      author { login avatarUrl url }
      category { name slug }
      reactions(first: 10) { nodes { content } totalCount }
      comments(first: 50) {
        totalCount
        pageInfo { hasNextPage endCursor }
        nodes {
          id body bodyHTML createdAt
          author { login avatarUrl url }
          reactions(first: 10) { nodes { content } totalCount }
          replies(first: 20) {
            nodes {
              id body bodyHTML createdAt
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
    discussion { number title }
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

## Auth Flow

1. On `/auth/login`: redirect to `https://github.com/login/oauth/authorize?client_id=CLIENT_ID&scope=public_repo&state=RANDOM_STATE`
2. On `/auth/callback`: POST to `https://github.com/login/oauth/access_token` with code + client secret, receive `access_token`
3. Store `access_token` in a signed httpOnly cookie
4. On every request: read cookie, fetch `viewer { login avatarUrl }` to validate and hydrate user context
5. For mutations: use the user's token from the cookie as the `Authorization: bearer TOKEN` header in GraphQL calls

---

## Rate Limiting Strategy

- All **read requests** go through server-side routes using the server token (PAT or GitHub App installation token) — never exposed to the client
- If no token is configured, reads use anonymous access (60 req/hr) with a banner prompting users to sign in
- All **write requests** use the authenticated user's own OAuth token — rate limits are per-user
- In-memory cache (TTL-based) deduplicates requests within a single process
- HTTP `Cache-Control` headers with `s-maxage` enable CDN/edge caching (Cloudflare, Vercel)

---

## Markdown Rendering

- GitHub returns `bodyHTML` pre-rendered — used directly for display
- For preview (create/reply forms): `marked` + `DOMPurify` for client-side rendering
- No rich text editor — plain `<textarea>` with a preview toggle

---

## Styling

- Clean, content-first layout
- Thread list with user avatars, reply counts, and timestamps
- Tailwind CSS — no heavy UI framework
- Mobile-responsive
- Dark mode via Tailwind's `dark:` classes
- Indigo accent color for brand consistency

---

## Out of Scope

- Image uploads (users can paste external image URLs in markdown)
- Email notifications (GitHub handles this natively for watched discussions)
- User profile customization (GitHub profiles are used as-is)
- Moderation tooling beyond what GitHub already provides
- Custom user roles (GitHub repo collaborators can moderate via GitHub directly)
