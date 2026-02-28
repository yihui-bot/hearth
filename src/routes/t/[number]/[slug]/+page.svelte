<script lang="ts">
	import { timeAgo, reactionEmoji } from '$lib/utils';
	import { renderMarkdown } from '$lib/markdown';

	let { data } = $props();
	let replyBody = $state('');
	let replying = $state(false);
	let replyError = $state('');
	let showPreview = $state(false);

	async function submitReply() {
		if (!replyBody.trim()) return;
		replying = true;
		replyError = '';

		try {
			const res = await fetch('/api/reply', {
				method: 'POST',
				headers: { 'Content-Type': 'application/json' },
				body: JSON.stringify({
					discussionId: data.thread.id,
					body: replyBody.trim()
				})
			});

			if (!res.ok) {
				const err = await res.json();
				replyError = err.message || 'Failed to post reply';
				return;
			}

			// Reload page to show new comment
			window.location.reload();
		} catch {
			replyError = 'Failed to post reply';
		} finally {
			replying = false;
		}
	}
</script>

<svelte:head>
	<title>{data.thread?.title || 'Thread'} — {data.forumTitle}</title>
</svelte:head>

<div class="space-y-6">
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
	{:else if data.thread}
		<!-- Breadcrumb -->
		<div class="flex items-center gap-2 text-sm text-gray-500 dark:text-gray-400">
			<a href="/" class="hover:text-gray-700 dark:hover:text-gray-200">Home</a>
			<span>›</span>
			<a href="/c/{data.thread.category.slug}" class="hover:text-gray-700 dark:hover:text-gray-200">{data.thread.category.name}</a>
			<span>›</span>
			<span class="text-gray-700 dark:text-gray-200">Thread</span>
		</div>

		<!-- Original post -->
		<article class="rounded-lg border border-gray-200 bg-white dark:border-gray-800 dark:bg-gray-900">
			<div class="border-b border-gray-200 px-6 py-4 dark:border-gray-800">
				<h1 class="text-xl font-bold text-gray-900 dark:text-gray-100">{data.thread.title}</h1>
				<div class="mt-2 flex items-center gap-3">
					{#if data.thread.author}
						<img src={data.thread.author.avatarUrl} alt={data.thread.author.login} class="h-8 w-8 rounded-full" />
						<a href={data.thread.author.url} target="_blank" class="text-sm font-medium text-gray-700 hover:text-gray-900 dark:text-gray-300 dark:hover:text-gray-100">
							{data.thread.author.login}
						</a>
					{:else}
						<div class="h-8 w-8 rounded-full bg-gray-300 dark:bg-gray-700"></div>
						<span class="text-sm text-gray-500">ghost</span>
					{/if}
					<span class="text-xs text-gray-500 dark:text-gray-400">{timeAgo(data.thread.createdAt)}</span>
				</div>
			</div>

			<div class="prose dark:prose-invert max-w-none px-6 py-4">
				{@html data.thread.bodyHTML}
			</div>

			{#if data.thread.reactions.totalCount > 0}
				<div class="flex gap-2 border-t border-gray-200 px-6 py-3 dark:border-gray-800">
					{#each data.thread.reactions.nodes as reaction}
						<span class="rounded-full bg-gray-100 px-2 py-0.5 text-sm dark:bg-gray-800">
							{reactionEmoji(reaction.content)}
						</span>
					{/each}
					{#if data.thread.reactions.totalCount > data.thread.reactions.nodes.length}
						<span class="text-xs text-gray-500">+{data.thread.reactions.totalCount - data.thread.reactions.nodes.length}</span>
					{/if}
				</div>
			{/if}
		</article>

		<!-- Comments -->
		{#if data.thread.comments.nodes.length > 0}
			<h2 class="text-lg font-semibold text-gray-900 dark:text-gray-100">
				{data.thread.comments.totalCount} {data.thread.comments.totalCount === 1 ? 'Reply' : 'Replies'}
			</h2>

			<div class="space-y-4">
				{#each data.thread.comments.nodes as comment}
					<article class="rounded-lg border border-gray-200 bg-white dark:border-gray-800 dark:bg-gray-900">
						<div class="flex items-center gap-3 border-b border-gray-100 px-5 py-3 dark:border-gray-800">
							{#if comment.author}
								<img src={comment.author.avatarUrl} alt={comment.author.login} class="h-7 w-7 rounded-full" />
								<a href={comment.author.url} target="_blank" class="text-sm font-medium text-gray-700 hover:text-gray-900 dark:text-gray-300 dark:hover:text-gray-100">
									{comment.author.login}
								</a>
							{:else}
								<div class="h-7 w-7 rounded-full bg-gray-300 dark:bg-gray-700"></div>
								<span class="text-sm text-gray-500">ghost</span>
							{/if}
							<span class="text-xs text-gray-500 dark:text-gray-400">{timeAgo(comment.createdAt)}</span>
						</div>

						<div class="prose dark:prose-invert max-w-none px-5 py-3">
							{@html comment.bodyHTML}
						</div>

						{#if comment.reactions.totalCount > 0}
							<div class="flex gap-2 border-t border-gray-100 px-5 py-2 dark:border-gray-800">
								{#each comment.reactions.nodes as reaction}
									<span class="rounded-full bg-gray-100 px-2 py-0.5 text-sm dark:bg-gray-800">
										{reactionEmoji(reaction.content)}
									</span>
								{/each}
							</div>
						{/if}

						<!-- Nested replies -->
						{#if comment.replies.nodes.length > 0}
							<div class="border-t border-gray-100 dark:border-gray-800">
								{#each comment.replies.nodes as reply}
									<div class="ml-6 border-l-2 border-gray-200 py-3 pl-4 dark:border-gray-700">
										<div class="flex items-center gap-2">
											{#if reply.author}
												<img src={reply.author.avatarUrl} alt={reply.author.login} class="h-5 w-5 rounded-full" />
												<span class="text-sm font-medium text-gray-700 dark:text-gray-300">{reply.author.login}</span>
											{:else}
												<span class="text-sm text-gray-500">ghost</span>
											{/if}
											<span class="text-xs text-gray-500 dark:text-gray-400">{timeAgo(reply.createdAt)}</span>
										</div>
										<div class="prose dark:prose-invert mt-1 max-w-none text-sm">
											{@html reply.bodyHTML}
										</div>
									</div>
								{/each}
							</div>
						{/if}
					</article>
				{/each}
			</div>
		{/if}

		<!-- Reply form -->
		<div class="rounded-lg border border-gray-200 bg-white p-5 dark:border-gray-800 dark:bg-gray-900">
			{#if data.user}
				<h3 class="mb-3 text-sm font-semibold text-gray-900 dark:text-gray-100">Post a Reply</h3>

				<div class="mb-2 flex gap-2 border-b border-gray-200 dark:border-gray-700">
					<button
						type="button"
						onclick={() => showPreview = false}
						class="px-3 py-1.5 text-sm {!showPreview ? 'border-b-2 border-orange-500 font-medium text-orange-600' : 'text-gray-500 hover:text-gray-700 dark:text-gray-400'}"
					>
						Write
					</button>
					<button
						type="button"
						onclick={() => showPreview = true}
						class="px-3 py-1.5 text-sm {showPreview ? 'border-b-2 border-orange-500 font-medium text-orange-600' : 'text-gray-500 hover:text-gray-700 dark:text-gray-400'}"
					>
						Preview
					</button>
				</div>

				{#if showPreview}
					<div class="prose dark:prose-invert min-h-[120px] rounded border border-gray-200 p-3 dark:border-gray-700">
						{#if replyBody.trim()}
							{@html renderMarkdown(replyBody)}
						{:else}
							<p class="text-gray-400">Nothing to preview</p>
						{/if}
					</div>
				{:else}
					<textarea
						bind:value={replyBody}
						placeholder="Write your reply... (Markdown supported)"
						class="w-full rounded border border-gray-300 p-3 text-sm dark:border-gray-700 dark:bg-gray-800 dark:text-gray-100"
						rows="4"
					></textarea>
				{/if}

				{#if replyError}
					<p class="mt-2 text-sm text-red-600">{replyError}</p>
				{/if}

				<div class="mt-3 flex justify-end">
					<button
						onclick={submitReply}
						disabled={replying || !replyBody.trim()}
						class="rounded-md bg-orange-600 px-4 py-2 text-sm font-medium text-white hover:bg-orange-700 disabled:opacity-50"
					>
						{replying ? 'Posting...' : 'Post Reply'}
					</button>
				</div>
			{:else}
				<div class="text-center py-4">
					<p class="text-gray-500 dark:text-gray-400 mb-3">Sign in to join the discussion</p>
					<a
						href="/auth/login?redirect=/t/{data.thread.number}/{encodeURIComponent(data.thread.title)}"
						class="inline-block rounded-md bg-gray-800 px-4 py-2 text-sm font-medium text-white hover:bg-gray-700 dark:bg-gray-700 dark:hover:bg-gray-600"
					>
						Sign in with GitHub
					</a>
				</div>
			{/if}
		</div>
	{/if}
</div>
