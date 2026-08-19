import { z } from "zod";
import { PublicCitySchema } from "./city.js";
import { EntityIdSchema, IsoDateTimeSchema, MoneySchema } from "./common.js";
import { TransportModeSchema } from "./participant.js";
import { HotelOptionSchema } from "./travel.js";
import { TripPublicSchema } from "./trip.js";

export const ScoreBreakdownSchema = z.strictObject({
  together: z.number().min(0).max(100),
  cost: z.number().min(0).max(100),
  travel: z.number().min(0).max(100),
  synchronization: z.number().min(0).max(100),
  fairness: z.number().min(0).max(100),
});

export const ParticipantRouteSummarySchema = z.strictObject({
  participantId: EntityIdSchema,
  mode: TransportModeSchema,
  outboundDepartureAt: IsoDateTimeSchema,
  outboundArrivalAt: IsoDateTimeSchema,
  returnDepartureAt: IsoDateTimeSchema,
  returnArrivalAt: IsoDateTimeSchema,
  estimatedCost: MoneySchema,
  outboundBookingUrl: z.url().optional(),
  returnBookingUrl: z.url().optional(),
});

export const ReactionSummarySchema = z.strictObject({
  love: z.number().int().nonnegative(),
  ok: z.number().int().nonnegative(),
  dislike: z.number().int().nonnegative(),
  mine: z.enum(["love", "ok", "dislike"]).nullable(),
});

export const DestinationResultDtoSchema = z.strictObject({
  resultId: EntityIdSchema.optional(),
  city: PublicCitySchema,
  rank: z.number().int().positive(),
  score: z.number().min(0).max(100),
  components: ScoreBreakdownSchema,
  commonTimeMinutes: z.number().int().nonnegative(),
  routes: z.array(ParticipantRouteSummarySchema),
  hotels: z.array(HotelOptionSchema),
  hotelRequired: z.boolean().optional(),
  valid: z.boolean(),
  checkedAt: IsoDateTimeSchema,
  degraded: z.boolean(),
  reactions: ReactionSummarySchema.optional(),
});

export const FinalTripDtoSchema = z.strictObject({
  trip: TripPublicSchema,
  city: PublicCitySchema,
  score: z.number().min(0).max(100),
  components: ScoreBreakdownSchema,
  commonTimeMinutes: z.number().int().nonnegative(),
  myRoute: ParticipantRouteSummarySchema.nullable(),
  hotel: HotelOptionSchema.nullable(),
  hotelAssumption: z
    .strictObject({
      guests: z.number().int().positive(),
      rooms: z.number().int().positive(),
      allocation: z.literal("equal-minor-units"),
    })
    .nullable(),
  checkedAt: IsoDateTimeSchema,
  degraded: z.boolean(),
  finalizedAt: IsoDateTimeSchema,
});

export type ScoreBreakdown = z.infer<typeof ScoreBreakdownSchema>;
export type ParticipantRouteSummary = z.infer<
  typeof ParticipantRouteSummarySchema
>;
export type DestinationResultDto = z.infer<typeof DestinationResultDtoSchema>;
export type ReactionSummary = z.infer<typeof ReactionSummarySchema>;
export type FinalTripDto = z.infer<typeof FinalTripDtoSchema>;
