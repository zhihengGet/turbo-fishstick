import { getContext, onMount, setContext, tick, untrack } from 'svelte';
import { Map as ReactiveMap } from 'svelte/reactivity';
import {
	createTurboQuery,
	type TurboCache,
	type TurboQuery,
	type TurboQueryEvent,
	type TurboQueryOptions
} from 'turbo-query';
import stringify from 'fast-json-stable-stringify';
import { merge, pickBy, prop } from 'remeda';
import { browser } from '$app/environment';
function log() {}

/**
 * @description store instance query for query deduplication
 */
const instanceFactory: Map<string, TurboQuery> = new Map();
/**
 * @description store deps change over time , for query deduplication based on cache key on a app level for all queries with same key
 */
const DepsFactory: { [s in string]: Set<unknown> } = {};
/**
 * @description store global cache for a cache key, reactive map so that all UI can be updated
 */
const globalCacheFactory: Map<string, { expiresAt: Date; item: unknown }> = new Map();

type cache<T> = { expiresAt: Date; item: T };
const QUERY_CLIENT_TURBO = 'turbo query context';
const QUERY_CACHE_CLIENT_TURBO = 'turbo query cache context';
const QUERY_CONTEXT_INSTANCE = 'turbo query instance context';
const QUERY_DEPS_STORE_CLIENT_TURBO = 'turbo query deps store context';

export const setQueryContext = () => {
	return setContext(QUERY_CLIENT_TURBO, {
		cacheFactory: new ReactiveMap(),
		depsFactory: {},
		//instanceFactory: new Map(),
		//instanceQueries: new Map(),
		originalResponseStore: new Map(),
		endHook: () => console.log('query ended'),
		instanceQueriesMetaStore: new Map()
	});
};
export const getQueryContext = <TMerged, Deps, TData, TDeps>() => {
	return getContext(QUERY_CLIENT_TURBO) as {
		cacheFactory: Map<string, { expiresAt: Date; item: TMerged }>;
		depsFactory: { [s in string]: Set<string> };
		//instanceFactory: Map<string, TurboQuery>;
		//	instanceQueries: Map<TurboQuery, [typeof props]>;
		instanceQueriesMetaStore: Map<string, { count: number[]; names: Set<string> }>;
		endHook: (props: { error?: Error; data?: TData }) => void;
		originalResponseStore: Map<string, Map<TDeps, TData>>;
	};
};
export const setQueryInstanceContext = () => {
	return setContext(QUERY_CONTEXT_INSTANCE, new Map());
};
export const getQueryInstanceContext = () => {
	return getContext(QUERY_CONTEXT_INSTANCE) as typeof instanceFactory;
};
export const setQueryCacheContext = () => {
	return setContext(QUERY_CACHE_CLIENT_TURBO, new Map());
};
export const getQueryCacheContext = () => {
	return getContext(QUERY_CACHE_CLIENT_TURBO) as typeof globalCacheFactory;
};

export const setQueryDepsStoreContext = () => {
	return setContext(QUERY_DEPS_STORE_CLIENT_TURBO, {});
};
export const getQueryDepsStoreContext = () => {
	return getContext(QUERY_DEPS_STORE_CLIENT_TURBO) as typeof DepsFactory;
};

