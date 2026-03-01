<script lang="ts">
	import { page } from '$app/stores';
</script>

<svelte:head>
	<title>Error {$page.status}</title>
</svelte:head>

<div class="rounded-lg border border-red-200 bg-red-50 p-8 text-center dark:border-red-900 dark:bg-red-950/20">
	<p class="mb-2 text-4xl font-bold text-red-600 dark:text-red-400">{$page.status}</p>
	<p class="text-lg font-semibold text-red-800 dark:text-red-300">
		{#if $page.status === 503}Service unavailable{:else if $page.status === 404}Not found{:else}Something went wrong{/if}
	</p>
	{#if $page.error?.message}
		<p class="mt-3 text-sm text-red-700 dark:text-red-400">{$page.error.message}</p>
	{/if}
	<a href="/" class="mt-6 inline-block rounded-md bg-gray-800 px-4 py-2 text-sm font-medium text-white hover:bg-gray-700 dark:bg-gray-700 dark:hover:bg-gray-600">
		← Back to home
	</a>
</div>
