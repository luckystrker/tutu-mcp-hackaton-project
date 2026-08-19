import { randomUUID } from "node:crypto";
import {
  CreateTripResponseSchema,
  type HotelOption,
  type RouteOption,
  TripOrganizerDtoSchema,
} from "@rendezvous/contracts";
import {
  CITY_BY_ID,
  CITY_CATALOG,
  CITY_CATALOG_VERSION,
  createCandidateGenerator,
} from "@rendezvous/domain";
import type {
  AdapterResult,
  HotelSearchInput,
  SearchLegInput,
  TutuTransportAdapter,
} from "@rendezvous/tutu";
import { afterAll, beforeAll, describe, expect, it } from "vitest";
import { buildApp } from "./app.js";
import { TripService } from "./application/trip-service.js";
import { createDatabase, type Database } from "./db.js";
import { TripRepository } from "./repositories/trip-repository.js";
import {
  createMastraRecomputeWorkflow,
  RecomputeRunner,
} from "./workflow/recompute.js";
import { RecomputeWorker } from "./workflow/worker.js";

const databaseUrl = process.env.DATABASE_URL;
const describeDatabase = databaseUrl ? describe : describe.skip;
const organizerId = randomUUID();
const memberId = randomUUID();
const fetchedAt = "2026-09-01T12:00:00.000Z";
const scoring = {
  together: 20,
  cost: 40,
  travel: 20,
  synchronization: 10,
  fairness: 10,
};

describeDatabase("scoring and membership integrity", () => {
  let database: Database;
  let repository: TripRepository;
  let app: ReturnType<typeof buildApp>;
  let tripId = "";
  const adapter = new FakeAdapter();

  beforeAll(async () => {
    database = createDatabase(databaseUrl!);
    await database.query(
      `DELETE FROM rendezvous.trips WHERE organizer_user_id=ANY($1::uuid[])`,
      [[organizerId, memberId]],
    );
    repository = new TripRepository(database);
    await repository.syncCityCatalog(CITY_CATALOG, CITY_CATALOG_VERSION);
    app = buildApp({
      readinessCheck: () => database.checkReadiness(),
      tripService: new TripService(repository, CITY_BY_ID),
    });
    await app.ready();
  });

  afterAll(async () => {
    if (tripId)
      await database.query(`DELETE FROM rendezvous.trips WHERE id=$1`, [
        tripId,
      ]);
    await database.query(
      `DELETE FROM rendezvous.users WHERE id=ANY($1::uuid[])`,
      [[organizerId, memberId]],
    );
    await app.close();
    await database.close();
  });

  it("defers rescore while a recompute is pending and recomputes with new scoring", async () => {
    tripId = await createReadyTrip();

    const deferred = await app.inject({
      method: "PUT",
      url: `/api/trips/${tripId}/scoring`,
      headers: actorHeaders(organizerId, "Организатор"),
      payload: scoring,
    });
    expect(deferred.statusCode, deferred.body).toBe(200);
    const deferredView = TripOrganizerDtoSchema.parse(deferred.json());
    expect(deferredView.trip.revision).toBe(3);
    expect(deferredView.trip.rankingVersion).toBe(1);

    const pendingResults = await database.query(
      `SELECT count(*)::int AS count FROM rendezvous.trip_results WHERE trip_id=$1`,
      [tripId],
    );
    expect(pendingResults.rows[0]!.count).toBe(0);

    const workerErrors: unknown[] = [];
    const worker = buildWorker(adapter, workerErrors);
    await expect(worker.drain()).resolves.toBe(1);
    await worker.close();
    expect(workerErrors).toEqual([]);

    const jobs = await database.query<{ revision: number; status: string }>(
      `SELECT revision,status FROM rendezvous.recompute_jobs WHERE trip_id=$1 ORDER BY revision`,
      [tripId],
    );
    expect(jobs.rows).toEqual([
      { revision: 2, status: "STALE" },
      { revision: 3, status: "SUCCEEDED" },
    ]);
    const results = await database.query<{
      revision: number;
      ranking_version: number;
      scoring: Record<string, number>;
    }>(
      `SELECT revision,ranking_version,solver_output->'scoring' AS scoring FROM rendezvous.trip_results WHERE trip_id=$1`,
      [tripId],
    );
    expect(results.rows).toEqual([
      {
        revision: 3,
        ranking_version: 1,
        scoring: {
          together: 0.2,
          cost: 0.4,
          travel: 0.2,
          synchronization: 0.1,
          fairness: 0.1,
        },
      },
    ]);
  });

  it("keeps scoring updates working after a participant leaves", async () => {
    const left = await app.inject({
      method: "POST",
      url: `/api/trips/${tripId}/leave`,
      headers: actorHeaders(memberId, "Участник"),
    });
    expect(left.statusCode, left.body).toBe(204);

    const trip = await database.query<{
      revision: number;
      compute_status: string;
    }>(`SELECT revision,compute_status FROM rendezvous.trips WHERE id=$1`, [
      tripId,
    ]);
    expect(trip.rows[0]).toMatchObject({ revision: 4, compute_status: "idle" });
    const events = await database.query<{ type: string }>(
      `SELECT type FROM rendezvous.event_outbox WHERE trip_id=$1 AND type='participant_left'`,
      [tripId],
    );
    expect(events.rows).toHaveLength(1);

    const afterLeave = await app.inject({
      method: "PUT",
      url: `/api/trips/${tripId}/scoring`,
      headers: actorHeaders(organizerId, "Организатор"),
      payload: scoring,
    });
    expect(afterLeave.statusCode, afterLeave.body).toBe(200);

    const results = await database.query(
      `SELECT count(*)::int AS count FROM rendezvous.trip_results WHERE trip_id=$1 AND revision=4`,
      [tripId],
    );
    expect(results.rows[0]!.count).toBe(0);
  });

  it("rejects unknown cities and empty shortlists with 422", async () => {
    const unknownCity = randomUUID();

    const preferences = await app.inject({
      method: "PUT",
      url: `/api/trips/${tripId}/me/preferences`,
      headers: actorHeaders(organizerId, "Организатор"),
      payload: preferencePayload(unknownCity),
    });
    expect(preferences.statusCode).toBe(422);
    expect(preferences.json()).toMatchObject({
      error: { code: "UNKNOWN_CITY" },
    });

    const reaction = await app.inject({
      method: "POST",
      url: `/api/trips/${tripId}/reactions`,
      headers: actorHeaders(organizerId, "Организатор"),
      payload: { cityId: unknownCity, value: "love" },
    });
    expect(reaction.statusCode).toBe(422);

    const shortlist = await app.inject({
      method: "PUT",
      url: `/api/trips/${tripId}/shortlist`,
      headers: actorHeaders(organizerId, "Организатор"),
      payload: { cityIds: [unknownCity] },
    });
    expect(shortlist.statusCode).toBe(422);

    const empty = await app.inject({
      method: "PUT",
      url: `/api/trips/${tripId}/shortlist`,
      headers: actorHeaders(organizerId, "Организатор"),
      payload: { cityIds: [] },
    });
    expect(empty.statusCode).toBe(422);

    const status = await database.query<{ status: string }>(
      `SELECT status FROM rendezvous.trips WHERE id=$1`,
      [tripId],
    );
    expect(status.rows[0]!.status).not.toBe("SHORTLIST");
  });

  it("requeues orphaned running jobs", async () => {
    const orphaned = randomUUID();
    await database.query(
      `INSERT INTO rendezvous.recompute_jobs(id,trip_id,revision,status) VALUES($1,$2,5,'RUNNING')`,
      [orphaned, tripId],
    );

    await expect(repository.requeueOrphanedJobs()).resolves.toBe(1);

    const job = await database.query<{ status: string }>(
      `SELECT status FROM rendezvous.recompute_jobs WHERE id=$1`,
      [orphaned],
    );
    expect(job.rows[0]!.status).toBe("QUEUED");
  });

  async function createReadyTrip(): Promise<string> {
    const createdResponse = await app.inject({
      method: "POST",
      url: "/api/trips",
      headers: actorHeaders(organizerId, "Организатор"),
      payload: {
        title: "Гонки пересчётов",
        expectedParticipants: 2,
        minTogetherMinutes: 600,
        periodFrom: "2026-09-04T08:00:00.000Z",
        periodTo: "2026-09-06T22:00:00.000Z",
        allowInternational: false,
      },
    });
    const created = CreateTripResponseSchema.parse(createdResponse.json());
    const joined = await app.inject({
      method: "POST",
      url: `/api/invites/${created.inviteToken}/join`,
      headers: actorHeaders(memberId, "Участник"),
    });
    expect(joined.statusCode).toBe(200);
    const origins = CITY_CATALOG.slice(0, 2);
    for (const [index, userId] of [organizerId, memberId].entries()) {
      const response = await app.inject({
        method: "PUT",
        url: `/api/trips/${created.trip.id}/me/preferences`,
        headers: actorHeaders(userId, index === 0 ? "Организатор" : "Участник"),
        payload: preferencePayload(origins[index]!.id),
      });
      expect(response.statusCode, response.body).toBe(200);
    }
    return created.trip.id;
  }

  function buildWorker(
    adapter: TutuTransportAdapter,
    errors: unknown[],
  ): RecomputeWorker {
    const runner = new RecomputeRunner(
      repository,
      createCandidateGenerator(CITY_CATALOG),
      adapter,
      CITY_CATALOG,
      { info() {}, error() {} },
      10_000,
    );
    return new RecomputeWorker(
      repository,
      createMastraRecomputeWorkflow(runner),
      (error) => {
        errors.push(error);
      },
    );
  }
});

