<script>
	import { getQueryContext } from './handler.svelte';

	const { cacheFactory, depsFactory, instanceFactory } = getQueryContext();
</script>

<h1>Devs Tools</h1>

{#each cacheFactory.keys() as cache}
	<h2>Queries Instances</h2>
	{@const c = cacheFactory.get(cache)}
	<pre>{JSON.stringify(c?.item, null, 2)} </pre>
	<span>{c?.expiresAt.getTime() ?? 0 - Date.now()}</span>
	<button onclick={() => {}}>Show Queries</button>
{/each}
