import type { RouteOption } from "@rendezvous/contracts";
import { describe, expect, it, vi } from "vitest";
import { createTutuTransportAdapter } from "./adapter.js";
import {
  createCachedTutuAdapter,
  createTravelCacheKey,
  MemoryTravelCache,
} from "./cache.js";
import type {
  AdapterResult,
  SearchLegInput,
  TutuToolCaller,
  TutuTransportAdapter,
} from "./types.js";

const MOSCOW_ID = "11111111-1111-4111-8111-111111111111";
const YAROSLAVL_ID = "22222222-2222-4222-8222-222222222222";

const input: SearchLegInput = {
  origin: { id: MOSCOW_ID, name: "Москва", tz: "Europe/Moscow" },
  destination: { id: YAROSLAVL_ID, name: "Ярославль", tz: "Europe/Moscow" },
  earliestDepartureAt: "2026-09-04T05:00:00.000Z",
  latestArrivalAt: "2026-09-04T18:00:00.000Z",
  allowedModes: ["train", "bus"],
  passengers: 1,
};

const route: RouteOption = {
  id: "tutu:train:fixture",
  originCityId: MOSCOW_ID,
  destinationCityId: YAROSLAVL_ID,
  mode: "train",
  departureAt: "2026-09-04T06:10:00.000Z",
  arrivalAt: "2026-09-04T09:40:00.000Z",
  durationMinutes: 210,
  price: { amount: 1529.36, currency: "RUB" },
  transfers: 0,
  bookingUrl: "https://www.tutu.ru/poezda/fixture",
  source: "tutu",
};

