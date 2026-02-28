<script lang="ts">
	import { timeAgo, slugify } from '$lib/utils';

	let { data } = $props();
</script>

<svelte:head>
	<title>{data.category.name} — Gitorum</title>
</svelte:head>

<div class="space-y-4">
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
				class="rounded px-3 py-1 text-sm {data.sort === 'UPDATED_AT' || !data.sort ? 'bg-indigo-100 text-indigo-700 dark:bg-indigo-900/30 dark:text-indigo-400' : 'text-gray-600 hover:bg-gray-100 dark:text-gray-400 dark:hover:bg-gray-800'}"
			>
				Latest
			</a>
			<a
				href="/c/{data.category.slug}?sort=CREATED_AT"
				class="rounded px-3 py-1 text-sm {data.sort === 'CREATED_AT' ? 'bg-indigo-100 text-indigo-700 dark:bg-indigo-900/30 dark:text-indigo-400' : 'text-gray-600 hover:bg-gray-100 dark:text-gray-400 dark:hover:bg-gray-800'}"
			>
				Newest
			</a>
		</div>
	</div>

	{#if data.threads.length === 0}
		<div class="rounded-lg border border-gray-200 bg-white p-8 text-center dark:border-gray-800 dark:bg-gray-900">
			<p class="text-gray-500 dark:text-gray-400">No threads yet in this category.</p>
			<a href="/new" class="mt-2 inline-block text-sm text-indigo-600 hover:text-indigo-700 dark:text-indigo-400">Start a new thread →</a>
		</div>
	{:else}
		<div class="divide-y divide-gray-200 rounded-lg border border-gray-200 bg-white dark:divide-gray-800 dark:border-gray-800 dark:bg-gray-900">
			{#each data.threads as thread}
				<a
					href="/t/{thread.number}/{slugify(thread.title)}"
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

		{#if data.pageInfo.hasNextPage}
			<div class="text-center">
				<a
					href="/c/{data.category.slug}?after={data.pageInfo.endCursor}&sort={data.sort}"
					class="inline-block rounded-md border border-gray-300 px-4 py-2 text-sm text-gray-700 hover:bg-gray-50 dark:border-gray-700 dark:text-gray-300 dark:hover:bg-gray-800"
				>
					Load more →
				</a>
			</div>
		{/if}
	{/if}
</div>
