import type { HotelOption, RouteOption } from "@rendezvous/contracts";
import { ConcurrencyLimiter } from "./concurrency.js";
import { classifyProviderError } from "./errors.js";
import { mapHotelResponse } from "./hotel-mapper.js";
import { callWithRetry } from "./retry.js";
import {
  buildTransportToolInput,
  HotelInputSchema,
  TOOL_BY_MODE,
} from "./tool-registry.js";
import { mapTransportResponse } from "./transport-mapper.js";
import type {
  AdapterResult,
  HotelSearchInput,
  SearchLegInput,
  TutuMetrics,
  TutuToolCaller,
  TutuTransportAdapter,
} from "./types.js";
import { NOOP_TUTU_METRICS } from "./types.js";

export function createTutuTransportAdapter(options: {
  caller: TutuToolCaller;
  concurrency?: ConcurrencyLimiter;
  timeoutMs?: number;
  metrics?: TutuMetrics;
  now?: () => Date;
}): TutuTransportAdapter {
  const concurrency = options.concurrency ?? new ConcurrencyLimiter(6);
  const timeoutMs = options.timeoutMs ?? 8_000;
  const metrics = options.metrics ?? NOOP_TUTU_METRICS;
  const now = options.now ?? (() => new Date());

  async function call(
    tool: string,
    input: Readonly<Record<string, unknown>>,
    signal: AbortSignal,
  ): Promise<unknown> {
    const startedAt = performance.now();
    try {
      const result = await concurrency.run(
        () =>
          callWithRetry({
            tool,
            signal,
            timeoutMs,
            retries: 1,
            operation: (attemptSignal) =>
              options.caller.call(tool, input, attemptSignal),
          }),
        signal,
      );
      metrics.record({
        tool,
        durationMs: performance.now() - startedAt,
        status: "success",
        cache: "none",
      });
      return result;
    } catch (error) {
      metrics.record({
        tool,
        durationMs: performance.now() - startedAt,
        status: "error",
        cache: "none",
      });
      throw error;
    }
  }

  async function searchLeg(
    input: SearchLegInput,
    signal: AbortSignal,
  ): Promise<AdapterResult<RouteOption>> {
    validateLegInput(input);
    const { dates, truncated } = departureDates(
      input.earliestDepartureAt,
      input.latestArrivalAt,
      input.origin.tz,
    );
    const requests = [...new Set(input.allowedModes)].flatMap((mode) =>
      dates.map((date) => ({ mode, date })),
    );
    const settled = await Promise.all(
      requests.map(async ({ mode, date }) => {
        const tool = TOOL_BY_MODE[mode];
        try {
          const raw = await call(
            tool,
            buildTransportToolInput(tool, {
              origin: input.origin.name,
              destination: input.destination.name,
              departureDate: date,
            }),
            signal,
          );
          return mapTransportResponse(raw, {
            tool,
            mode,
            originCityId: input.origin.id,
            destinationCityId: input.destination.id,
          });
        } catch (error) {
          const providerError = classifyProviderError(error, tool);
          if (tool === "search_avia" && providerError.code === "UNSUPPORTED")
            return { options: [], failures: [] };
          const failure = providerError.toFailure();
          return { options: [], failures: [{ ...failure, mode }] };
        }
      }),
    );
    const failures = settled.flatMap((result) => result.failures);
    if (truncated) {
      failures.push({
        code: "UNSUPPORTED",
        tool: "adapter",
        retryable: false,
        message: `Search window spans more than ${MAX_DEPARTURE_DATES} local departure days; only the first ${MAX_DEPARTURE_DATES} were queried`,
      });
    }
    const earliest = Date.parse(input.earliestDepartureAt);
    const latest = Date.parse(input.latestArrivalAt);
    const routes = settled
      .flatMap((result) => result.options.map(({ value }) => value))
      .filter(
        (route) =>
          Date.parse(route.departureAt) >= earliest &&
          Date.parse(route.arrivalAt) <= latest,
      );
    const data = deduplicate(routes);
    const rawMetadataById = Object.fromEntries(
      settled.flatMap((result) =>
        result.options.map(({ value, rawMetadata }) => [value.id, rawMetadata]),
      ),
    );
    return {
      status: failures.length > 0 ? "partial" : "fresh",
      availability:
        data.length > 0
          ? "available"
          : failures.length > 0
            ? "unknown"
            : "none",
      data,
      fetchedAt: now().toISOString(),
      failures,
      rawMetadataById,
    };
  }

  async function searchHotels(
    input: HotelSearchInput,
    signal: AbortSignal,
  ): Promise<AdapterResult<HotelOption>> {
    validateHotelInput(input);
    const fetchedAt = now().toISOString();
    try {
      const raw = await call(
        "search_hotels",
        HotelInputSchema.parse({
          city_name: input.city.name,
          check_in: input.checkIn,
          check_out: input.checkOut,
          adults: input.guests,
          page: 1,
          page_size: 30,
          view: "compact",
        }),
        signal,
      );
      const mapped = mapHotelResponse(raw, {
        cityId: input.city.id,
        checkIn: input.checkIn,
        checkOut: input.checkOut,
        fetchedAt,
      });
      return {
        status: mapped.failures.length > 0 ? "partial" : "fresh",
        availability:
          mapped.options.length > 0
            ? "available"
            : mapped.failures.length > 0
              ? "unknown"
              : "none",
        data: mapped.options.map(({ value }) => value),
        fetchedAt,
        failures: mapped.failures,
        rawMetadataById: Object.fromEntries(
          mapped.options.map(({ value, rawMetadata }) => [
            value.id,
            rawMetadata,
          ]),
        ),
      };
    } catch (error) {
      return {
        status: "partial",
        availability: "unknown",
        data: [],
        fetchedAt,
        failures: [classifyProviderError(error, "search_hotels").toFailure()],
      };
    }
  }

  return { searchOutbound: searchLeg, searchReturn: searchLeg, searchHotels };
}

