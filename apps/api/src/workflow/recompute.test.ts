import type { HotelOption, RouteOption } from "@rendezvous/contracts";
import {
  CITY_CATALOG,
  createCandidateGenerator,
  DEMO_PARTICIPANTS,
  DEMO_TRIP,
  type CandidateGenerator,
} from "@rendezvous/domain";
import type {
  AdapterResult,
  HotelSearchInput,
  SearchLegInput,
  TutuTransportAdapter,
} from "@rendezvous/tutu";
import { describe, expect, it, vi } from "vitest";
import type { RecomputeJob } from "../repositories/trip-repository.js";
import {
  RecomputeRunner,
  type RecomputeRepository,
  type WorkflowLog,
} from "./recompute.js";

const job: RecomputeJob = {
  id: "30000000-0000-4000-8000-000000000001",
  tripId: DEMO_TRIP.id,
  revision: DEMO_TRIP.revision,
};
const fetchedAt = "2026-09-01T12:00:00.000Z";
const snapshot = {
  trip: DEMO_TRIP,
  participants: DEMO_PARTICIPANTS.slice(0, 2),
};
const log: WorkflowLog = { info: vi.fn(), error: vi.fn() };

describe("recompute workflow", () => {
  it("publishes a successful ranking", async () => {
    const repository = repositoryFixture();
    const adapter = adapterFixture();
    const runner = runnerFixture(repository, adapter);

    const result = await runner.run(job);

    expect(result.status).toBe("PERSISTED");
    expect(result.destinations).toBeGreaterThan(0);
    expect(repository.persistIfCurrent).toHaveBeenCalledOnce();
    expect(repository.persistIfCurrent).toHaveBeenLastCalledWith(
      job,
      expect.objectContaining({ ranked: expect.any(Array) }),
      expect.arrayContaining([
        expect.objectContaining({ valid: true, degraded: false }),
      ]),
      false,
    );
  });

  it("keeps a partial provider result publishable and marks it degraded", async () => {
    const repository = repositoryFixture();
    const adapter = adapterFixture({ hotelStatus: "partial" });
    const result = await runnerFixture(repository, adapter).run(job);

    expect(result.status).toBe("PERSISTED");
    expect(result.destinations).toBeGreaterThan(0);
    expect(repository.persistIfCurrent).toHaveBeenLastCalledWith(
      job,
      expect.any(Object),
      expect.arrayContaining([expect.objectContaining({ degraded: true })]),
      true,
    );
  });

  it("turns a total provider failure into a degraded empty result and retries candidates once", async () => {
    const repository = repositoryFixture();
    const baseGenerator = createCandidateGenerator(CITY_CATALOG);
    const generator: CandidateGenerator = {
      algorithmVersion: baseGenerator.algorithmVersion,
      generate: vi.fn((input) => baseGenerator.generate(input)),
    };
    const adapter = adapterFixture({ throwTransport: true });

    const result = await runnerFixture(repository, adapter, generator).run(job);

    expect(result).toEqual({ status: "PERSISTED", destinations: 0 });
    expect(generator.generate).toHaveBeenCalledTimes(2);
    expect(generator.generate).toHaveBeenNthCalledWith(
      1,
      expect.objectContaining({ limit: 8 }),
    );
    expect(generator.generate).toHaveBeenNthCalledWith(
      2,
      expect.objectContaining({ limit: 16 }),
    );
    expect(repository.persistIfCurrent).toHaveBeenLastCalledWith(
      job,
      expect.objectContaining({ ranked: [] }),
      [],
      true,
    );
  });

  it("exits stale before any provider call", async () => {
    const repository = repositoryFixture({ currentRevision: job.revision + 1 });
    const adapter = adapterFixture();

    await expect(runnerFixture(repository, adapter).run(job)).resolves.toEqual({
      status: "STALE",
      destinations: 0,
    });
    expect(adapter.searchOutbound).not.toHaveBeenCalled();
    expect(repository.persistIfCurrent).not.toHaveBeenCalled();
  });
});

function runnerFixture(
  repository: RecomputeRepository,
  adapter: TutuTransportAdapter,
  generator: CandidateGenerator = createCandidateGenerator(CITY_CATALOG),
) {
  return new RecomputeRunner(
    repository,
    generator,
    adapter,
    CITY_CATALOG,
    log,
    5_000,
  );
}

function repositoryFixture(options?: {
  currentRevision?: number;
}): RecomputeRepository & {
  persistIfCurrent: ReturnType<
    typeof vi.fn<RecomputeRepository["persistIfCurrent"]>
  >;
} {
  return {
    emitProgress: vi.fn(async () => undefined),
    currentRevision: vi.fn(
      async () => options?.currentRevision ?? job.revision,
    ),
    getPrivateTrip: vi.fn(async () => snapshot),
    persistIfCurrent: vi.fn(async () => "persisted" as const),
  };
}

function adapterFixture(options?: {
  hotelStatus?: AdapterResult<HotelOption>["status"];
  throwTransport?: boolean;
}): TutuTransportAdapter {
  return {
    searchOutbound: vi.fn(async (input: SearchLegInput) => {
      if (options?.throwTransport) throw new Error("outbound unavailable");
      return adapterResult([outboundRoute(input)]);
    }),
    searchReturn: vi.fn(async (input: SearchLegInput) => {
      if (options?.throwTransport) throw new Error("return unavailable");
      return adapterResult([returnRoute(input)]);
    }),
    searchHotels: vi.fn(async (input: HotelSearchInput) => {
      const hotels: readonly HotelOption[] =
        options?.hotelStatus === "partial"
          ? []
          : [
              {
                id: `hotel-${input.city.id}`,
                cityId: input.city.id,
                name: "Тестовый отель",
                totalPrice: { amount: 2_000, currency: "RUB" },
                checkIn: input.checkIn,
                checkOut: input.checkOut,
                fetchedAt,
                source: "tutu",
              },
            ];
      return adapterResult(hotels, options?.hotelStatus);
    }),
  };
}

function outboundRoute(input: SearchLegInput): RouteOption {
  const departureAt = shiftHours(input.earliestDepartureAt, 1);
  const arrivalAt = shiftHours(departureAt, 2);
  return route(input, departureAt, arrivalAt);
}

function returnRoute(input: SearchLegInput): RouteOption {
  const arrivalAt = shiftHours(input.latestArrivalAt, -1);
  const departureAt = shiftHours(arrivalAt, -2);
  return route(input, departureAt, arrivalAt);
}

function route(
  input: SearchLegInput,
  departureAt: string,
  arrivalAt: string,
): RouteOption {
  return {
    id: `${input.origin.id}-${input.destination.id}-${departureAt}`,
    originCityId: input.origin.id,
    destinationCityId: input.destination.id,
    mode: "train",
    departureAt,
    arrivalAt,
    durationMinutes: 120,
    price: { amount: 1_000, currency: "RUB" },
    transfers: 0,
    source: "tutu",
  };
}

function adapterResult<T>(
  data: readonly T[],
  status: AdapterResult<T>["status"] = "fresh",
): AdapterResult<T> {
  return {
    status,
    data,
    fetchedAt,
    failures:
      status === "partial"
        ? [
            {
              code: "PROVIDER",
              tool: "fixture",
              retryable: true,
              message: "partial fixture",
            },
          ]
        : [],
  };
}

function shiftHours(value: string, hours: number): string {
  return new Date(Date.parse(value) + hours * 3_600_000).toISOString();
}