describe("Tutu adapter", () => {
  it("keeps successful modes when another mode fails", async () => {
    const caller: TutuToolCaller = {
      call: vi.fn(async (tool) => {
        if (tool === "search_bus") throw new Error("HTTP 503");
        return {
          offers: [
            {
              offer_id: "fixture",
              price: route.price,
              departure_at: "2026-09-04T09:10:00+03:00",
              arrival_at: "2026-09-04T12:40:00+03:00",
              search_results_url: route.bookingUrl,
            },
          ],
        };
      }),
      close: vi.fn(),
    };
    const adapter = createTutuTransportAdapter({ caller, timeoutMs: 1000 });
    const result = await adapter.searchOutbound(
      input,
      new AbortController().signal,
    );
    expect(result.status).toBe("partial");
    expect(result.availability).toBe("available");
    expect(result.data).toEqual([route]);
    expect(result.rawMetadataById?.[route.id]).toEqual(
      expect.objectContaining({ providerOfferId: "fixture" }),
    );
    expect(result.failures).toEqual([
      expect.objectContaining({
        code: "PROVIDER",
        mode: "bus",
        retryable: true,
      }),
    ]);
    expect(caller.call).toHaveBeenCalledTimes(3);
  });

  it("treats a missing avia geo id as normal mode unavailability", async () => {
    const caller: TutuToolCaller = {
      call: vi.fn(async (tool) => {
        if (tool === "search_avia")
          throw new Error(
            "avia requires avia_id for destination, but the geo lookup did not return one",
          );
        return {
          offers: [
            {
              offer_id: "fixture",
              price: route.price,
              departure_at: "2026-09-04T09:10:00+03:00",
              arrival_at: "2026-09-04T12:40:00+03:00",
              search_results_url: route.bookingUrl,
            },
          ],
        };
      }),
      close: vi.fn(),
    };
    const adapter = createTutuTransportAdapter({ caller, timeoutMs: 1000 });

    const result = await adapter.searchOutbound(
      { ...input, allowedModes: ["air", "train"] },
      new AbortController().signal,
    );

    expect(result).toMatchObject({
      status: "fresh",
      availability: "available",
      failures: [],
      data: [route],
    });
    expect(caller.call).toHaveBeenCalledTimes(2);
  });

  it("includes the full window and modes in canonical cache keys", () => {
    expect(createTravelCacheKey("outbound", input)).not.toBe(
      createTravelCacheKey("outbound", {
        ...input,
        latestArrivalAt: "2026-09-04T19:00:00.000Z",
      }),
    );
    expect(createTravelCacheKey("outbound", input)).not.toBe(
      createTravelCacheKey("outbound", { ...input, allowedModes: ["train"] }),
    );
  });

  it("caps fan-out at three local days and reports truncation", async () => {
    const caller: TutuToolCaller = {
      call: vi.fn(async () => ({ offers: [] })),
      close: vi.fn(),
    };
    const adapter = createTutuTransportAdapter({ caller, timeoutMs: 1000 });
    const result = await adapter.searchOutbound(
      {
        ...input,
        earliestDepartureAt: "2026-09-04T05:00:00.000Z",
        latestArrivalAt: "2026-09-09T18:00:00.000Z",
      },
      new AbortController().signal,
    );
    expect(caller.call).toHaveBeenCalledTimes(6);
    const dates = new Set(
      (caller.call as ReturnType<typeof vi.fn>).mock.calls.map(
        (call) => call[1].departure_date,
      ),
    );
    expect(dates).toEqual(new Set(["2026-09-04", "2026-09-05", "2026-09-06"]));
    expect(result.status).toBe("partial");
    expect(result.failures).toContainEqual(
      expect.objectContaining({
        code: "UNSUPPORTED",
        retryable: false,
      }),
    );
  });

  it("serves fresh cache and explicitly marks stale fallback", async () => {
    let current = 1_000;
    const fresh: AdapterResult<RouteOption> = {
      status: "fresh",
      availability: "available",
      data: [route],
      fetchedAt: "2026-08-19T00:00:00.000Z",
      failures: [],
    };
    const base: TutuTransportAdapter = {
      searchOutbound: vi
        .fn()
        .mockResolvedValueOnce(fresh)
        .mockRejectedValueOnce(new Error("offline")),
      searchReturn: vi.fn().mockResolvedValue(fresh),
      searchHotels: vi.fn(),
    };
    const cached = createCachedTutuAdapter({
      adapter: base,
      cache: new MemoryTravelCache(),
      ttlMs: 100,
      staleTtlMs: 1000,
      now: () => current,
    });
    const signal = new AbortController().signal;
    expect((await cached.searchOutbound(input, signal)).status).toBe("fresh");
    current = 1050;
    expect((await cached.searchOutbound(input, signal)).status).toBe("cached");
    current = 1200;
    const stale = await cached.searchOutbound(input, signal);
    expect(stale.status).toBe("partial");
    expect(stale.data).toEqual([route]);
    expect(stale.failures[0]?.usedStaleCache).toBe(true);
  });

  it("merges stale routes only for a failed transport mode", async () => {
    let current = 1_000;
    const busRoute: RouteOption = {
      ...route,
      id: "tutu:bus:fixture",
      mode: "bus",
    };
    const fresh: AdapterResult<RouteOption> = {
      status: "fresh",
      availability: "available",
      data: [route, busRoute],
      fetchedAt: "2026-08-19T00:00:00.000Z",
      failures: [],
    };
    const degraded: AdapterResult<RouteOption> = {
      status: "partial",
      availability: "available",
      data: [route],
      fetchedAt: "2026-08-19T00:15:00.000Z",
      failures: [
        {
          code: "TIMEOUT",
          tool: "search_bus",
          mode: "bus",
          retryable: true,
          message: "timeout",
        },
      ],
    };
    const base: TutuTransportAdapter = {
      searchOutbound: vi
        .fn()
        .mockResolvedValueOnce(fresh)
        .mockResolvedValueOnce(degraded),
      searchReturn: vi.fn(),
      searchHotels: vi.fn(),
    };
    const cached = createCachedTutuAdapter({
      adapter: base,
      cache: new MemoryTravelCache(),
      ttlMs: 100,
      staleTtlMs: 1000,
      now: () => current,
    });
    const signal = new AbortController().signal;
    await cached.searchOutbound(input, signal);
    current = 1200;
    const result = await cached.searchOutbound(input, signal);
    expect(result.data).toEqual([route, busRoute]);
    expect(result.failures[0]?.usedStaleCache).toBe(true);
    expect(result.fetchedAt).toBe(fresh.fetchedAt);
  });

  it("prefers fresh routes over stale routes with the same id", async () => {
    let current = 1_000;
    const freshShared: RouteOption = {
      ...route,
      id: "tutu:bus:shared",
      mode: "bus",
      price: { amount: 999, currency: "RUB" },
    };
    const staleShared: RouteOption = {
      ...route,
      id: "tutu:bus:shared",
      mode: "bus",
      price: { amount: 1234.5, currency: "RUB" },
    };
    const staleOther: RouteOption = {
      ...route,
      id: "tutu:bus:other",
      mode: "bus",
    };
    const fresh: AdapterResult<RouteOption> = {
      status: "fresh",
      availability: "available",
      data: [staleShared, staleOther],
      fetchedAt: "2026-08-19T00:00:00.000Z",
      failures: [],
      rawMetadataById: {
        [staleOther.id]: { providerField: "stale" },
      },
    };
    const degraded: AdapterResult<RouteOption> = {
      status: "partial",
      availability: "available",
      data: [freshShared],
      fetchedAt: "2026-08-19T00:15:00.000Z",
      failures: [
        {
          code: "INVALID_RESPONSE",
          tool: "search_bus",
          mode: "bus",
          retryable: false,
          message: "partial mapping failure",
        },
      ],
      rawMetadataById: {
        [freshShared.id]: { providerField: "fresh" },
      },
    };
    const base: TutuTransportAdapter = {
      searchOutbound: vi
        .fn()
        .mockResolvedValueOnce(fresh)
        .mockResolvedValueOnce(degraded),
      searchReturn: vi.fn(),
      searchHotels: vi.fn(),
    };
    const cached = createCachedTutuAdapter({
      adapter: base,
      cache: new MemoryTravelCache(),
      ttlMs: 100,
      staleTtlMs: 1000,
      now: () => current,
    });
    const signal = new AbortController().signal;
    await cached.searchOutbound(input, signal);
    current = 1200;
    const result = await cached.searchOutbound(input, signal);
    expect(result.data).toEqual([freshShared, staleOther]);
    expect(result.rawMetadataById).toEqual({
      [staleOther.id]: { providerField: "stale" },
      [freshShared.id]: { providerField: "fresh" },
    });
  });

  it("does not keep partial results fresh for the full TTL", async () => {
    const partial: AdapterResult<RouteOption> = {
      status: "partial",
      availability: "available",
      data: [route],
      fetchedAt: "2026-08-19T00:00:00.000Z",
      failures: [
        {
          code: "TIMEOUT",
          tool: "search_bus",
          mode: "bus",
          retryable: true,
          message: "timeout",
        },
      ],
    };
    const searchOutbound = vi.fn().mockResolvedValue(partial);
    const cached = createCachedTutuAdapter({
      adapter: {
        searchOutbound,
        searchReturn: vi.fn(),
        searchHotels: vi.fn(),
      },
      cache: new MemoryTravelCache(),
    });
    const signal = new AbortController().signal;
    await cached.searchOutbound(input, signal);
    await cached.searchOutbound(input, signal);
    expect(searchOutbound).toHaveBeenCalledTimes(2);
  });

  it("never masks validation errors with stale cache", async () => {
    const fresh: AdapterResult<RouteOption> = {
      status: "fresh",
      availability: "available",
      data: [route],
      fetchedAt: "2026-08-19T00:00:00.000Z",
      failures: [],
    };
    const searchOutbound = vi
      .fn()
      .mockResolvedValueOnce(fresh)
      .mockRejectedValueOnce(new TypeError("invalid input"));
    let current = 1_000;
    const cached = createCachedTutuAdapter({
      adapter: {
        searchOutbound,
        searchReturn: vi.fn(),
        searchHotels: vi.fn(),
      },
      cache: new MemoryTravelCache(),
      ttlMs: 10,
      now: () => current,
    });
    const signal = new AbortController().signal;
    await cached.searchOutbound(input, signal);
    current = 1_100;
    await expect(cached.searchOutbound(input, signal)).rejects.toThrow(
      "invalid input",
    );
  });
});
