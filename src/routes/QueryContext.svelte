<script lang="ts">
	import { onDestroy, type Snippet } from 'svelte';
	import {
		setQueryCacheContext,
		setQueryContext,
		setQueryDepsStoreContext,
		setQueryInstanceContext
	} from './handler.svelte.js';

	let { children }: { children: Snippet } = $props();

	setQueryInstanceContext();
	setQueryCacheContext();
	setQueryDepsStoreContext();
	setQueryContext();
	onDestroy(() => {});
</script>

{@render children?.()}
