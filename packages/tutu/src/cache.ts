import type { HotelOption, RouteOption } from "@rendezvous/contracts";
import { TUTU_SCHEMA_VERSION } from "./tool-registry.js";
import type {
  AdapterResult,
  HotelSearchInput,
  ProviderFailure,
  SearchLegInput,
  TutuMetrics,
  TutuTransportAdapter,
} from "./types.js";
import { NOOP_TUTU_METRICS } from "./types.js";

export type CacheEntry<T> = {
  value: T;
  fetchedAt: string;
  expiresAt: number;
  staleUntil: number;
};

export interface TravelCache {
  get<T>(key: string): Promise<CacheEntry<T> | null>;
  set<T>(key: string, entry: CacheEntry<T>): Promise<void>;
}

export class MemoryTravelCache implements TravelCache {
  readonly #entries = new Map<string, CacheEntry<unknown>>();

  async get<T>(key: string): Promise<CacheEntry<T> | null> {
    return (this.#entries.get(key) as CacheEntry<T> | undefined) ?? null;
  }

  async set<T>(key: string, entry: CacheEntry<T>): Promise<void> {
    this.#entries.set(key, entry);
  }
}

export function createTravelCacheKey(
  method: "outbound" | "return" | "hotels",
  input: SearchLegInput | HotelSearchInput,
): string {
  return JSON.stringify(
    canonicalize({ schema: TUTU_SCHEMA_VERSION, method, input }),
  );
}

export function createCachedTutuAdapter(options: {
  adapter: TutuTransportAdapter;
  cache: TravelCache;
  ttlMs?: number;
  staleTtlMs?: number;
  metrics?: TutuMetrics;
  now?: () => number;
}): TutuTransportAdapter {
  const ttlMs = options.ttlMs ?? 12 * 60_000;
  const staleTtlMs = options.staleTtlMs ?? 24 * 60 * 60_000;
  const metrics = options.metrics ?? NOOP_TUTU_METRICS;
  const now = options.now ?? Date.now;

  async function cached<T>(
    method: "outbound" | "return" | "hotels",
    input: SearchLegInput | HotelSearchInput,
    signal: AbortSignal,
    load: () => Promise<AdapterResult<T>>,
    mergeStale?: (
      fresh: readonly T[],
      stale: readonly T[],
      failures: readonly ProviderFailure[],
    ) => readonly T[],
  ): Promise<AdapterResult<T>> {
    signal.throwIfAborted();
    const key = createTravelCacheKey(method, input);
    const entry = await options.cache.get<AdapterResult<T>>(key);
    const current = now();
    if (entry && current < entry.expiresAt) {
      metrics.record({
        tool: method,
        durationMs: 0,
        status: "success",
        cache: "hit",
      });
      return { ...entry.value, status: "cached", fetchedAt: entry.fetchedAt };
    }

    try {
      const result = await load();
      if (result.status === "partial" && entry && current < entry.staleUntil) {
        const data = mergeStale
          ? mergeStale(result.data, entry.value.data, result.failures)
          : result.data.length > 0
            ? result.data
            : entry.value.data;
        if (data.length > result.data.length || result.data.length === 0) {
          metrics.record({
            tool: method,
            durationMs: 0,
            status: "error",
            cache: "stale",
          });
          return {
            status: "partial",
            availability: data.length > 0 ? "available" : "unknown",
            data,
            fetchedAt: entry.fetchedAt,
            rawMetadataById: {
              ...entry.value.rawMetadataById,
              ...result.rawMetadataById,
            },
            failures: result.failures.map((failure) => ({
              ...failure,
              usedStaleCache: true,
            })),
          };
        }
      }
      if (result.status !== "partial") {
        const fetchedAt = result.fetchedAt;
        await options.cache.set(key, {
          value: result,
          fetchedAt,
          expiresAt: current + ttlMs,
          staleUntil: current + ttlMs + staleTtlMs,
        });
      }
      return result;
    } catch (error) {
      if (isValidationError(error)) throw error;
      if (!entry || current >= entry.staleUntil || signal.aborted) throw error;
      const failure: ProviderFailure = {
        code: "PROVIDER",
        tool: method,
        retryable: true,
        message: "Tutu request failed; stale cache was used",
        usedStaleCache: true,
      };
      return staleResult(entry, [failure], method, metrics);
    }
  }

  return {
    searchOutbound: (input, signal) =>
      cached(
        "outbound",
        input,
        signal,
        () => options.adapter.searchOutbound(input, signal),
        mergeFailedRouteModes,
      ),
    searchReturn: (input, signal) =>
      cached(
        "return",
        input,
        signal,
        () => options.adapter.searchReturn(input, signal),
        mergeFailedRouteModes,
      ),
    searchHotels: (input, signal) =>
      cached<HotelOption>("hotels", input, signal, () =>
        options.adapter.searchHotels(input, signal),
      ),
  };
}

function mergeFailedRouteModes(
  fresh: readonly RouteOption[],
  stale: readonly RouteOption[],
  failures: readonly ProviderFailure[],
): readonly RouteOption[] {
  const failedModes = new Set(
    failures.flatMap((failure) => (failure.mode ? [failure.mode] : [])),
  );
  const freshIds = new Set(fresh.map((route) => route.id));
  const combined = [
    ...fresh,
    ...stale.filter(
      (route) => failedModes.has(route.mode) && !freshIds.has(route.id),
    ),
  ];
  return [...new Map(combined.map((route) => [route.id, route])).values()];
}

function staleResult<T>(
  entry: CacheEntry<AdapterResult<T>>,
  failures: readonly ProviderFailure[],
  tool: string,
  metrics: TutuMetrics,
): AdapterResult<T> {
  metrics.record({ tool, durationMs: 0, status: "error", cache: "stale" });
  return {
    status: "partial",
    availability: entry.value.data.length > 0 ? "available" : "unknown",
    data: entry.value.data,
    fetchedAt: entry.fetchedAt,
    ...(entry.value.rawMetadataById
      ? { rawMetadataById: entry.value.rawMetadataById }
      : {}),
    failures: failures.map((failure) => ({ ...failure, usedStaleCache: true })),
  };
}

function isValidationError(error: unknown): boolean {
  return (
    error instanceof TypeError ||
    (error instanceof Error && error.name === "ZodError")
  );
}

function canonicalize(value: unknown): unknown {
  if (Array.isArray(value)) return value.map(canonicalize);
  if (typeof value !== "object" || value === null) return value;
  return Object.fromEntries(
    Object.entries(value)
      .sort(([left], [right]) => left.localeCompare(right))
      .map(([key, child]) => [key, canonicalize(child)]),
  );
}
