<script lang="ts">
	import { getQueryContext } from './handler.svelte';

	const { cacheFactory, depsFactory, instanceFactory } = getQueryContext();

	function getSize(str: string) {
		const byteLengthUtf16 = (str: string) => str.length * 2;
		const byteLengthUtf8 = (str: string) => new Blob([str]).size;
		return { byteLengthUtf16: byteLengthUtf16(str), byteLengthUtf8: byteLengthUtf8(str) };
	}
	let open = $state(false);
</script>

<!-- svelte-ignore a11y_click_events_have_key_events -->
<!-- svelte-ignore a11y_no_static_element_interactions -->
<div class:devtool-turbo={open} class:hidden={!open}>
	<button onclick={() => (open = !open)} style="font-size: 1em;">DevTools(click to fold)</button>
	{#each cacheFactory.keys() as cache, index}
		<h2>{index}. Instances <span style="color:brown">{cache}</span></h2>
		{@const c = cacheFactory.get(cache)}
		<p style="color: chocolate;">
			Cached Value UTF16:<span style="color:aqua"
				>{getSize(JSON.stringify(c?.item)).byteLengthUtf16 / 1000}</span
			>
			kilobytes UTF8:<span style="color:violet">{getSize(c?.item).byteLengthUtf8 / 1000}</span> kilobytes
		</p>
		<pre style="max-height: 200px; overflow:auto;">{JSON.stringify(c?.item, null, 2)} </pre>
		<span>Expire in {(c?.expiresAt.getTime() ?? 0) - Date.now()} milliseconds</span>
		<button onclick={() => {}}>Show Queries</button>
		<!-- {#if depsFactory[cache]}
    		{depsFactory[cache].keys()}
    	{/if} -->
	{/each}
</div>

<style>
	.hidden {
		width: 5em;
		height: 5em;
		border-radius: 100%;
		position: fixed;
		left: 0;
		bottom: 0;
		background-color: green;
		overflow: hidden;
	}
	.devtool-turbo {
		position: fixed;
		left: 0;
		bottom: 0;
		background-color: aliceblue;
		width: 100vw;
		padding: 2rem;
		border: 2px solid rgb(224, 177, 177);
		box-shadow: rgba(100, 100, 111, 0.2) 0px 7px 29px 0px;
		height: 20vh;
		overflow: auto;
	}
</style>
