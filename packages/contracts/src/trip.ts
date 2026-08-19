import { z } from "zod";
import {
  EntityIdSchema,
  IsoDateTimeSchema,
  NonEmptyTextSchema,
} from "./common.js";

export const TripStatusSchema = z.enum([
  "CREATED",
  "COLLECTING",
  "LIVE",
  "SHORTLIST",
  "FINALIZED",
  "CANCELLED",
]);
export const ComputeStatusSchema = z.enum([
  "idle",
  "running",
  "degraded",
  "failed",
]);

export const ScoringConfigSchema = z
  .strictObject({
    together: z.number().nonnegative(),
    cost: z.number().nonnegative(),
    travel: z.number().nonnegative(),
    synchronization: z.number().nonnegative(),
    fairness: z.number().nonnegative(),
  })
  .refine((weights) => Object.values(weights).some((weight) => weight > 0), {
    message: "At least one scoring weight must be positive",
  });

export const TripSchema = z.strictObject({
  id: EntityIdSchema,
  title: NonEmptyTextSchema,
  organizerUserId: EntityIdSchema,
  expectedParticipants: z.union([z.literal(2), z.literal(3), z.literal(4)]),
  status: TripStatusSchema,
  computeStatus: ComputeStatusSchema,
  revision: z.number().int().nonnegative(),
  rankingVersion: z.number().int().nonnegative(),
  minTogetherMinutes: z.number().int().positive(),
  periodFrom: IsoDateTimeSchema,
  periodTo: IsoDateTimeSchema,
  allowInternational: z.boolean(),
  scoringConfig: ScoringConfigSchema,
  createdAt: IsoDateTimeSchema,
  updatedAt: IsoDateTimeSchema,
});

export const TripPublicSchema = TripSchema.omit({ organizerUserId: true });

export type TripStatus = z.infer<typeof TripStatusSchema>;
export type ComputeStatus = z.infer<typeof ComputeStatusSchema>;
export type ScoringConfig = z.infer<typeof ScoringConfigSchema>;
export type Trip = z.infer<typeof TripSchema>;
export type TripPublic = z.infer<typeof TripPublicSchema>;
