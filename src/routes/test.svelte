<script lang="ts">
	import { createTurboQuery } from 'turbo-query';
	import { createQuery } from './handler.svelte.js';
	import { text } from '@sveltejs/kit';
	const args = $state({ a: 1 });
	const query = createQuery({
		cacheKey: 'blogs',
		deps: () => args.a,
		fetcher: async () => {
			console.log('creating query  ttest');
			/* const update = await fetch('https://jsonplaceholder.typicode.com/posts/1', {
				method: 'PUT',
				body: JSON.stringify({
					id: 1,
					title: 'foo',
					body: 'bar',
					userId: 1
				}),
				headers: {
					'Content-type': 'application/json; charset=UTF-8'
				}
			}); */
			const res = await fetch('https://jsonplaceholder.typicode.com/todos/1');
			return [1, 2, 3, 'fetch', crypto.randomUUID()];
		},
		mergeFn: ({ Cached, originalResponse }) => {
			return originalResponse;
		},
		pickFn: ({ Cached, originalResponse }) => {
			return originalResponse;
		},

		queryOptions: { expiration: () => 1000 }
	});

	// Get the resolver keys.
	let open = $state(false);
</script>

<h2>Test</h2>
<prev>
	{JSON.stringify(query(), null, 2)}
</prev>

<button
	onclick={() => {
		args.a += 1;
	}}>update deps {args.a}</button
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
