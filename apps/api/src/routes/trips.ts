import {
  CreateTripInputSchema,
  CreateTripResponseSchema,
  EntityIdSchema,
  FinalizeTripInputSchema,
  JoinTripInputSchema,
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
import { actorFromHeaders } from "../application/actor.js";
import type { TripService } from "../application/trip-service.js";

const ParamsSchema = z.strictObject({ tripId: EntityIdSchema });
const ReactionParamsSchema = ParamsSchema.extend({ cityId: EntityIdSchema });
const TripViewSchema = z.union([TripOrganizerDtoSchema, TripGroupDtoSchema]);
const EventQuerySchema = z.strictObject({
  after: z.coerce.number().int().nonnegative().default(0),
});

export const tripRoutes: FastifyPluginAsync<{ service: TripService }> = async (
  app,
  options,
) => {
  app.post("/api/trips", async (request, reply) => {
    const actor = actorFromHeaders(request.headers);
    const result = await options.service.createTrip(
      actor,
      CreateTripInputSchema.parse(request.body),
    );
    return reply.status(201).send(CreateTripResponseSchema.parse(result));
  });

  app.get("/api/trips", async (request) => {
    return TripListSchema.parse(
      await options.service.listTrips(actorFromHeaders(request.headers)),
    );
  });

  app.get("/api/trips/:tripId", async (request) => {
    const { tripId } = ParamsSchema.parse(request.params);
    return TripViewSchema.parse(
      await options.service.getTrip(actorFromHeaders(request.headers), tripId),
    );
  });

  app.get("/api/trips/:tripId/events", async (request, reply) => {
    const { tripId } = ParamsSchema.parse(request.params);
    const actor = actorFromHeaders(request.headers);
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
      void publish().catch((error: unknown) => {
        request.log.error({ err: error }, "SSE publisher failed");
        clearInterval(timer);
        reply.raw.end();
      });
    }, 1_000);
    timer.unref();
  });

  app.post("/api/trips/:tripId/join", async (request) => {
    const { tripId } = ParamsSchema.parse(request.params);
    const { inviteToken } = JoinTripInputSchema.parse(request.body);
    return TripViewSchema.parse(
      await options.service.joinTrip(
        actorFromHeaders(request.headers),
        tripId,
        inviteToken,
      ),
    );
  });

  app.post("/api/trips/:tripId/invite-token", async (request) => {
    const { tripId } = ParamsSchema.parse(request.params);
    return InviteTokenResponseSchema.parse({
      inviteToken: await options.service.rotateInviteToken(
        actorFromHeaders(request.headers),
        tripId,
      ),
    });
  });

  app.get("/api/trips/:tripId/me/preferences", async (request) => {
    const { tripId } = ParamsSchema.parse(request.params);
    const view = await options.service.getTrip(
      actorFromHeaders(request.headers),
      tripId,
    );
    return ParticipantSelfDtoSchema.parse(view.me);
  });

  app.put("/api/trips/:tripId/me/preferences", async (request) => {
    const { tripId } = ParamsSchema.parse(request.params);
    return TripViewSchema.parse(
      await options.service.updatePreferences(
        actorFromHeaders(request.headers),
        tripId,
        UpdatePreferencesInputSchema.parse(request.body),
      ),
    );
  });

  app.put("/api/trips/:tripId/settings", async (request) => {
    const { tripId } = ParamsSchema.parse(request.params);
    return TripViewSchema.parse(
      await options.service.updateSettings(
        actorFromHeaders(request.headers),
        tripId,
        UpdateTripSettingsInputSchema.parse(request.body),
      ),
    );
  });

  app.put("/api/trips/:tripId/scoring", async (request) => {
    const { tripId } = ParamsSchema.parse(request.params);
    return TripViewSchema.parse(
      await options.service.updateScoring(
        actorFromHeaders(request.headers),
        tripId,
        UpdateScoringInputSchema.parse(request.body),
      ),
    );
  });

  app.post("/api/trips/:tripId/reactions", async (request, reply) => {
    const { tripId } = ParamsSchema.parse(request.params);
    await options.service.setReaction(
      actorFromHeaders(request.headers),
      tripId,
      SetReactionInputSchema.parse(request.body),
    );
    return reply.status(204).send();
  });

  app.delete("/api/trips/:tripId/reactions/:cityId", async (request, reply) => {
    const { tripId, cityId } = ReactionParamsSchema.parse(request.params);
    await options.service.deleteReaction(
      actorFromHeaders(request.headers),
      tripId,
      cityId,
    );
    return reply.status(204).send();
  });

  app.put("/api/trips/:tripId/shortlist", async (request, reply) => {
    const { tripId } = ParamsSchema.parse(request.params);
    const { cityIds } = SetShortlistInputSchema.parse(request.body);
    await options.service.setShortlist(
      actorFromHeaders(request.headers),
      tripId,
      cityIds,
    );
    return reply.status(204).send();
  });

  for (const action of ["reopen", "cancel"] as const) {
    app.post(`/api/trips/:tripId/${action}`, async (request, reply) => {
      const { tripId } = ParamsSchema.parse(request.params);
      await options.service.transition(
        actorFromHeaders(request.headers),
        tripId,
        action,
      );
      return reply.status(204).send();
    });
  }

  app.post("/api/trips/:tripId/leave", async (request, reply) => {
    const { tripId } = ParamsSchema.parse(request.params);
    await options.service.leave(actorFromHeaders(request.headers), tripId);
    return reply.status(204).send();
  });

  app.post("/api/trips/:tripId/finalize", async (request) => {
    const { tripId } = ParamsSchema.parse(request.params);
    const { destinationResultId } = FinalizeTripInputSchema.parse(request.body);
    return options.service.finalize(
      actorFromHeaders(request.headers),
      tripId,
      destinationResultId,
    );
  });
};
