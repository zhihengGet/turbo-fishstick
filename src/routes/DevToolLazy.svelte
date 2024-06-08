<script lang="ts">
	import { dev } from '$app/environment';
	import DevTool from './DevTool.svelte';
</script>

{#if dev}
	<DevTool />
{/if}