type id = string | number | object;
export type normalized<key, value> = {
	ids: key[];
	/**
	 * @description  typically the value contains an object keyed by id
	 * @example {blog_id_1: blog_value,blog_id_2:blog_value,...}
	 */
	value: object | Map<id, value>;
};
export function createQuery<TData, TError extends Error, TDeps, TMerged, TFinal>(props: {
	fetcher: (args: TDeps, abort: AbortSignal) => Promise<TData>;
	cacheKey: string;
	name?: string;
	deps: () => TDeps;
	/**
	 *
	 * @param data original response from provided fetcher
	 * @description  get unique id from the response, which can be used later to pick item from cache
	 * @returns
	 */
	getUniqueIds?: (data: TData) => (string | number)[];
	normalizer?: () => {};
	/**
	 *
	 * @description returned merged result will replace current cached item
	 * @param
	 * @returns
	 */
	mergeFn: (args: {
		Cached?: { expiresAt: Date; item?: TMerged };
		/**
		 * @description sometime the original response is expired, so we need to fetch new response
		 */
		originalResponse: TData;
		/**
		 * @description sometime the original response is expired, so we need to fetch new response, prevResponse is the expired response
		 */
		prevResponse?: TData;
	}) => TMerged;
	/**
	 * @description sometime the data you want is already in the cache, try search cache(mergeFn will be called on the fake response) then update response with actual fetch
	 * @returns {TData}
	 */
	optimisticReturn?: (args: { Cached?: { expiresAt: Date; item: TMerged } }) => TData;
	pickFn: (args: {
		Cached?: { expiresAt: Date; item: TMerged };
		originalResponse: TData;
		ids: (string | number)[];
	}) => TFinal;
	onSuccess?: (data: {
		picked: unknown;
		originalResponse: TData;
		cache?: { expiresAt: Date; item: TMerged };
	}) => void;
	onError?: (err: TError) => void;
	queryOptions?: TurboQueryOptions;
	initialData?: TData;
	syncTabs?: boolean;
}) {
	/* 	const cacheFactory = getQueryCacheContext();
	const depsFactory = getQueryDepsStoreContext();
	const instanceFactory = getQueryInstanceContext(); */
	const { cacheFactory, depsFactory, instanceQueriesMetaStore, endHook, originalResponseStore } =
		getQueryContext<TMerged, TDeps, TData, TDeps>();
	if (!depsFactory[props.cacheKey]) {
		depsFactory[props.cacheKey] = new Set();
	}
	let depsHistory = depsFactory[props.cacheKey];

	let ids: string[] = [];
	let hash: string = $derived(stringify(props.deps()));

	async function notify() {
		if (browser) {
			console.log('notifying other tab about the change', sessionStorage?.getItem('tabId'));
			const channel = new BroadcastChannel('query-app-data');
			const msg: {
				tabId: string;
				cacheItem: { cacheKey: string; cacheFactoryItem: any };
			} = {
				tabId: sessionStorage?.getItem('tabId'),
				cacheItem: {
					cacheKey: props.cacheKey,
					cacheFactoryItem: $state.snapshot(cacheFactory.get(props.cacheKey))
				}
			};
			channel.postMessage(msg);
		}
	}
	const queryInstance = createTurboQuery({
		itemsCache: {
			get(key) {
				const old_cache = cacheFactory.get(key);
				console.info('Get, check if item exists in cache', key);
				if (!old_cache) {
					return;
				}
				if (old_cache.expiresAt.getTime() <= Date.now()) {
					console.log('Get Item from cached But expired');
				}
				const original = originalResponse.get(hash);
				console.log(
					'GET originalResponse',
					Array.from(originalResponse),
					originalResponse.get(hash)
				);

				if (!original) {
					// missing original response, need to refetch
					console.log('missing original response, refetching...');
					return;
				}
				result.data = props.pickFn({
					Cached: old_cache,
					originalResponse: original,
					ids: props?.getUniqueIds?.(original) ?? []
				});
				console.log('GET originalResponse', JSON.stringify(result.data));
				clearTimer();
				result.isLoading = false;
				result.isSuccess = true;
				return old_cache;
			},
			set(key, value) {
				const cache = cacheFactory.get(key);
				const copied = JSON.parse(JSON.stringify(value.item));
				const prev_original = originalResponse.get(stringify(props.deps()));
				console.log('Setting cache', copied, stringify(props.deps()));
				originalResponse.set(stringify(props.deps()), copied); // create a copy so that when cache is changed, originalResponse wont change
				console.time('Set cache');

				const temp = props.mergeFn({
					Cached: cache,
					originalResponse: copied,
					prevResponse: prev_original
				});
				if (!cache?.item) {
					let reactive_output = $state({ expiresAt: value.expiresAt, item: temp });
					cacheFactory.set(key, reactive_output);
				} else {
					merge(cache.item, temp);
					cacheFactory.set(key, cache);
				}
				if (props.syncTabs) notify();
				console.timeEnd('Set cache');
			},
			keys() {
				return cacheFactory.keys();
			},
			delete(key) {
				//console.log('delete ', key);
				return cacheFactory.delete(key);
			}
		}
	});
	let temp_orig = originalResponseStore.get(props.cacheKey);
	let originalResponse = temp_orig ?? new Map();
	if (!temp_orig) originalResponseStore.set(props.cacheKey, originalResponse);
	// increment count
	const meta = instanceQueriesMetaStore.get(props.cacheKey) ?? { count: [], names: new Set() };
	meta.count.push(1); // avoid race condition with push instead of inc
	instanceQueriesMetaStore.set(props.cacheKey, meta);

	function getResponseHistory() {
		return originalResponse.get(stringify(props.deps()));
	}
	if (props.initialData) {
		queryInstance.caches().items.set(props.cacheKey, {
			expiresAt: new Date(
				Date.now() + (props?.queryOptions?.expiration?.(props.initialData) ?? 500)
			),
			item: props.initialData
		});
		let k = stringify(props.deps());
		//	originalResponse.set(k, props.initialData);
		//depsHistory.add(k);
	}

	let result: {
		data: TFinal | undefined;
		isError: boolean;
		isRefetching: boolean;
		isLoading: boolean;
		isAborted: boolean;
		isSuccess: boolean;
		instance: TurboQuery;
		cacheInstance: () => { expiresAt: Date; item: TMerged } | undefined;
		refetch: () => Promise<TData | undefined>;
		error?: Error;
		//setCacheInstance: (args: string[]) => void;
	} = $state({
		isAborted: false,
		isRefetching: false,
		data: undefined,
		queryInstance: queryInstance,
		isLoading: true,
		isSuccess: false,
		isError: false,
		instance: queryInstance,
		refetch: () => {
			return get(true);
		},
		cacheInstance: () => cacheFactory.get(props.cacheKey)
	});
	const optimisticReturn = props?.optimisticReturn?.({ Cached: cacheFactory.get(props.cacheKey) });
	if (optimisticReturn) {
		console.log('optimistic return');
		result.data = props.pickFn({
			Cached: cacheFactory.get(props.cacheKey),
			originalResponse: optimisticReturn,
			ids: ids
		});
	}
	async function get(force: boolean = false) {
		const result = await queryInstance?.query<TData>(props.cacheKey, {
			//@ts-expect-error idk
			fetcher: async (key, { signal }) => {
				const res = await props.fetcher(props.deps(), signal);
				clearTimer();
				return res;
			},
			...(props.queryOptions ?? {}),
			fresh: force
		});

		return result;
	}
	let timer: { id: number | null } = { id: null };
	function clearTimer() {
		//console.log('clear time');
		if (timer.id) clearTimeout(timer.id);
	}
	$effect(() => {
		console.log('rerun eff', props.deps());
		console.log(props.name);
		if (props.deps() && hash) {
			untrack(() => {
				clearTimer();
				const has = depsHistory.has(hash);
				console.log('deps updated', has);
				if (!has) {
					console.log('a new fetch', hash, Array.from(depsHistory), has);
					//  a new query
					depsHistory.add(hash);
				}
				result.isLoading = true;
				result.isSuccess = false;
				get(/* !has */);
			});
		}
	});
	$effect.root(() => {
		const unsub: Function[] = [];
		unsub.push(
			//@ts-expect-error
			queryInstance.subscribe(props.cacheKey, 'resolved', function (payload: CustomEvent) {
				result['isError'] = false;
				console.log('resolved query', payload.detail, originalResponse.keys());
				clearTimer();
				const res = getResponseHistory();
				const val = props.pickFn({
					Cached: cacheFactory.get(props.cacheKey),
					originalResponse: res,
					ids: ids
				});
				result.data = val;
				result.isRefetching = false;
				result.error = undefined;
				result.isAborted = false;
				result.isLoading = false;
				result.isSuccess = true;
				console.log('resolved  merged data ', JSON.stringify(val, null));
				props.onSuccess?.({
					picked: val,
					originalResponse: res,
					cache: cacheFactory.get(props.cacheKey)
				});
				endHook?.({ data: payload.detail });
			})
		);
		unsub.push(
			queryInstance.subscribe(props.cacheKey, 'aborted', function (payload: CustomEvent) {
				result.isAborted = true;
				result.isLoading = false;
				//	result.data = payload;
			})
		);
		unsub.push(
			queryInstance.subscribe(props.cacheKey, 'refetching', function (payload) {
				result.isRefetching = true; //expired or deps changed
				console.log('refetching', payload);
			})
		);
		unsub.push(
			queryInstance.subscribe(props.cacheKey, 'error', function (payload: CustomEvent) {
				result.isError = true;
				result.error = payload.detail;
				result.isSuccess = false;
				props.onError?.(payload.detail);
				endHook({ error: payload.detail });
			})
		);
		unsub.push(
			queryInstance.subscribe(props.cacheKey, 'forgotten', function (payload) {
				//expired
				console.log('cache invalidated', payload);
				get(true);
			})
		);
		return () => {
			console.log('cleanup');
			queryInstance.abort();
			unsub.forEach((v) => v());

			const meta = instanceQueriesMetaStore.get(props.cacheKey) ?? { count: [0], names: new Set() };
			meta.count.push(-1);
			instanceQueriesMetaStore.set(props.cacheKey, meta);
		};
	});

	const res = $derived({
		...result
		//data: cacheFactory.get(props.cacheKey)?.item as TFinal
	});
	/* $effect(() => {
		console.log('res changed', res, Object.keys(cacheFactory.get(props.cacheKey) ?? {}));
	}); */

	//$inspect('inspecting', res).with(console.log);
	return () => result;
}

export function MergeService() {
	onMount(() => {
		const channel = new BroadcastChannel('query-app-data');
		const props = getQueryContext();
		const id = sessionStorage.getItem('tabId') as string;
		const tabId = id ? id : crypto.randomUUID();
		sessionStorage.setItem('tabId', tabId);
		channel.addEventListener(
			'message',
			(
				event: MessageEvent<{
					tabId: string;
					cacheItem: { cacheKey: string; cacheFactoryItem: any };
				}>
			) => {
				console.log('sync event', event.data);
				if (event.data.tabId !== tabId) {
					console.log('tabs are different');
					const curr = props.cacheFactory.get(event.data.cacheItem.cacheKey);
					const curr_res = props.originalResponseStore.get(event.data.cacheItem.cacheKey);
					props.cacheFactory.set(
						event.data.cacheItem.cacheKey,
						merge(curr, event.data.cacheItem.cacheFactoryItem)
					);
					//props.originalResponseStore.set(event.data.cacheItem.cacheKey,merge(event.data))
					// merge with our cache
				}
			}
		);
	});
}
