import type {
  HotelOption,
  RouteOption,
  TransportMode,
} from "@rendezvous/contracts";

export type CityRef = { id: string; name: string; tz: string };

export type SearchLegInput = {
  origin: CityRef;
  destination: CityRef;
  earliestDepartureAt: string;
  latestArrivalAt: string;
  allowedModes: readonly TransportMode[];
  passengers: 1;
};

export type HotelSearchInput = {
  city: CityRef;
  checkIn: string;
  checkOut: string;
  guests: number;
  rooms: number;
};

export type ProviderFailureCode =
  | "TIMEOUT"
  | "RATE_LIMIT"
  | "PROVIDER"
  | "INVALID_RESPONSE"
  | "UNSUPPORTED"
  | "ABORTED";

export type ProviderFailure = {
  code: ProviderFailureCode;
  tool: string;
  mode?: TransportMode;
  retryable: boolean;
  message: string;
  usedStaleCache?: boolean;
};

export type AdapterResult<T> = {
  status: "fresh" | "cached" | "partial";
  data: readonly T[];
  fetchedAt: string;
  failures: readonly ProviderFailure[];
};

export interface TutuTransportAdapter {
  searchOutbound(
    input: SearchLegInput,
    signal: AbortSignal,
  ): Promise<AdapterResult<RouteOption>>;
  searchReturn(
    input: SearchLegInput,
    signal: AbortSignal,
  ): Promise<AdapterResult<RouteOption>>;
  searchHotels(
    input: HotelSearchInput,
    signal: AbortSignal,
  ): Promise<AdapterResult<HotelOption>>;
}

export interface TutuToolCaller {
  call(
    tool: string,
    input: Readonly<Record<string, unknown>>,
    signal: AbortSignal,
  ): Promise<unknown>;
  close(): Promise<void>;
}

export type TutuMetric = {
  tool: string;
  durationMs: number;
  status: "success" | "error";
  cache: "none" | "hit" | "stale";
};

export interface TutuMetrics {
  record(metric: TutuMetric): void;
}

export const NOOP_TUTU_METRICS: TutuMetrics = { record() {} };
