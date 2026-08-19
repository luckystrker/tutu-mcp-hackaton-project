import {
  CreateTripInputSchema,
  CreateTripResponseSchema,
  EntityIdSchema,
  FinalizeTripInputSchema,
  FinalTripDtoSchema,
  InviteTokenResponseSchema,
  ParticipantSelfDtoSchema,
  SetReactionInputSchema,
  SetShortlistInputSchema,
  TripGroupDtoSchema,
  TripListSchema,
  TripOrganizerDtoSchema,
  UpdatePreferencesInputSchema,
  UpdateScoringInputSchema,
  UpdateTripSettingsInputSchema,
} from "@rendezvous/contracts";
import type { FastifyPluginAsync } from "fastify";
import { z } from "zod";
import type { ActorAuthenticator } from "../auth/session-service.js";
import type { TripService } from "../application/trip-service.js";
import { createRateLimiter } from "../rate-limit.js";

const ParamsSchema = z.strictObject({ tripId: EntityIdSchema });
const ReactionParamsSchema = ParamsSchema.extend({ cityId: EntityIdSchema });
const TripViewSchema = z.union([TripOrganizerDtoSchema, TripGroupDtoSchema]);
const EventQuerySchema = z.strictObject({
  after: z.coerce.number().int().nonnegative().default(0),
});

