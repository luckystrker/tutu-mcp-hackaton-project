import { z } from "zod";
import { EntityIdSchema, NonEmptyTextSchema } from "./common.js";

export const DestinationTagSchema = z.enum([
  "quiet",
  "nature",
  "food",
  "history",
  "small-city",
  "nightlife",
]);

export const CitySchema = z.strictObject({
  id: EntityIdSchema,
  name: NonEmptyTextSchema,
  country: z.string().trim().length(2),
  lat: z.number().min(-90).max(90),
  lon: z.number().min(-180).max(180),
  hubScore: z.number().min(0).max(100),
  tags: z.array(DestinationTagSchema),
});

export const PublicCitySchema = CitySchema.pick({
  id: true,
  name: true,
  country: true,
});

export type DestinationTag = z.infer<typeof DestinationTagSchema>;
export type City = z.infer<typeof CitySchema>;
export type PublicCity = z.infer<typeof PublicCitySchema>;
