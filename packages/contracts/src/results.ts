import { z } from "zod";
import { PublicCitySchema } from "./city.js";
import { EntityIdSchema, IsoDateTimeSchema, MoneySchema } from "./common.js";
import { TransportModeSchema } from "./participant.js";
import { HotelOptionSchema } from "./travel.js";

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
});

export const DestinationResultDtoSchema = z.strictObject({
  city: PublicCitySchema,
  rank: z.number().int().positive(),
  score: z.number().min(0).max(100),
  components: ScoreBreakdownSchema,
  commonTimeMinutes: z.number().int().nonnegative(),
  routes: z.array(ParticipantRouteSummarySchema),
  hotels: z.array(HotelOptionSchema),
  valid: z.boolean(),
  checkedAt: IsoDateTimeSchema,
  degraded: z.boolean(),
});

export type ScoreBreakdown = z.infer<typeof ScoreBreakdownSchema>;
export type ParticipantRouteSummary = z.infer<
  typeof ParticipantRouteSummarySchema
>;
export type DestinationResultDto = z.infer<typeof DestinationResultDtoSchema>;