export const tripRoutes: FastifyPluginAsync<{
  service: TripService;
  authenticator: ActorAuthenticator;
  inviteUrl: (token: string) => string;
}> = async (app, options) => {
  const limiter = createRateLimiter({
    windowMs: 60_000,
    message: "Too many mutations",
  });
  app.addHook("onRequest", async (request) => {
    if (request.method === "GET" || request.method === "OPTIONS") return;
    limiter.check(
      request.ip,
      request.url.startsWith("/api/invites/") ? 30 : 120,
    );
  });
  app.post("/api/trips", async (request, reply) => {
    const actor = await options.authenticator.authenticate(request.headers);
    const result = await options.service.createTrip(
      actor,
      CreateTripInputSchema.parse(request.body),
    );
    return reply.status(201).send(CreateTripResponseSchema.parse(result));
  });

  app.get("/api/trips", async (request) => {
    return TripListSchema.parse(
      await options.service.listTrips(
        await options.authenticator.authenticate(request.headers),
      ),
    );
  });

  app.get("/api/trips/:tripId", async (request) => {
    const { tripId } = ParamsSchema.parse(request.params);
    return TripViewSchema.parse(
      await options.service.getTrip(
        await options.authenticator.authenticate(request.headers),
        tripId,
      ),
    );
  });

  app.get("/api/trips/:tripId/final", async (request) => {
    const { tripId } = ParamsSchema.parse(request.params);
    return FinalTripDtoSchema.parse(
      await options.service.getFinal(
        await options.authenticator.authenticate(request.headers),
        tripId,
      ),
    );
  });

  app.get("/api/trips/:tripId/events", async (request, reply) => {
    const { tripId } = ParamsSchema.parse(request.params);
    const actor = await options.authenticator.authenticate(request.headers);
    const headerCursor = Number(request.headers["last-event-id"] ?? 0);
    let cursor =
      EventQuerySchema.parse(request.query).after ||
      (Number.isSafeInteger(headerCursor) && headerCursor >= 0
        ? headerCursor
        : 0);
    const initialEvents = await options.service.listEventsAfter(
      actor,
      tripId,
      cursor,
    );
    reply.hijack();
    reply.raw.writeHead(200, {
      "content-type": "text/event-stream; charset=utf-8",
      "cache-control": "no-cache, no-transform",
      connection: "keep-alive",
      "x-accel-buffering": "no",
    });
    let closed = false;
    let lastHeartbeatAt = Date.now();
    request.raw.once("close", () => {
      closed = true;
    });
    const writeEvents = (
      events: Awaited<ReturnType<typeof options.service.listEventsAfter>>,
    ) => {
      for (const event of events) {
        cursor = Number(event.id);
        reply.raw.write(
          `id: ${event.id}\nevent: ${event.type}\ndata: ${JSON.stringify(event)}\n\n`,
        );
      }
    };
    const publish = async () => {
      const events = await options.service.listEventsAfter(
        actor,
        tripId,
        cursor,
      );
      writeEvents(events);
    };
    writeEvents(initialEvents);
    const timer = setInterval(() => {
      if (closed) return clearInterval(timer);
      if (Date.now() - lastHeartbeatAt >= 15_000) {
        reply.raw.write(`: heartbeat ${Date.now()}\n\n`);
        lastHeartbeatAt = Date.now();
      }
      void publish().catch((error: unknown) => {
        request.log.error({ err: error }, "SSE publisher failed");
        clearInterval(timer);
        reply.raw.end();
      });
    }, 1_000);
    timer.unref();
  });

  app.post("/api/trips/:tripId/invite-token", async (request) => {
    const { tripId } = ParamsSchema.parse(request.params);
    const inviteToken = await options.service.rotateInviteToken(
      await options.authenticator.authenticate(request.headers),
      tripId,
    );
    return InviteTokenResponseSchema.parse({
      inviteToken,
      startAppUrl: options.inviteUrl(inviteToken),
    });
  });

  app.post("/api/invites/:inviteToken/join", async (request) => {
    const { inviteToken } = z
      .strictObject({ inviteToken: z.string().regex(/^[A-Za-z0-9_-]{22}$/) })
      .parse(request.params);
    return TripViewSchema.parse(
      await options.service.joinByInvite(
        await options.authenticator.authenticate(request.headers),
        inviteToken,
      ),
    );
  });

  app.get("/api/trips/:tripId/me/preferences", async (request) => {
    const { tripId } = ParamsSchema.parse(request.params);
    const view = await options.service.getTrip(
      await options.authenticator.authenticate(request.headers),
      tripId,
    );
    return ParticipantSelfDtoSchema.parse(view.me);
  });

  app.put("/api/trips/:tripId/me/preferences", async (request) => {
    const { tripId } = ParamsSchema.parse(request.params);
    return TripViewSchema.parse(
      await options.service.updatePreferences(
        await options.authenticator.authenticate(request.headers),
        tripId,
        UpdatePreferencesInputSchema.parse(request.body),
      ),
    );
  });

  app.put("/api/trips/:tripId/settings", async (request) => {
    const { tripId } = ParamsSchema.parse(request.params);
    return TripViewSchema.parse(
      await options.service.updateSettings(
        await options.authenticator.authenticate(request.headers),
        tripId,
        UpdateTripSettingsInputSchema.parse(request.body),
      ),
    );
  });

  app.put("/api/trips/:tripId/scoring", async (request) => {
    const { tripId } = ParamsSchema.parse(request.params);
    return TripViewSchema.parse(
      await options.service.updateScoring(
        await options.authenticator.authenticate(request.headers),
        tripId,
        UpdateScoringInputSchema.parse(request.body),
      ),
    );
  });

  app.post("/api/trips/:tripId/reactions", async (request, reply) => {
    const { tripId } = ParamsSchema.parse(request.params);
    await options.service.setReaction(
      await options.authenticator.authenticate(request.headers),
      tripId,
      SetReactionInputSchema.parse(request.body),
    );
    return reply.status(204).send();
  });

  app.delete("/api/trips/:tripId/reactions/:cityId", async (request, reply) => {
    const { tripId, cityId } = ReactionParamsSchema.parse(request.params);
    await options.service.deleteReaction(
      await options.authenticator.authenticate(request.headers),
      tripId,
      cityId,
    );
    return reply.status(204).send();
  });

  app.put("/api/trips/:tripId/shortlist", async (request, reply) => {
    const { tripId } = ParamsSchema.parse(request.params);
    const { cityIds } = SetShortlistInputSchema.parse(request.body);
    await options.service.setShortlist(
      await options.authenticator.authenticate(request.headers),
      tripId,
      cityIds,
    );
    return reply.status(204).send();
  });

  for (const action of ["reopen", "cancel"] as const) {
    app.post(`/api/trips/:tripId/${action}`, async (request, reply) => {
      const { tripId } = ParamsSchema.parse(request.params);
      await options.service.transition(
        await options.authenticator.authenticate(request.headers),
        tripId,
        action,
      );
      return reply.status(204).send();
    });
  }

  app.post("/api/trips/:tripId/leave", async (request, reply) => {
    const { tripId } = ParamsSchema.parse(request.params);
    await options.service.leave(
      await options.authenticator.authenticate(request.headers),
      tripId,
    );
    return reply.status(204).send();
  });

  app.post("/api/trips/:tripId/finalize", async (request) => {
    const { tripId } = ParamsSchema.parse(request.params);
    const { destinationResultId } = FinalizeTripInputSchema.parse(request.body);
    return FinalTripDtoSchema.parse(
      await options.service.finalize(
        await options.authenticator.authenticate(request.headers),
        tripId,
        destinationResultId,
      ),
    );
  });
};
