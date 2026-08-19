import { randomUUID } from "node:crypto";
import {
  CreateTripResponseSchema,
  type HotelOption,
  type RouteOption,
  TripGroupDtoSchema,
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
const strangerId = randomUUID();
const fetchedAt = "2026-09-01T12:00:00.000Z";

describeDatabase("stage 5 data/API/workflow", () => {
  let database: Database;
  let repository: TripRepository;
  let app: ReturnType<typeof buildApp>;
  let tripId = "";
  const adapter = new FakeAdapter();

  beforeAll(async () => {
    database = createDatabase(databaseUrl!);
    repository = new TripRepository(database);
    await repository.syncCityCatalog(CITY_CATALOG, CITY_CATALOG_VERSION);
    const service = new TripService(repository, CITY_BY_ID);
    app = buildApp({
      readinessCheck: () => database.checkReadiness(),
      tripService: service,
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
      [[organizerId, memberId, strangerId]],
    );
    await app.close();
    await database.close();
  });

  it("persists commands, resumes a durable job and publishes a private-safe ranking", async () => {
    const createdResponse = await app.inject({
      method: "POST",
      url: "/api/trips",
      headers: actorHeaders(organizerId, "Организатор"),
      payload: {
        title: "Интеграционная поездка",
        expectedParticipants: 2,
        minTogetherMinutes: 600,
        periodFrom: "2026-09-04T08:00:00.000Z",
        periodTo: "2026-09-06T22:00:00.000Z",
        allowInternational: false,
      },
    });
    expect(createdResponse.statusCode).toBe(201);
    const created = CreateTripResponseSchema.parse(createdResponse.json());
    tripId = created.trip.id;

    const joined = await app.inject({
      method: "POST",
      url: `/api/trips/${tripId}/join`,
      headers: actorHeaders(memberId, "Участник"),
      payload: { inviteToken: created.inviteToken },
    });
    expect(joined.statusCode).toBe(200);

    const origins = CITY_CATALOG.slice(0, 2);
    for (const [index, userId] of [organizerId, memberId].entries()) {
      const response = await app.inject({
        method: "PUT",
        url: `/api/trips/${tripId}/me/preferences`,
        headers: actorHeaders(userId, index === 0 ? "Организатор" : "Участник"),
        payload: preferences(origins[index]!.id),
      });
      expect(response.statusCode).toBe(200);
    }

    const queued = await database.query<{ revision: number; status: string }>(
      `SELECT revision,status FROM rendezvous.recompute_jobs WHERE trip_id=$1 ORDER BY revision`,
      [tripId],
    );
    expect(queued.rows).toEqual([{ revision: 2, status: "QUEUED" }]);

    const workerErrors: unknown[] = [];
    const firstWorker = worker(repository, adapter, workerErrors);
    await expect(firstWorker.drain()).resolves.toBe(1);
    await firstWorker.close();
    expect(workerErrors).toEqual([]);

    const viewResponse = await app.inject({
      method: "GET",
      url: `/api/trips/${tripId}`,
      headers: actorHeaders(memberId, "Участник"),
    });
    expect(viewResponse.statusCode, viewResponse.body).toBe(200);
    const view = TripGroupDtoSchema.parse(viewResponse.json());
    expect(view.destinations.length).toBeGreaterThan(0);
    expect(view.destinations[0]?.resultId).toBeDefined();
    expect(view.trip.computeStatus).toBe("idle");
    expect(Object.keys(view.participants[0]!).sort()).toEqual([
      "displayName",
      "id",
      "ready",
      "suitability",
    ]);

    const stranger = await app.inject({
      method: "GET",
      url: `/api/trips/${tripId}`,
      headers: actorHeaders(strangerId, "Чужой"),
    });
    expect(stranger.statusCode).toBe(404);
    const forbidden = await app.inject({
      method: "PUT",
      url: `/api/trips/${tripId}/settings`,
      headers: actorHeaders(memberId, "Участник"),
      payload: { title: "Нельзя изменить" },
    });
    expect(forbidden.statusCode).toBe(403);

    const callsBeforeRescore = adapter.calls;
    const rescored = await app.inject({
      method: "PUT",
      url: `/api/trips/${tripId}/scoring`,
      headers: actorHeaders(organizerId, "Организатор"),
      payload: {
        together: 20,
        cost: 40,
        travel: 20,
        synchronization: 10,
        fairness: 10,
      },
    });
    expect(rescored.statusCode).toBe(200);
    expect(
      TripOrganizerDtoSchema.parse(rescored.json()).trip.rankingVersion,
    ).toBe(1);
    expect(adapter.calls).toBe(callsBeforeRescore);
  });

  it("discards superseded revisions and a fresh worker resumes the pending job", async () => {
    const origin = CITY_CATALOG[2]!;
    for (let index = 0; index < 2; index += 1) {
      const response = await app.inject({
        method: "PUT",
        url: `/api/trips/${tripId}/me/preferences`,
        headers: actorHeaders(organizerId, "Организатор"),
        payload: preferences(origin.id, index * 15),
      });
      expect(response.statusCode, response.body).toBe(200);
    }

    const callsBeforeRestart = adapter.calls;
    const workerErrors: unknown[] = [];
    const restartedWorker = worker(repository, adapter, workerErrors);
    await expect(restartedWorker.drain()).resolves.toBe(1);
    await restartedWorker.close();
    expect(workerErrors).toEqual([]);
    expect(adapter.calls).toBeGreaterThan(callsBeforeRestart);

    const jobs = await database.query<{ revision: number; status: string }>(
      `SELECT revision,status FROM rendezvous.recompute_jobs WHERE trip_id=$1 ORDER BY revision`,
      [tripId],
    );
    expect(jobs.rows).toEqual([
      { revision: 2, status: "SUCCEEDED" },
      { revision: 3, status: "STALE" },
      { revision: 4, status: "SUCCEEDED" },
    ]);
    const latest = await database.query<{ revision: number }>(
      `SELECT revision FROM rendezvous.trip_results WHERE trip_id=$1 ORDER BY revision DESC LIMIT 1`,
      [tripId],
    );
    expect(latest.rows[0]?.revision).toBe(4);
  });

  it("supports reaction removal, shortlist and final selection", async () => {
    const viewResponse = await app.inject({
      method: "GET",
      url: `/api/trips/${tripId}`,
      headers: actorHeaders(organizerId, "Организатор"),
    });
    const destination = TripOrganizerDtoSchema.parse(viewResponse.json())
      .destinations[0]!;

    const reaction = await app.inject({
      method: "POST",
      url: `/api/trips/${tripId}/reactions`,
      headers: actorHeaders(memberId, "Участник"),
      payload: { cityId: destination.city.id, value: "love" },
    });
    expect(reaction.statusCode).toBe(204);
    const deletedReaction = await app.inject({
      method: "DELETE",
      url: `/api/trips/${tripId}/reactions/${destination.city.id}`,
      headers: actorHeaders(memberId, "Участник"),
    });
    expect(deletedReaction.statusCode).toBe(204);

    const shortlist = await app.inject({
      method: "PUT",
      url: `/api/trips/${tripId}/shortlist`,
      headers: actorHeaders(organizerId, "Организатор"),
      payload: { cityIds: [destination.city.id] },
    });
    expect(shortlist.statusCode).toBe(204);
    const finalized = await app.inject({
      method: "POST",
      url: `/api/trips/${tripId}/finalize`,
      headers: actorHeaders(organizerId, "Организатор"),
      payload: { destinationResultId: destination.resultId },
    });
    expect(finalized.statusCode, finalized.body).toBe(200);
    const finalizedView = await app.inject({
      method: "GET",
      url: `/api/trips/${tripId}`,
      headers: actorHeaders(organizerId, "Организатор"),
    });
    expect(TripOrganizerDtoSchema.parse(finalizedView.json()).trip.status).toBe(
      "FINALIZED",
    );
  });
});

class FakeAdapter implements TutuTransportAdapter {
  calls = 0;

  async searchOutbound(
    input: SearchLegInput,
  ): Promise<AdapterResult<RouteOption>> {
    this.calls += 1;
    const departureAt = shiftHours(input.earliestDepartureAt, 1);
    return result([route(input, departureAt, shiftHours(departureAt, 2))]);
  }

  async searchReturn(
    input: SearchLegInput,
  ): Promise<AdapterResult<RouteOption>> {
    this.calls += 1;
    const arrivalAt = shiftHours(input.latestArrivalAt, -1);
    return result([route(input, shiftHours(arrivalAt, -2), arrivalAt)]);
  }

  async searchHotels(
    input: HotelSearchInput,
  ): Promise<AdapterResult<HotelOption>> {
    this.calls += 1;
    return result([
      {
        id: `hotel-${input.city.id}`,
        cityId: input.city.id,
        name: "Интеграционный отель",
        totalPrice: { amount: 2_000, currency: "RUB" },
        checkIn: input.checkIn,
        checkOut: input.checkOut,
        fetchedAt,
        source: "tutu",
      },
    ]);
  }
}

function worker(
  repository: TripRepository,
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

function actorHeaders(userId: string, name: string) {
  return { "x-user-id": userId, "x-user-name": name };
}

function preferences(originCityId: string, minuteOffset = 0) {
  return {
    originCityId,
    availableFrom: shiftMinutes("2026-09-04T10:00:00.000Z", minuteOffset),
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

function result<T>(data: readonly T[]): AdapterResult<T> {
  return { status: "fresh", data, fetchedAt, failures: [] };
}

function shiftHours(value: string, hours: number): string {
  return shiftMinutes(value, hours * 60);
}

function shiftMinutes(value: string, minutes: number): string {
  return new Date(Date.parse(value) + minutes * 60_000).toISOString();
}
