<script lang="ts">
	import { createTurboQuery } from 'turbo-query';
	import { createQuery, type normalized } from './handler.svelte';
	import Test from './test.svelte';
	import DevTool from './DevTool.svelte';
	import { pickBy } from 'remeda';
	// Create the configuration object.
	const options = {
		// Example isomorphic fetcher, requires node 17.5+.
		async fetcher(key, { signal }) {
			console.log('fetching ', key, new Date().toISOString());
			return [1, 2];
		}
	};
	// Create the Turbo Query instsance.
	const instance = createTurboQuery({
		async fetcher(key, { signal }) {
			console.log('fetching ', key);
			return [1, new Date().toISOString()];
		},
		itemsCache: {
			get: (payload) => {
				console.log('GET', payload);
				return [1];
			},
			set: (payload) => {
				console.log('Set', payload);
			},
			keys: () => {
				return ['1'];
			}
		}
	});

	const instance1 = createTurboQuery({
		async fetcher(key, { signal }) {
			console.log('fetching ', key);
			return [1];
		},
		itemsCache: {
			get: (payload) => {
				console.log('GET', payload);
				return { expiresAt: new Date(), item: [1] };
			},
			set: (key, value) => {
				console.log('Set', value);
			},
			keys: () => {
				return ['1'];
			}
		},
		stale: 1000
	});
	const args = $state({ a: 1 });
	const query = createQuery({
		cacheKey: 'blogs',
		deps: () => args.a,
		fetcher: async (props) => {
			console.log('calling fetcher');
			const res = await fetch('https://jsonplaceholder.typicode.com/todos/1');
			let { promise, resolve, reject } = Promise.withResolvers();
			setTimeout(() => {
				resolve([1]);
			}, 500);
			await promise;
			return [{ id: crypto.randomUUID(), content: '' }] as const;
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

	$effect(() => {
		/* 	instance.query('/c').then((v) => console.log(v)); */
		//	instance1.query('/c').then((...args) => console.warn(args));
		const resolverKeys = instance.keys('resolvers');
		const a = instance.keys('items');
		//console.log(resolverKeys, a);
		/* instance.query('/post').then((v) => {
			const resolverKeys = instance.keys('resolvers');
			const a = instance.keys('items');
			console.log(resolverKeys, a);
		});
		instance.query('/b').then((v) => {
			const resolverKeys = instance.keys('resolvers');
			const a = instance.keys('items');
			console.log(resolverKeys, a);
		}); */
		// Start querying!
	});
	// Get the resolver keys.
	let open = $state(false);
</script>

<h2>turbo query</h2>
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
{#if open}
	<Test />
{/if}

<DevTool />
