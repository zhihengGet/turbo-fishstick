<script lang="ts">
	import { onDestroy, onMount } from 'svelte';
	import { getQueryContext } from './handler.svelte';
	import { BigJsonViewerDom } from 'big-json-viewer';
	import { generate_HTML } from 'json-in-details';
	import 'json-in-details/styles.css';
	import './bigjson.css';
	import { get } from 'svelte/store';
	import { keys } from 'remeda';
	//import { sum } from 'remeda';

	const { cacheFactory, depsFactory, instanceQueriesMetaStore } = getQueryContext();

	function getSize(str: string) {
		const byteLengthUtf16 = (str: string) => str.length * 2;
		const byteLengthUtf8 = (str: string) => new Blob([str]).size;
		return { byteLengthUtf16: byteLengthUtf16(str), byteLengthUtf8: byteLengthUtf8(str) };
	}
	let open = $state(true);
	function init(html: HTMLElement) {
		document.body.appendChild(html);
		onDestroy(() => {
			html.remove();
		});
	}
	function init1(html: HTMLElement, paramters: object) {
		const s = generate_HTML(paramters, {
			escape_HTML: false,
			show_newline_chars: false
		});
		html.innerHTML = s;
		//document.body.appendChild(html);
		/* BigJsonViewerDom.fromData(html.getAttribute('data-json'), {}).then((viewer) => {
			const node = viewer.getRootElement();
			html.appendChild(node);
			node.openAll(1);
		}); */
		onDestroy(() => {
			html.remove();
		});
	}
	onMount(() => {
		setInterval(() => {}, 1000);
	});
	function getId(s) {
		return 'test-json-' + s;
	}
	$effect(() => {
		for (let x of cacheFactory.keys())
			BigJsonViewerDom.fromData(JSON.stringify(cacheFactory.get(x)?.item), {}).then((viewer) => {
				const node = viewer.getRootElement();
				const html = document.getElementById(getId(x));
				if (!html || !node) {
					return console.warn('devtool error failed to get html element');
				}
				html.innerHTML = '';
				html.appendChild(node);
				node.openAll(1);
			});
	});
</script>

<!-- svelte-ignore a11y_click_events_have_key_events -->
<!-- svelte-ignore a11y_no_static_element_interactions -->
<div class:devtool-turbo={open} class:dev-back-to-corner={!open} use:init>
	<button onclick={() => (open = !open)} style="font-size: 1em;">DevTools(click to fold)</button>
	<button onclick={() => {}}>toggle json viewer</button>
	{#each cacheFactory.keys() as cache, index}
		<h2>
			{index}. Instances
			<span style="color:brown">{cache} </span>
		</h2>

		{@const c = cacheFactory.get(cache)}
		<p style="color: chocolate;">
			Cached Value UTF16:<span style="color:aqua;padding:1em; font-weight:900;"
				>{getSize(JSON.stringify(c?.item)).byteLengthUtf16 / 1000}</span
			>
			kilobytes UTF8:<span style="color:violet;padding:0.6em; font-weight:900;"
				>{getSize(c?.item).byteLengthUtf8 / 1000}</span
			> kilobytes
		</p>

		<div style="max-height: 200px; overflow:auto;">
			<div id={getId(cache)}></div>
			<div class="jid">
				{@html generate_HTML(c?.item ?? {}, {
					escape_HTML: false,
					show_newline_chars: false
				})}
			</div>
		</div>
		<span>Expire in {(c?.expiresAt.getTime() ?? 0) - Date.now()} milliseconds</span>
		<h4>Queries for {cache}</h4>
		<details style="margin-left: 2em;background-color:antiquewhite">
			<summary>Show Queries {instanceQueriesMetaStore.get(cache)?.queries?.size ?? 0}</summary>
			{#each instanceQueriesMetaStore.get(cache)?.queries?.keys?.() ?? [] as meta}
				{@const info = instanceQueriesMetaStore.get(cache)?.queries}
				<div>
					<div>Id: {meta}</div>
					<div>
						Expiration {instanceQueriesMetaStore.get(cache)?.queries.get(meta)?.expirationDate}ms
					</div>
				</div>
			{/each}
		</details>

		<button onclick={() => {}}>Show Queries</button>
		<!-- {#if depsFactory[cache]}
    		{depsFactory[cache].keys()}
    	{/if} -->
	{/each}
</div>

<style>
	.dev-back-to-corner {
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
		height: 50vh;
		overflow: auto;
	}
</style>
