import { getContext, onMount, setContext, untrack } from 'svelte';
import { Map as ReactiveMap } from 'svelte/reactivity';
import {
	createTurboQuery,
	type TurboCache,
	type TurboQuery,
	type TurboQueryEvent,
	type TurboQueryOptions
} from 'turbo-query';
import stringify from 'fast-json-stable-stringify';
import { merge, pickBy } from 'remeda';

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
const globalCacheFactory: Map<string, { expiresAt: Date; item: T }> = new Map();

type cache<T> = { expiresAt: Date; item: T };
const QUERY_CLIENT_TURBO = 'turbo query context';
const QUERY_CACHE_CLIENT_TURBO = 'turbo query cache context';
const QUERY_CONTEXT_INSTANCE = 'turbo query instance context';
const QUERY_DEPS_STORE_CLIENT_TURBO = 'turbo query deps store context';

export const setQueryContext = () => {
	return setContext(QUERY_CLIENT_TURBO, {
		cacheFactory: new ReactiveMap(),
		depsFactory: {},
		instanceFactory: new Map(),
		instanceQueries: new Map(),
		originalResponseStore:new Map(),
		endHook: (v) => console.log('query ended')
	});
};
export const getQueryContext = <TMerged, Deps>() => {
	return getContext(QUERY_CLIENT_TURBO) as {
		cacheFactory: Map<string, TMerged>;
		depsFactory: { [s in string]: Set<Deps> };
		instanceFactory: typeof instanceFactory;
		instanceQueries: Map<TurboQuery, unknown>;
		endHook: (props: { error?: Error; data?: unknown }) => void;
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
export function createQuery<TData, TError, TDeps, TMerged, TFinal>(props: {
	fetcher: (args: TDeps, abort: AbortSignal) => Promise<TData>;
	cacheKey: string;
	deps: () => TDeps;
	/**
	 *
	 * @param data original response from provided fetcher
	 * @description  get unique id from the response, which can be used later to pick item from cache
	 * @returns
	 */
	pickId?: (data: TData) => (string | number)[];
	normalizer?: () => {};
	/**
	 *
	 * @description returned merged result will replace current cached item
	 * @param 
	 * @returns
	 */
	mergeFn: (args: {

		Cached?: { expiresAt: Date; item: TMerged };
		/**
		 * @description sometime the original response is expired, so we need to fetch new response
		 */
		originalResponse: TData;
		/**
		 * @description sometime the original response is expired, so we need to fetch new response, prevResponse is the expired response
		 */
		prevResponse: TData
	}) => TMerged;
	pickFn: (args: {
		Cached: { expiresAt: Date; item: TMerged };
		originalResponse: TData;
		ids: (string | number)[];
	}) => TFinal;
	onSuccess?: (data: {
		picked: TFinal;
		originalResponse: TData;
		cache?: { expiresAt: Date; item: TMerged };
	}) => void;
	onError?: (err: TError) => void;
	queryOptions?: TurboQueryOptions;
}) {
	/* 	const cacheFactory = getQueryCacheContext();
	const depsFactory = getQueryDepsStoreContext();
	const instanceFactory = getQueryInstanceContext(); */
	const { cacheFactory, depsFactory, instanceFactory, instanceQueries, endHook,originalResponseStore } =
		getQueryContext() as {
			cacheFactory: Map<string, { expiresAt: Date; item: TMerged }>;
			depsFactory: { [s in string]: Set<string> };
			instanceFactory: Map<string, TurboQuery>;
			instanceQueries: Map<TurboQuery, [typeof props]>;
			endHook: (props: { error?: Error; data?: TData }) => void;
			originalResponseStore: Map<TurboQuery,Map<TDeps,TData>>
		};
	if (!depsFactory[props.cacheKey]) {
		depsFactory[props.cacheKey] = new Set();
	}
	let depsHistory = depsFactory[props.cacheKey];
	let instance = instanceFactory.get(props.cacheKey);
	let ids: string[] = [];
	if (!instance) {
		instance = createTurboQuery({
			itemsCache: {
				get(key) {
					const old_cache = cacheFactory.get(key);
					console.info('get', key, JSON.stringify(old_cache));
					if (!old_cache) {
						return;
					}
					console.log(new Date("2500/1/1").getTime()-Date.now())
					if(old_cache.expiresAt.getTime()<=Date.now()){
						console.log("Get Item from cached But expired")
					}
					
					console.log("GET ORG","CALLING PICKFN", originalResponse.get(props.deps()),props.pickFn({
						Cached: old_cache,
						originalResponse: originalResponse.get(props.deps()),
						ids: ids
					}))
					console.log("ready to pickfn")
					result.data=props.pickFn({
						Cached: old_cache,
						originalResponse: originalResponse.get(props.deps()),
						ids: ids
					})		
					console.log("callled")
					return old_cache
				},
				set(key, value) {
					const cache = cacheFactory.get(key);
					const copied=JSON.parse(JSON.stringify(value.item))
					const prev_original= originalResponse.get(props.deps())
					originalResponse.set(props.deps(),copied) // create a copy so that when cache is changed, originalResponse wont change
					console.log('Set cache', originalResponse,prev_original, cache);


					const temp = props.mergeFn({ Cached: cache, originalResponse: copied,prevOriginal:prev_original });
					if (!cache?.item) {
						let reactive_output = $state({ expiresAt: value.expiresAt, item: temp });
						cacheFactory.set(key, reactive_output);
					} else {
						merge(cache.item, temp);
						cacheFactory.set(key, cache);
					}
					console.log('Value to be set ', temp);
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
		instanceFactory.set(props.cacheKey, instance);
	}
	if (!instance) {
		return console.error('Failed to create turbo query instance !');
	}
	let originalResponse = originalResponseStore.get(instance) ?? new Map() // update as deps updates
	if(!originalResponse){
		originalResponse=new Map()
		originalResponseStore.set(instance,originalResponse)
	}
	const COUNT = 'counterQuery';

	if (!instanceQueries.has(instance)) {
		instanceQueries.set(instance, [props]);
	}
	//instance[COUNT] = instance[COUNT] ? instance[COUNT] + 1 : 1;

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
		queryInstance: instance,
		isLoading: false,
		isSuccess: false,
		isError: false,
		instance: instance,
		refetch: () => {
			return get(true);
		},
		cacheInstance: () => cacheFactory.get(props.cacheKey)
	});

	async function get(force: boolean = false) {
		const result= instance?.query<TData>(props.cacheKey, {
			fetcher: async (key, { signal }) => {
				const res = await props.fetcher(props.deps(), signal);
				if (timer) {
					console.log('clear timer');
					clearTimeout(timer);
				}
				return res;
			},
			...(props.queryOptions ?? {}),
			fresh: force
		});

		return result
	}
	let timer: number;
	$effect(() => {
		console.log('rerun eff', props.deps());
		if (props.deps()) {
			const k = stringify(props.deps());
			untrack(() => {
				const hash = stringify(props.deps());
				const has = depsHistory.has(hash);
				console.log('deps updated', has);
				if (!has) {
					console.log('a new fetch', hash, Array.from(depsHistory), has);
					//  a new query
					timer = setTimeout(() => {
						// if we fetch result in 200ms then do not show spinner
						result.isLoading = true;
						result.isSuccess = false;
					}, 200);
					depsHistory.add(hash);
					30;
				}
				get(!has);
			});
		}
	});
	$effect.root(() => {
		const unsub: Function[] = [];
		unsub.push(
			instance.subscribe(props.cacheKey, 'resolved', function (payload: CustomEvent) {
				result['isError'] = false;
				const val=props.pickFn({
					Cached: cacheFactory.get(props.cacheKey),
					originalResponse: originalResponse.get(props.deps()),
					ids: ids
				})
				result.data = val;
				result.isRefetching = false;
				result.error = undefined;
				result.isAborted = false;
				result.isLoading = false;
				result.isSuccess = true;
				console.log('resolved', JSON.stringify(val,null));
				props.onSuccess?.({
					picked: val,
					originalResponse: originalResponse.get(props.deps()),
					cache: cacheFactory.get(props.cacheKey)
				});
				endHook({ data: payload.detail });
			})
		);
		unsub.push(
			instance.subscribe(props.cacheKey, 'aborted', function (payload: CustomEvent) {
				result.isAborted = true;
				//	result.data = payload;
			})
		);
		unsub.push(
			instance.subscribe(props.cacheKey, 'refetching', function (payload) {
				result.isRefetching = true; //expired or deps changed
				console.log('refetching', payload);
			})
		);
		unsub.push(
			instance.subscribe(props.cacheKey, 'error', function (payload: CustomEvent) {
				result.isError = true;
				result.error = payload.detail;
				props.onError?.(payload.detail);
				endHook({ error: payload.detail });
			})
		);
		unsub.push(
			instance.subscribe(props.cacheKey, 'forgotten', function (payload) {
				//expired
				console.log('cache invalidated', payload);
				get(true);
			})
		);
		return () => {
			console.log('cleanup');
			instance.abort();
			unsub.forEach((v) => v());
			/* instance[COUNT] -= 1;
			if (instance[COUNT] === 0) {
				depsFactory[props.cacheKey] = new Set();
			} */
			// try to abort
			//result = {}; // release memory
		};
	});

	const res = $derived({
		...result,
		//data: cacheFactory.get(props.cacheKey)?.item as TFinal
	});
	/* $effect(() => {
		console.log('res changed', res, Object.keys(cacheFactory.get(props.cacheKey) ?? {}));
	}); */

	//$inspect('inspecting', res).with(console.log);
	return () => res;
}