function validateLegInput(input: SearchLegInput): void {
  const earliest = Date.parse(input.earliestDepartureAt);
  const latest = Date.parse(input.latestArrivalAt);
  if (
    !Number.isFinite(earliest) ||
    !Number.isFinite(latest) ||
    earliest >= latest
  )
    throw new TypeError("Invalid transport search window");
  if (input.origin.id === input.destination.id)
    throw new TypeError("Origin and destination must differ");
  if (input.allowedModes.length === 0)
    throw new TypeError("At least one transport mode is required");
}

function validateHotelInput(input: HotelSearchInput): void {
  if (input.currency !== "RUB") throw new TypeError("Unsupported currency");
  if (
    !/^\d{4}-\d{2}-\d{2}$/.test(input.checkIn) ||
    !/^\d{4}-\d{2}-\d{2}$/.test(input.checkOut) ||
    input.checkIn >= input.checkOut
  ) {
    throw new TypeError("Invalid hotel stay dates");
  }
  if (!Number.isInteger(input.guests) || input.guests < 1 || input.guests > 6)
    throw new TypeError("Guests must be between 1 and 6");
  if (
    !Number.isInteger(input.rooms) ||
    input.rooms < 1 ||
    input.rooms > input.guests
  )
    throw new TypeError("Invalid room count");
}

const MAX_DEPARTURE_DATES = 3;

function departureDates(
  earliestDepartureAt: string,
  latestArrivalAt: string,
  timeZone: string,
): { dates: readonly string[]; truncated: boolean } {
  const first = zonedDate(new Date(earliestDepartureAt), timeZone);
  const last = zonedDate(new Date(latestArrivalAt), timeZone);
  const dates: string[] = [];
  const end = Date.parse(`${last}T00:00:00Z`);
  let cursor = Date.parse(`${first}T00:00:00Z`);
  while (cursor <= end && dates.length < MAX_DEPARTURE_DATES) {
    dates.push(new Date(cursor).toISOString().slice(0, 10));
    cursor += 86_400_000;
  }
  return { dates, truncated: cursor <= end };
}

function zonedDate(instant: Date, timeZone: string): string {
  const parts = new Intl.DateTimeFormat("en-US", {
    timeZone,
    year: "numeric",
    month: "2-digit",
    day: "2-digit",
  }).formatToParts(instant);
  const part = (type: Intl.DateTimeFormatPartTypes) =>
    parts.find((candidate) => candidate.type === type)?.value;
  const year = part("year");
  const month = part("month");
  const day = part("day");
  if (!year || !month || !day) throw new TypeError("Invalid origin timezone");
  return `${year}-${month}-${day}`;
}

function deduplicate(routes: readonly RouteOption[]): readonly RouteOption[] {
  return [...new Map(routes.map((route) => [route.id, route])).values()];
}
