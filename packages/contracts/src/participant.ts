import { z } from "zod";
import { DestinationTagSchema } from "./city.js";
import {
  EntityIdSchema,
  IsoDateTimeSchema,
  MoneySchema,
  NonEmptyTextSchema,
} from "./common.js";

export const TransportModeSchema = z.enum(["train", "air", "bus", "suburban"]);

export const SoftPreferencesSchema = z.strictObject({
  avoidNightTravel: z.boolean().optional(),
  preferDirect: z.boolean().optional(),
  preferMorningArrival: z.boolean().optional(),
  maxTravelHoursPreferred: z.number().positive().max(168).optional(),
  destinationTags: z
    .array(DestinationTagSchema)
    .max(6)
    .refine((tags) => new Set(tags).size === tags.length, {
      message: "Destination tags must be unique",
    })
    .optional(),
});

export const ParticipantPrivateSchema = z.strictObject({
  id: EntityIdSchema,
  tripId: EntityIdSchema,
  userId: EntityIdSchema,
  displayName: NonEmptyTextSchema,
  originCityId: EntityIdSchema.nullable(),
  availableFrom: IsoDateTimeSchema.nullable(),
  mustReturnBy: IsoDateTimeSchema.nullable(),
  maxBudget: MoneySchema.nullable(),
  forbiddenModes: z.array(TransportModeSchema),
  softPreferences: SoftPreferencesSchema,
  ready: z.boolean(),
  createdAt: IsoDateTimeSchema,
  updatedAt: IsoDateTimeSchema,
});

export const ParticipantSelfDtoSchema = ParticipantPrivateSchema.omit({
  userId: true,
});

export const ParticipantGroupDtoSchema = z.strictObject({
  id: EntityIdSchema,
  displayName: NonEmptyTextSchema,
  ready: z.boolean(),
  suitability: z.enum(["unknown", "suitable", "conflict"]),
});

export type TransportMode = z.infer<typeof TransportModeSchema>;
export type SoftPreferences = z.infer<typeof SoftPreferencesSchema>;
export type ParticipantPrivate = z.infer<typeof ParticipantPrivateSchema>;
export type ParticipantSelfDto = z.infer<typeof ParticipantSelfDtoSchema>;
export type ParticipantGroupDto = z.infer<typeof ParticipantGroupDtoSchema>;
