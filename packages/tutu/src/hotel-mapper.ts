import { HotelOptionSchema, type HotelOption } from "@rendezvous/contracts";
import { z } from "zod";
import { stableId } from "./stable-id.js";
import {
  allowedTutuUrl,
  type NormalizedWithMetadata,
} from "./transport-mapper.js";
import type { ProviderFailure } from "./types.js";

const RawMoneySchema = z
  .object({ amount: z.number().finite().nonnegative(), currency: z.string() })
  .passthrough();
const RawBestOfferSchema = z
  .object({
    price: RawMoneySchema.optional(),
    checkout_url: z.string().optional(),
    offerpack_hash: z.string().optional(),
  })
  .passthrough();
const RawHotelSchema = z
  .object({
    hotel_id: z.union([z.string(), z.number()]).optional(),
    hotel_geo_id: z.union([z.string(), z.number()]).optional(),
    tutu_offer_id: z.string().optional(),
    name: z.string().trim().min(1),
    rating: z.number().finite().min(0).max(10).optional().nullable(),
    best_offer: RawBestOfferSchema.optional().nullable(),
  })
  .passthrough();
const RawHotelResponseSchema = z
  .object({ hotels: z.array(z.unknown()) })
  .passthrough();

export type HotelMappingResult = {
  options: readonly NormalizedWithMetadata<HotelOption>[];
  failures: readonly ProviderFailure[];
};

export function mapHotelResponse(
  raw: unknown,
  context: {
    cityId: string;
    checkIn: string;
    checkOut: string;
    fetchedAt: string;
  },
): HotelMappingResult {
  const root = RawHotelResponseSchema.safeParse(raw);
  if (!root.success)
    return {
      options: [],
      failures: [
        invalidHotelResponse("Tutu hotel response has no hotels array"),
      ],
    };
  const options: NormalizedWithMetadata<HotelOption>[] = [];
  const failures: ProviderFailure[] = [];
  for (const [index, candidate] of root.data.hotels.entries()) {
    const parsed = RawHotelSchema.safeParse(candidate);
    if (!parsed.success) {
      failures.push(
        invalidHotelResponse(`Malformed Tutu hotel at index ${index}`),
      );
      continue;
    }
    try {
      options.push(normalizeHotel(parsed.data, context));
    } catch {
      failures.push(
        invalidHotelResponse(`Invalid Tutu hotel at index ${index}`),
      );
    }
  }
  return { options, failures };
}

function normalizeHotel(
  hotel: z.infer<typeof RawHotelSchema>,
  context: {
    cityId: string;
    checkIn: string;
    checkOut: string;
    fetchedAt: string;
  },
): NormalizedWithMetadata<HotelOption> {
  const providerId =
    hotel.hotel_id ?? hotel.hotel_geo_id ?? hotel.tutu_offer_id;
  const identity =
    providerId === undefined
      ? stableId(`${context.cityId}|${hotel.name}`)
      : String(providerId);
  const rawPrice = hotel.best_offer?.price;
  const price =
    rawPrice?.currency === "RUB"
      ? { amount: rawPrice.amount, currency: "RUB" as const }
      : null;
  const bookingUrl = allowedTutuUrl(hotel.best_offer?.checkout_url);
  const option = HotelOptionSchema.parse({
    id: `tutu:hotel:${identity}`,
    cityId: context.cityId,
    name: hotel.name,
    totalPrice: price,
    ...(hotel.rating === null || hotel.rating === undefined
      ? {}
      : { rating: hotel.rating }),
    checkIn: context.checkIn,
    checkOut: context.checkOut,
    ...(bookingUrl ? { bookingUrl } : {}),
    fetchedAt: context.fetchedAt,
    source: "tutu",
  });
  return {
    value: option,
    rawMetadata: Object.freeze({
      hotelId: hotel.hotel_id,
      hotelGeoId: hotel.hotel_geo_id,
      tutuOfferId: hotel.tutu_offer_id,
      offerpackHash: hotel.best_offer?.offerpack_hash,
    }),
  };
}

function invalidHotelResponse(message: string): ProviderFailure {
  return {
    code: "INVALID_RESPONSE",
    tool: "search_hotels",
    retryable: false,
    message,
  };
}
