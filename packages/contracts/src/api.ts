import { z } from "zod";
import {
  EntityIdSchema,
  IsoDateTimeSchema,
  MoneySchema,
  NonEmptyTextSchema,
} from "./common.js";
import { SoftPreferencesSchema, TransportModeSchema } from "./participant.js";
import { ScoringConfigSchema, TripPublicSchema } from "./trip.js";

export const CreateTripInputSchema = z
  .strictObject({
    title: NonEmptyTextSchema,
    expectedParticipants: z.union([z.literal(2), z.literal(3), z.literal(4)]),
    minTogetherMinutes: z.number().int().positive(),
    periodFrom: IsoDateTimeSchema,
    periodTo: IsoDateTimeSchema,
    allowInternational: z.boolean().default(false),
  })
  .refine(
    (value) => Date.parse(value.periodFrom) < Date.parse(value.periodTo),
    {
      path: ["periodTo"],
      message: "Trip period end must be later than its start",
    },
  );

export const CreateTripResponseSchema = z.strictObject({
  trip: TripPublicSchema,
  inviteToken: z.string().regex(/^[A-Za-z0-9_-]{22}$/),
});

export const JoinTripInputSchema = z.strictObject({
  inviteToken: z.string().regex(/^[A-Za-z0-9_-]{22}$/),
});
export const InviteTokenResponseSchema = z.strictObject({
  inviteToken: z.string().regex(/^[A-Za-z0-9_-]{22}$/),
});

export const UpdatePreferencesInputSchema = z
  .strictObject({
    originCityId: EntityIdSchema,
    availableFrom: IsoDateTimeSchema,
    mustReturnBy: IsoDateTimeSchema,
    maxBudget: MoneySchema.refine(
      ({ amount }) => amount > 0,
      "Budget must be positive",
    ),
    forbiddenModes: z
      .array(TransportModeSchema)
      .refine((modes) => new Set(modes).size === modes.length),
    softPreferences: SoftPreferencesSchema,
    ready: z.literal(true),
  })
  .refine(
    (value) => Date.parse(value.availableFrom) < Date.parse(value.mustReturnBy),
    {
      path: ["mustReturnBy"],
      message: "Return deadline must be later than departure availability",
    },
  );

export const UpdateTripSettingsInputSchema = z
  .strictObject({
    title: NonEmptyTextSchema.optional(),
    minTogetherMinutes: z.number().int().positive().optional(),
    periodFrom: IsoDateTimeSchema.optional(),
    periodTo: IsoDateTimeSchema.optional(),
    allowInternational: z.boolean().optional(),
  })
  .refine(
    (value) => Object.keys(value).length > 0,
    "At least one setting is required",
  );

export const UpdateScoringInputSchema = ScoringConfigSchema;
export const ReactionValueSchema = z.enum(["love", "ok", "no"]);
export const SetReactionInputSchema = z.strictObject({
  cityId: EntityIdSchema,
  value: ReactionValueSchema,
});
export const SetShortlistInputSchema = z.strictObject({
  cityIds: z
    .array(EntityIdSchema)
    .min(1)
    .max(3)
    .refine((ids) => new Set(ids).size === ids.length),
});
export const FinalizeTripInputSchema = z.strictObject({
  destinationResultId: EntityIdSchema,
});
export const TripListSchema = z.array(TripPublicSchema);

export type CreateTripInput = z.infer<typeof CreateTripInputSchema>;
export type CreateTripResponse = z.infer<typeof CreateTripResponseSchema>;
export type JoinTripInput = z.infer<typeof JoinTripInputSchema>;
export type UpdatePreferencesInput = z.infer<
  typeof UpdatePreferencesInputSchema
>;
export type UpdateTripSettingsInput = z.infer<
  typeof UpdateTripSettingsInputSchema
>;
export type UpdateScoringInput = z.infer<typeof UpdateScoringInputSchema>;
export type SetReactionInput = z.infer<typeof SetReactionInputSchema>;
export type SetShortlistInput = z.infer<typeof SetShortlistInputSchema>;
export type FinalizeTripInput = z.infer<typeof FinalizeTripInputSchema>;