class FakeAdapter implements TutuTransportAdapter {
  async searchOutbound(
    input: SearchLegInput,
  ): Promise<AdapterResult<RouteOption>> {
    const departureAt = shiftHours(input.earliestDepartureAt, 1);
    return fresh([route(input, departureAt, shiftHours(departureAt, 2))]);
  }

  async searchReturn(
    input: SearchLegInput,
  ): Promise<AdapterResult<RouteOption>> {
    const arrivalAt = shiftHours(input.latestArrivalAt, -1);
    return fresh([route(input, shiftHours(arrivalAt, -2), arrivalAt)]);
  }

  async searchHotels(
    input: HotelSearchInput,
  ): Promise<AdapterResult<HotelOption>> {
    return fresh([
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
    ]);
  }
}

function actorHeaders(userId: string, name: string) {
  return { "x-user-id": userId, "x-user-name": name };
}

function preferencePayload(originCityId: string) {
  return {
    originCityId,
    availableFrom: "2026-09-04T10:00:00.000Z",
    mustReturnBy: "2026-09-06T20:00:00.000Z",
    maxBudget: { amount: 20_000, currency: "RUB" },
    forbiddenModes: [],
    softPreferences: { preferDirect: true },
    ready: true,
  };
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

function fresh<T>(data: readonly T[]): AdapterResult<T> {
  return {
    status: "fresh",
    availability: data.length > 0 ? "available" : "none",
    data,
    fetchedAt,
    failures: [],
  };
}

function shiftHours(value: string, hours: number): string {
  return new Date(Date.parse(value) + hours * 3_600_000).toISOString();
}
