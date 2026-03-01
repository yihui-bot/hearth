<script lang="ts">
	import { timeAgo } from '$lib/utils';

	let { data } = $props();

	const PAGES_AROUND_CURRENT = 2;
	const MAX_PAGES_WITHOUT_ELLIPSIS = 7;

	function pageUrl(p: number) {
		return `/c/${data.category.slug}?page=${p}&sort=${data.sort}`;
	}

	// Build the list of page numbers to show (always first, last, current ±PAGES_AROUND_CURRENT, with ellipsis)
	function pageNumbers(current: number, total: number): (number | null)[] {
		if (total <= MAX_PAGES_WITHOUT_ELLIPSIS) return Array.from({ length: total }, (_, i) => i + 1);
		const pages: (number | null)[] = [];
		const add = (n: number) => { if (!pages.includes(n)) pages.push(n); };
		add(1);
		if (current - PAGES_AROUND_CURRENT > 2) pages.push(null); // left ellipsis
		for (let p = Math.max(2, current - PAGES_AROUND_CURRENT); p <= Math.min(total - 1, current + PAGES_AROUND_CURRENT); p++) add(p);
		if (current + PAGES_AROUND_CURRENT < total - 1) pages.push(null); // right ellipsis
		add(total);
		return pages;
	}
</script>

<svelte:head>
	<title>{data.category.name} — {data.forumTitle}</title>
</svelte:head>

<div class="space-y-4">
	{#if data.rateLimited}
		<div class="rounded-lg border border-amber-200 bg-amber-50 p-6 text-center dark:border-amber-800 dark:bg-amber-900/20">
			<p class="mb-3 text-amber-800 dark:text-amber-300">⚠️ GitHub API rate limit reached.</p>
			{#if !data.user}
				<p class="mb-3 text-sm text-amber-700 dark:text-amber-400">
					<a href="/auth/login" class="font-medium underline">Sign in with GitHub</a> to continue browsing with a higher rate limit.
				</p>
			{/if}
			<p class="text-sm text-amber-600 dark:text-amber-400">If this persists, please contact the repository administrator.</p>
		</div>
	{:else}
		<div class="flex items-center justify-between">
			<div>
				<div class="flex items-center gap-2">
					<a href="/" class="text-sm text-gray-500 hover:text-gray-700 dark:text-gray-400 dark:hover:text-gray-200">← Categories</a>
				</div>
				<h1 class="mt-1 text-2xl font-bold">
					{data.category.emoji || '💬'} {data.category.name}
				</h1>
				{#if data.category.description}
					<p class="text-sm text-gray-500 dark:text-gray-400">{data.category.description}</p>
				{/if}
			</div>

			<div class="flex items-center gap-2">
				<a
					href="/c/{data.category.slug}?sort=UPDATED_AT"
					class="rounded px-3 py-1 text-sm {data.sort === 'UPDATED_AT' || !data.sort ? 'bg-orange-100 text-orange-700 dark:bg-orange-900/30 dark:text-orange-400' : 'text-gray-600 hover:bg-gray-100 dark:text-gray-400 dark:hover:bg-gray-800'}"
				>
					Latest
				</a>
				<a
					href="/c/{data.category.slug}?sort=CREATED_AT"
					class="rounded px-3 py-1 text-sm {data.sort === 'CREATED_AT' ? 'bg-orange-100 text-orange-700 dark:bg-orange-900/30 dark:text-orange-400' : 'text-gray-600 hover:bg-gray-100 dark:text-gray-400 dark:hover:bg-gray-800'}"
				>
					Newest
				</a>
			</div>
		</div>

		{#if data.threads.length === 0}
			<div class="rounded-lg border border-gray-200 bg-white p-8 text-center dark:border-gray-800 dark:bg-gray-900">
				<p class="text-gray-500 dark:text-gray-400">No threads yet in this category.</p>
				<a href="/new" class="mt-2 inline-block text-sm text-orange-600 hover:text-orange-700 dark:text-orange-400">Start a new thread →</a>
			</div>
		{:else}
			<div class="divide-y divide-gray-200 rounded-lg border border-gray-200 bg-white dark:divide-gray-800 dark:border-gray-800 dark:bg-gray-900">
				{#each data.threads as thread}
					<a
						href="/t/{thread.number}"
						class="flex items-center gap-4 px-4 py-3 transition hover:bg-gray-50 dark:hover:bg-gray-800/50"
					>
						{#if thread.author}
							<img src={thread.author.avatarUrl} alt={thread.author.login} class="h-9 w-9 rounded-full" />
						{:else}
							<div class="h-9 w-9 rounded-full bg-gray-300 dark:bg-gray-700"></div>
						{/if}

						<div class="min-w-0 flex-1">
							<h3 class="truncate font-medium text-gray-900 dark:text-gray-100">{thread.title}</h3>
							<p class="text-xs text-gray-500 dark:text-gray-400">
								{thread.author?.login || 'ghost'} · {timeAgo(thread.createdAt)}
							</p>
						</div>

						<div class="flex items-center gap-4 text-xs text-gray-500 dark:text-gray-400">
							{#if thread.reactions.totalCount > 0}
								<span title="Reactions">❤️ {thread.reactions.totalCount}</span>
							{/if}
							<span title="Replies">💬 {thread.comments.totalCount}</span>
						</div>
					</a>
				{/each}
			</div>

			{#if data.totalPages > 1}
				<nav class="flex items-center justify-center gap-1 text-sm" aria-label="Pagination">
					{#if data.page > 1}
						<a href={pageUrl(data.page - 1)} class="rounded border border-gray-300 px-3 py-1.5 text-gray-700 hover:bg-gray-50 dark:border-gray-700 dark:text-gray-300 dark:hover:bg-gray-800">‹</a>
					{/if}
					{#each pageNumbers(data.page, data.totalPages) as p}
						{#if p === null}
							<span class="px-1 text-gray-400">…</span>
						{:else}
							<a
								href={pageUrl(p)}
								class="rounded border px-3 py-1.5 {p === data.page ? 'border-orange-500 bg-orange-50 font-semibold text-orange-700 dark:bg-orange-900/30 dark:text-orange-400' : 'border-gray-300 text-gray-700 hover:bg-gray-50 dark:border-gray-700 dark:text-gray-300 dark:hover:bg-gray-800'}"
								aria-current={p === data.page ? 'page' : undefined}
							>{p}</a>
						{/if}
					{/each}
					{#if data.page < data.totalPages}
						<a href={pageUrl(data.page + 1)} class="rounded border border-gray-300 px-3 py-1.5 text-gray-700 hover:bg-gray-50 dark:border-gray-700 dark:text-gray-300 dark:hover:bg-gray-800">›</a>
					{/if}
				</nav>
			{/if}
		{/if}
	{/if}
</div>
