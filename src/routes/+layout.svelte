<script lang="ts">
	import './layout.css';

	let { children, data } = $props();
</script>

<svelte:head>
	<link rel="icon" href="/favicon.svg" />
	<title>Gitorum</title>
</svelte:head>

<div class="min-h-screen bg-gray-50 text-gray-900 dark:bg-gray-950 dark:text-gray-100">
	<!-- Anonymous mode banner -->
	{#if data.anonymousMode && !data.user}
		<div class="bg-amber-50 border-b border-amber-200 px-4 py-2 text-center text-sm text-amber-800 dark:bg-amber-900/20 dark:border-amber-800 dark:text-amber-300">
			⚠️ Running without a server token — anonymous API limit is 60 requests/hour.
			<a href="/auth/login" class="font-medium underline hover:text-amber-900 dark:hover:text-amber-200">Sign in with GitHub</a> for a better experience.
		</div>
	{/if}

	<!-- Header -->
	<header class="border-b border-gray-200 bg-white dark:border-gray-800 dark:bg-gray-900">
		<div class="mx-auto flex max-w-6xl items-center justify-between px-4 py-3">
			<a href="/" class="flex items-center gap-2 text-xl font-bold text-indigo-600 dark:text-indigo-400">
				<svg width="28" height="28" viewBox="0 0 64 64" fill="none" xmlns="http://www.w3.org/2000/svg" class="shrink-0">
					<rect width="64" height="64" rx="14" fill="currentColor" />
					<path d="M18 16C18 14.9 18.9 14 20 14H32L38 20V32H26L20 26V16Z" fill="white" opacity="0.9"/>
					<path d="M26 28C26 26.9 26.9 26 28 26H40L46 32V44H34L28 38V28Z" fill="white" opacity="0.7"/>
					<path d="M20 40C20 38.9 20.9 38 22 38H34L40 44V50C40 51.1 39.1 52 38 52H22C20.9 52 20 51.1 20 50V40Z" fill="white" opacity="0.5"/>
				</svg>
				Gitorum
			</a>

			<div class="flex items-center gap-4">
				<a href="/search" class="text-sm text-gray-600 hover:text-gray-900 dark:text-gray-400 dark:hover:text-gray-100">
					Search
				</a>

				{#if data.user}
					<a href="/new" class="rounded-md bg-indigo-600 px-3 py-1.5 text-sm font-medium text-white hover:bg-indigo-700">
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
