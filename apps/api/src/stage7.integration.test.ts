import { randomUUID } from "node:crypto";
import {
  AuthSessionSchema,
  CreateTripResponseSchema,
  InviteTokenResponseSchema,
  TripGroupDtoSchema,
} from "@rendezvous/contracts";
import {
  CITY_BY_ID,
  CITY_CATALOG,
  CITY_CATALOG_VERSION,
} from "@rendezvous/domain";
import { afterAll, beforeAll, describe, expect, it } from "vitest";
import { buildApp } from "./app.js";
import { TripService } from "./application/trip-service.js";
import { SessionService } from "./auth/session-service.js";
import { createDatabase, type Database } from "./db.js";
import { TripRepository } from "./repositories/trip-repository.js";

const databaseUrl = process.env.DATABASE_URL;
const describeDatabase = databaseUrl ? describe : describe.skip;

describeDatabase("stage 7 Telegram session and collaboration", () => {
  let database: Database;
  let repository: TripRepository;
  let app: ReturnType<typeof buildApp>;
  const userIds = [randomUUID(), randomUUID(), randomUUID()] as const;
  const tripIds: string[] = [];

  beforeAll(async () => {
    database = createDatabase(databaseUrl!);
    repository = new TripRepository(database);
    await repository.syncCityCatalog(CITY_CATALOG, CITY_CATALOG_VERSION);
    const sessions = new SessionService(database, "integration-bot-token");
    app = buildApp({
      readinessCheck: () => database.checkReadiness(),
      tripService: new TripService(repository, CITY_BY_ID),
      authenticator: sessions,
      sessions,
      allowDevAuth: true,
      allowedOrigin: "http://localhost:5173",
      inviteUrl: (token) =>
        `https://t.me/test_bot/rendezvous?startapp=${token}`,
    });
    await app.ready();
  });

  afterAll(async () => {
    if (tripIds.length)
      await database.query(
        `DELETE FROM rendezvous.trips WHERE id=ANY($1::uuid[])`,
        [tripIds],
      );
    await database.query(
      `DELETE FROM rendezvous.users WHERE id=ANY($1::uuid[])`,
      [userIds],
    );
    await app.close();
    await database.close();
  });

  it("requires a session, keeps invite opaque and serializes the last-slot race", async () => {
    const authenticated = await Promise.all(
      userIds.map((id, index) => authenticate(id, `User ${index + 1}`)),
    );
    const organizer = authenticated[0]!;
    const first = authenticated[1]!;
    const second = authenticated[2]!;
    const unauthorized = await app.inject({ method: "GET", url: "/api/trips" });
    expect(unauthorized.statusCode).toBe(401);

    const createdResponse = await app.inject({
      method: "POST",
      url: "/api/trips",
      headers: bearer(organizer.token),
      payload: {
        title: "Telegram collaboration",
        expectedParticipants: 2,
        minTogetherMinutes: 600,
        periodFrom: "2026-09-04T08:00:00.000Z",
        periodTo: "2026-09-06T22:00:00.000Z",
        allowInternational: false,
      },
    });
    const created = CreateTripResponseSchema.parse(createdResponse.json());
    tripIds.push(created.trip.id);

    const firstInvite = InviteTokenResponseSchema.parse(
      (
        await app.inject({
          method: "POST",
          url: `/api/trips/${created.trip.id}/invite-token`,
          headers: bearer(organizer.token),
        })
      ).json(),
    );
    expect(firstInvite.startAppUrl).toBe(
      `https://t.me/test_bot/rendezvous?startapp=${firstInvite.inviteToken}`,
    );
    expect(firstInvite.startAppUrl).not.toContain(created.trip.id);

    const rotated = InviteTokenResponseSchema.parse(
      (
        await app.inject({
          method: "POST",
          url: `/api/trips/${created.trip.id}/invite-token`,
          headers: bearer(organizer.token),
        })
      ).json(),
    );
    const revokedJoin = await join(first.token, firstInvite.inviteToken);
    expect(revokedJoin.statusCode).toBe(404);

    const raced = await Promise.all([
      join(first.token, rotated.inviteToken),
      join(second.token, rotated.inviteToken),
    ]);
    expect(raced.map(({ statusCode }) => statusCode).sort()).toEqual([
      200, 409,
    ]);
    const winnerIndex = raced.findIndex(({ statusCode }) => statusCode === 200);
    const winner = winnerIndex === 0 ? first : second;
    const loser = winnerIndex === 0 ? second : first;

    const memberView = await app.inject({
      method: "GET",
      url: `/api/trips/${created.trip.id}`,
      headers: bearer(winner.token),
    });
    const parsed = TripGroupDtoSchema.parse(memberView.json());
    expect(Object.keys(parsed.participants[0]!).sort()).toEqual([
      "displayName",
      "id",
      "ready",
      "suitability",
    ]);
    const actors = [organizer, winner];
    for (const [index, actor] of actors.entries()) {
      const ready = await app.inject({
        method: "PUT",
        url: `/api/trips/${created.trip.id}/me/preferences`,
        headers: bearer(actor.token),
        payload: {
          originCityId: CITY_CATALOG[index]!.id,
          availableFrom: "2026-09-04T10:00:00.000Z",
          mustReturnBy: "2026-09-06T20:00:00.000Z",
          maxBudget: { amount: 20_000, currency: "RUB" },
          forbiddenModes: [],
          softPreferences: {},
          ready: true,
        },
      });
      expect(ready.statusCode, ready.body).toBe(200);
    }
    const jobs = await database.query<{ status: string }>(
      `SELECT status FROM rendezvous.recompute_jobs WHERE trip_id=$1`,
      [created.trip.id],
    );
    expect(jobs.rows).toEqual([{ status: "QUEUED" }]);
    const events = await repository.listEventsAfter(
      winner.user.id,
      created.trip.id,
      0,
    );
    expect(events.map(({ type }) => type)).toEqual(
      expect.arrayContaining([
        "participant_joined",
        "participant_ready",
        "computation_started",
      ]),
    );
    const replay = await repository.listEventsAfter(
      winner.user.id,
      created.trip.id,
      Number(events[0]!.id),
    );
    expect(
      replay.every((event) => Number(event.id) > Number(events[0]!.id)),
    ).toBe(true);
    await database.query(
      `UPDATE rendezvous.event_outbox SET occurred_at=now()-interval '25 hours'
       WHERE id=ANY($1::bigint[])`,
      [events.slice(0, 2).map(({ id }) => id)],
    );
    await repository.pruneEventOutbox();
    const resync = await repository.listEventsAfter(
      winner.user.id,
      created.trip.id,
      Number(events[0]!.id),
    );
    expect(resync[0]?.type).toBe("resync_required");
    const outsider = await app.inject({
      method: "GET",
      url: `/api/trips/${created.trip.id}`,
      headers: bearer(loser.token),
    });
    expect(outsider.statusCode).toBe(404);

    const outsiderEvents = await app.inject({
      method: "GET",
      url: `/api/trips/${created.trip.id}/events`,
      headers: bearer(loser.token),
    });
    expect(outsiderEvents.statusCode).toBe(404);

    const rotatedSession = await authenticate(
      loser.user.id,
      loser.user.displayName,
    );
    expect(
      (
        await app.inject({
          method: "GET",
          url: "/api/trips",
          headers: bearer(loser.token),
        })
      ).statusCode,
    ).toBe(401);
    expect(
      (
        await app.inject({
          method: "GET",
          url: "/api/trips",
          headers: bearer(rotatedSession.token),
        })
      ).statusCode,
    ).toBe(200);

    const preflight = await app.inject({
      method: "OPTIONS",
      url: "/api/trips",
      headers: { origin: "http://localhost:5173" },
    });
    expect(preflight.headers["access-control-allow-origin"]).toBe(
      "http://localhost:5173",
    );
    const foreignOrigin = await app.inject({
      method: "OPTIONS",
      url: "/api/trips",
      headers: { origin: "https://evil.example" },
    });
    expect(
      foreignOrigin.headers["access-control-allow-origin"],
    ).toBeUndefined();
  });

  async function authenticate(userId: string, displayName: string) {
    const response = await app.inject({
      method: "POST",
      url: "/api/auth/dev",
      payload: { userId, displayName },
    });
    expect(response.statusCode, response.body).toBe(200);
    return AuthSessionSchema.parse(response.json());
  }

  function join(token: string, inviteToken: string) {
    return app.inject({
      method: "POST",
      url: `/api/invites/${inviteToken}/join`,
      headers: bearer(token),
    });
  }
});

function bearer(token: string) {
  return { authorization: `Bearer ${token}` };
}
