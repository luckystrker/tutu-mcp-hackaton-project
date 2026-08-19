import { z } from "zod";
import {
  ParticipantGroupDtoSchema,
  ParticipantPrivateSchema,
  ParticipantSelfDtoSchema,
} from "./participant.js";
import { DestinationResultDtoSchema } from "./results.js";
import { TripPublicSchema, TripSchema } from "./trip.js";

export const TripCapabilitiesSchema = z.strictObject({
  canEditSettings: z.boolean(),
  canShortlist: z.boolean(),
  canFinalize: z.boolean(),
  canCancel: z.boolean(),
});

export const TripPrivateDtoSchema = z.strictObject({
  trip: TripSchema,
  participants: z.array(ParticipantPrivateSchema),
  destinations: z.array(DestinationResultDtoSchema),
});

export const TripGroupDtoSchema = z.strictObject({
  trip: TripPublicSchema,
  participants: z.array(ParticipantGroupDtoSchema),
  me: ParticipantSelfDtoSchema,
  destinations: z.array(DestinationResultDtoSchema),
});

export const TripOrganizerDtoSchema = TripGroupDtoSchema.extend({
  capabilities: TripCapabilitiesSchema,
});

export type TripCapabilities = z.infer<typeof TripCapabilitiesSchema>;
export type TripPrivateDto = z.infer<typeof TripPrivateDtoSchema>;
export type TripGroupDto = z.infer<typeof TripGroupDtoSchema>;
export type TripOrganizerDto = z.infer<typeof TripOrganizerDtoSchema>;
