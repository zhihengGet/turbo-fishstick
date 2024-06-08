<script lang="ts">
	import { onDestroy, onMount, type Snippet } from 'svelte';
	import {
		MergeService,
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
	MergeService();
</script>

{@render children?.()}
