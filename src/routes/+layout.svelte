<script lang="ts">
	import './layout.css';
	import favicon from '$lib/assets/favicon.svg';

	let { children, data } = $props();
</script>

<svelte:head>
	<link rel="icon" href={favicon} />
	<title>Hearth Forum</title>
</svelte:head>

<div class="min-h-screen bg-gray-50 text-gray-900 dark:bg-gray-950 dark:text-gray-100">
	<!-- Header -->
	<header class="border-b border-gray-200 bg-white dark:border-gray-800 dark:bg-gray-900">
		<div class="mx-auto flex max-w-6xl items-center justify-between px-4 py-3">
			<a href="/" class="text-xl font-bold text-orange-600 dark:text-orange-400">🔥 Hearth</a>

			<div class="flex items-center gap-4">
				<a href="/search" class="text-sm text-gray-600 hover:text-gray-900 dark:text-gray-400 dark:hover:text-gray-100">
					Search
				</a>

				{#if data.user}
					<a href="/new" class="rounded-md bg-orange-600 px-3 py-1.5 text-sm font-medium text-white hover:bg-orange-700">
						New Thread
					</a>
					<div class="flex items-center gap-2">
						<img src={data.user.avatarUrl} alt={data.user.login} class="h-7 w-7 rounded-full" />
						<span class="text-sm font-medium">{data.user.login}</span>
					</div>
					<a href="/auth/logout" class="text-sm text-gray-500 hover:text-gray-700 dark:text-gray-400 dark:hover:text-gray-200">
						Log out
					</a>
				{:else}
					<a href="/auth/login" class="rounded-md bg-gray-800 px-3 py-1.5 text-sm font-medium text-white hover:bg-gray-700 dark:bg-gray-700 dark:hover:bg-gray-600">
						Sign in with GitHub
					</a>
				{/if}
			</div>
		</div>
	</header>

	<!-- Main content -->
	<main class="mx-auto max-w-6xl px-4 py-6">
		{@render children()}
	</main>

	<!-- Footer -->
	<footer class="border-t border-gray-200 py-6 text-center text-sm text-gray-500 dark:border-gray-800 dark:text-gray-500">
		Powered by <a href="https://github.com" class="underline hover:text-gray-700 dark:hover:text-gray-300">GitHub Discussions</a>
	</footer>
</div>
