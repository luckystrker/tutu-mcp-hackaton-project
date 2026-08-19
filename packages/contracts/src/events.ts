import { z } from "zod";
import { EntityIdSchema, IsoDateTimeSchema } from "./common.js";
import { DestinationResultDtoSchema } from "./results.js";

const EventBaseSchema = z.strictObject({
  id: z.string().trim().min(1),
  tripId: EntityIdSchema,
  revision: z.number().int().nonnegative(),
  occurredAt: IsoDateTimeSchema,
});

export const TripEventSchema = z.discriminatedUnion("type", [
  EventBaseSchema.extend({
    type: z.literal("participant_joined"),
    payload: z.strictObject({ participantId: EntityIdSchema }),
  }),
  EventBaseSchema.extend({
    type: z.literal("participant_ready"),
    payload: z.strictObject({
      participantId: EntityIdSchema,
      readyCount: z.number().int().nonnegative(),
    }),
  }),
  EventBaseSchema.extend({
    type: z.literal("computation_started"),
    payload: z.strictObject({}),
  }),
  EventBaseSchema.extend({
    type: z.literal("computation_progress"),
    payload: z.strictObject({
      stage: z.string().min(1),
      percent: z.number().min(0).max(100),
    }),
  }),
  EventBaseSchema.extend({
    type: z.literal("ranking_updated"),
    payload: z.strictObject({
      rankingVersion: z.number().int().nonnegative(),
      destinations: z.array(DestinationResultDtoSchema),
    }),
  }),
  EventBaseSchema.extend({
    type: z.literal("computation_finished"),
    payload: z.strictObject({ degraded: z.boolean() }),
  }),
  EventBaseSchema.extend({
    type: z.literal("reaction_added"),
    payload: z.strictObject({ cityId: EntityIdSchema }),
  }),
  EventBaseSchema.extend({
    type: z.literal("trip_finalized"),
    payload: z.strictObject({ cityId: EntityIdSchema }),
  }),
]);

export type TripEvent = z.infer<typeof TripEventSchema>;
