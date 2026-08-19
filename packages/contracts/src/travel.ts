import { z } from "zod";
import {
  EntityIdSchema,
  IsoDateTimeSchema,
  MoneySchema,
  NonEmptyTextSchema,
} from "./common.js";
import { TransportModeSchema } from "./participant.js";

export const RouteOptionSchema = z.strictObject({
  id: z.string().trim().min(1),
  originCityId: EntityIdSchema,
  destinationCityId: EntityIdSchema,
  mode: TransportModeSchema,
  departureAt: IsoDateTimeSchema,
  arrivalAt: IsoDateTimeSchema,
  durationMinutes: z.number().int().positive(),
  price: MoneySchema,
  transfers: z.number().int().nonnegative().optional(),
  bookingUrl: z.url().optional(),
  source: z.literal("tutu"),
});

export const HotelOptionSchema = z.strictObject({
  id: z.string().trim().min(1),
  cityId: EntityIdSchema,
  name: NonEmptyTextSchema,
  totalPrice: MoneySchema.nullable(),
  rating: z.number().min(0).max(10).optional(),
  checkIn: z.iso.date(),
  checkOut: z.iso.date(),
  bookingUrl: z.url().optional(),
  fetchedAt: IsoDateTimeSchema,
  source: z.literal("tutu"),
});

export type RouteOption = z.infer<typeof RouteOptionSchema>;
export type HotelOption = z.infer<typeof HotelOptionSchema>;
