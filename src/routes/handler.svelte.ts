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
const globalCacheFactory: Map<string, { expiresAt: Date; item: any }> = new Map();

const QUERY_CLIENT_TURBO = 'turbo query context';
const QUERY_CACHE_CLIENT_TURBO = 'turbo query cache context';
const QUERY_CONTEXT_INSTANCE = 'turbo query instance context';
const QUERY_DEPS_STORE_CLIENT_TURBO = 'turbo query deps store context';
export const setQueryContext = () => {
	return setContext(QUERY_CLIENT_TURBO, {
		cacheFactory: new ReactiveMap(),
		depsFactory: {},
		instanceFactory: new Map(),
		instanceQueries: new Map()
	});
};
export const getQueryContext = () => {
	return getContext(QUERY_CLIENT_TURBO) as {
		cacheFactory: typeof globalCacheFactory;
		depsFactory: typeof DepsFactory;
		instanceFactory: typeof instanceFactory;
		instanceQueries: Map<TurboQuery, unknown>;
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

export function createQuery<TData, TError, TDeps, TMerged, TFinal>(props: {
	fetcher: (args: TDeps) => Promise<TData>;
	cacheKey: string;
	deps: () => TDeps;
	mergeFn: (args: {
		Cached?: { expiresAt: Date; item: TMerged };
		originalResponse: TData;
	}) => TMerged;
	pickFn: (args: { Cached: { expiresAt: Date; item: TMerged }; originalResponse: TData }) => TFinal;
	onSuccess?: (data: {
		picked: TFinal;
		originalResponse: TData;
		cache: { expiresAt: Date; item: TMerged };
	}) => void;
	onError?: (err: TError) => void;
	queryOptions?: TurboQueryOptions;
}) {
	/* 	const cacheFactory = getQueryCacheContext();
	const depsFactory = getQueryDepsStoreContext();
	const instanceFactory = getQueryInstanceContext(); */
	const { cacheFactory, depsFactory, instanceFactory, instanceQueries } = getQueryContext();

	if (!depsFactory[props.cacheKey]) {
		depsFactory[props.cacheKey] = new Set<string>();
	}
	let depsHistory = depsFactory[props.cacheKey];
	let instance = instanceFactory.get(props.cacheKey);

	let originalResponse: TData;
	if (!instance) {
		instance = createTurboQuery({
			itemsCache: {
				get(key) {
					const old_cache = cacheFactory.get(key);
					console.log('get', key, old_cache);
					if (!old_cache) {
						return;
					}
					return {
						expiresAt: old_cache?.expiresAt,
						item: props.pickFn({
							Cached: old_cache?.item,
							originalResponse: originalResponse
						})
					};
				},
				set(key, value) {
					const cache = cacheFactory.get(key);
					originalResponse = JSON.parse(JSON.stringify(value.item));
					console.log('Set cache', originalResponse, cache);
					const temp = props.mergeFn({ Cached: cache, originalResponse: value.item });
					if (!cache) {
						let reactive_output = $state({ expiresAt: value.expiresAt, item: temp });
						cacheFactory.set(key, reactive_output);
					} else {
						Object.assign(cache.item, temp);
						cacheFactory.set(key, cache);
					}
					console.log('setting ', temp);
				},
				keys() {
					return cacheFactory.keys();
				},
				delete(key) {
					return cacheFactory.delete(key);
				}
			}
		});
		instanceFactory.set(props.cacheKey, instance);
	}
	if (!instance) {
		return console.error('Failed to create turbo query instance !');
	}
	const COUNT = 'counterQuery';

	instance[COUNT] = instance[COUNT] ? instance[COUNT] + 1 : 1;

	let result: {
		data: TFinal | undefined;
		isError: boolean;
		isRefetching: boolean;
		isLoading: boolean;
		isAborted: boolean;
		isSuccess: boolean;
		instance: TurboQuery;
		cacheInstance: () => unknown;
		refetch: () => Promise<void>;
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
			get(true);
		},
		cacheInstance: () => cacheFactory.get(props.cacheKey)
	});
	let refetch = false;
	async function get(force: boolean = false) {
		instance?.query(props.cacheKey, {
			fetcher: async (key, { signal }) => {
				const res = await props.fetcher(props.deps());
				if (timer) {
					console.log('clear timer');
					clearTimeout(timer);
				}
				return res;
			},
			...(props.queryOptions ?? {}),
			fresh: force
		});
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
				result.data = payload.detail;
				result.isRefetching = false;
				result.error = undefined;
				result.isAborted = false;
				result.isLoading = false;
				result.isSuccess = true;
				console.log('resolved', payload.detail);
				props.onSuccess?.({
					picked: payload.detail,
					originalResponse: originalResponse,
					cache: cacheFactory.get(props.cacheKey)
				});
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
			})
		);
		unsub.push(
			instance.subscribe(props.cacheKey, 'error', function (payload: CustomEvent) {
				result.isError = true;
				result.error = payload.detail;
				props.onError?.(payload.detail);
			})
		);
		unsub.push(
			instance.subscribe(props.cacheKey, 'forgotten', function (payload) {
				//expired
			})
		);
		return () => {
			console.log('cleanup');
			instance.abort();
			unsub.forEach((v) => v());
			instance[COUNT] -= 1;
			if (instance[COUNT] === 0) {
				depsFactory[props.cacheKey] = new Set();
			}
			// try to abort
			//result = {}; // release memory
		};
	});

	const res = $derived({
		...result,
		data: cacheFactory.get(props.cacheKey)?.item as TFinal
	});
	/* $effect(() => {
		console.log('res changed', res, Object.keys(cacheFactory.get(props.cacheKey) ?? {}));
	}); */

	//$inspect('inspecting', res).with(console.log);
	return () => res;
}
