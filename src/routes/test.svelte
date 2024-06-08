<script lang="ts">
	import { createQuery, type normalized } from './handler.svelte';

	console.log("loading test")
	const args = $state({ a: 1 });
	const query = createQuery({
		cacheKey: 'blogs',
		name: "test svelte",
		deps: () => args.a,
		fetcher: async (props) => {
			console.log('calling fetcher');
			const res = await fetch('https://jsonplaceholder.typicode.com/todos/1');
			let { promise, resolve, reject } = Promise.withResolvers();
			setTimeout(() => {
				resolve([1]);
			}, 500);
			await promise;
			return [{ id: crypto.randomUUID(), content: 'tester' }] as const;
		},
		mergeFn: ({
			Cached,
			originalResponse
		}): normalized<string, [{ id: string; content: string }]> => {
			const ids = originalResponse.map((v) => v.id);
			if (!Cached) {
				return {
					value: originalResponse.reduce((prev, next, index) => {
						prev[next.id] = next;
						return prev;
					}, {})
				} as normalized<string,[123]>;
			}
			const item = Cached.item.value;
			 originalResponse.map((v) => {
				item[v.id] = Object.assign(item[v.id] ?? {}, v); // merge
			}) 
			return Cached.item as normalized<string,[123]>
		},
		pickFn: ({ Cached, originalResponse }) => {
			const ids=originalResponse.map(v=>v.id)
			const item = Cached.item;
			const v= ids.map(v=>item.value[v])
			return v
		},
		queryOptions: { expiration: () => 50000 }
	});

	// Get the resolver keys.
	let open = $state(false);
</script>

<h2>TEST</h2>
<pre>
	{JSON.stringify(query(), null, 2)}
</pre>

<button
	onclick={() => {
		args.a += 1;
	}}>update deps {args.a}</button
><button
	onclick={() => {
		args.a -= 1;
	}}>revert update deps {args.a}</button
>
<button
	onclick={() => {
		let temp = query().cacheInstance();
		temp.item[1] = new Date();
		console.log(temp.item);
	}}
>
	Mutate Cache
</button>

<button
	onclick={() => {
		open = !open;
		console.log('clicked', open);
	}}>dialog open {open}</button
>
