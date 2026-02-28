<script lang="ts">
	let { data } = $props();
</script>

<svelte:head>
	<title>Gitorum — Forum</title>
</svelte:head>

<div class="space-y-4">
	<h1 class="text-2xl font-bold">Categories</h1>
	<p class="text-gray-600 dark:text-gray-400">Browse discussion categories</p>

	{#if !data.categories}
		<div class="rounded-lg border border-amber-200 bg-amber-50 p-6 text-center dark:border-amber-800 dark:bg-amber-900/20">
			<p class="mb-3 text-amber-800 dark:text-amber-300">
				No API token available. Please <a href="/auth/login" class="font-medium underline">sign in with GitHub</a> to browse discussions.
			</p>
			<p class="text-sm text-amber-600 dark:text-amber-400">
				Forum administrators can configure a server token or GitHub App for unauthenticated access. See <a href="https://github.com" class="underline">SETUP.md</a> for details.
			</p>
		</div>
	{:else}
		<div class="grid gap-4 sm:grid-cols-2 lg:grid-cols-3">
			{#each data.categories as category}
				<a
					href="/c/{category.slug}"
					class="block rounded-lg border border-gray-200 bg-white p-5 shadow-sm transition hover:shadow-md dark:border-gray-800 dark:bg-gray-900"
				>
					<div class="mb-2 text-2xl">{category.emoji || '💬'}</div>
					<h2 class="text-lg font-semibold text-gray-900 dark:text-gray-100">{category.name}</h2>
					{#if category.description}
						<p class="mt-1 text-sm text-gray-500 dark:text-gray-400">{category.description}</p>
					{/if}
				</a>
			{/each}
		</div>
	{/if}
</div>
