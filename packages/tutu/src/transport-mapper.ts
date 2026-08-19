import {
  RouteOptionSchema,
  type RouteOption,
  type TransportMode,
} from "@rendezvous/contracts";
import { z } from "zod";
import { stableId } from "./stable-id.js";
import type { ProviderFailure } from "./types.js";

const RawMoneySchema = z
  .object({ amount: z.number().finite().nonnegative(), currency: z.string() })
  .passthrough();
const RawSegmentSchema = z
  .object({
    departure_at: z.string().optional(),
    arrival_at: z.string().optional(),
    duration_min: z.number().finite().nonnegative().optional(),
  })
  .passthrough();
const RawLegSchema = z
  .object({
    departure_at: z.string().optional(),
    arrival_at: z.string().optional(),
    duration_min: z.number().finite().nonnegative().optional(),
    segments: z.array(RawSegmentSchema).optional(),
  })
  .passthrough();
const RawOfferSchema = z
  .object({
    offer_id: z.union([z.string(), z.number()]).optional(),
    transport: z.string().optional(),
    price: RawMoneySchema.optional(),
    duration_min: z.number().finite().nonnegative().optional(),
    departure_at: z.string().optional(),
    arrival_at: z.string().optional(),
    segments_count: z.number().int().nonnegative().optional(),
    legs: z.array(RawLegSchema).optional(),
    checkout_url: z.string().optional(),
    search_results_url: z.string().optional(),
    carriers: z.array(z.string()).optional(),
    checkout_ref: z.record(z.string(), z.unknown()).optional(),
  })
  .passthrough();
const RawTransportResponseSchema = z
  .object({ offers: z.array(z.unknown()) })
  .passthrough();

export type NormalizedWithMetadata<T> = {
  value: T;
  rawMetadata: Readonly<Record<string, unknown>>;
};

export type TransportMappingResult = {
  options: readonly NormalizedWithMetadata<RouteOption>[];
  failures: readonly ProviderFailure[];
};

export function mapTransportResponse(
  raw: unknown,
  context: {
    tool: string;
    mode: TransportMode;
    originCityId: string;
    destinationCityId: string;
  },
): TransportMappingResult {
  const root = RawTransportResponseSchema.safeParse(raw);
  if (!root.success) {
    return {
      options: [],
      failures: [
        invalidResponse(context, "Tutu transport response has no offers array"),
      ],
    };
  }
  const options: NormalizedWithMetadata<RouteOption>[] = [];
  const failures: ProviderFailure[] = [];
  for (const [index, candidate] of root.data.offers.entries()) {
    const parsed = RawOfferSchema.safeParse(candidate);
    if (!parsed.success) {
      failures.push(
        invalidResponse(context, `Malformed Tutu offer at index ${index}`),
      );
      continue;
    }
    try {
      options.push(normalizeOffer(parsed.data, context));
    } catch {
      failures.push(
        invalidResponse(context, `Incomplete Tutu offer at index ${index}`),
      );
    }
  }
  return { options, failures };
}

function normalizeOffer(
  offer: z.infer<typeof RawOfferSchema>,
  context: {
    tool: string;
    mode: TransportMode;
    originCityId: string;
    destinationCityId: string;
  },
): NormalizedWithMetadata<RouteOption> {
  if (!offer.price || offer.price.currency !== "RUB")
    throw new Error("Missing supported price");
  const firstLeg = offer.legs?.[0];
  const departureAt = toIsoInstant(
    offer.departure_at ?? firstLeg?.departure_at,
  );
  const arrivalAt = toIsoInstant(offer.arrival_at ?? firstLeg?.arrival_at);
  const computedDuration = Math.round(
    (Date.parse(arrivalAt) - Date.parse(departureAt)) / 60_000,
  );
  if (computedDuration <= 0) throw new Error("Invalid duration");
  const declaredDuration = offer.duration_min ?? firstLeg?.duration_min;
  const durationMinutes =
    declaredDuration && Math.abs(declaredDuration - computedDuration) <= 1
      ? Math.round(declaredDuration)
      : computedDuration;
  const segmentsCount = offer.segments_count ?? firstLeg?.segments?.length ?? 1;
  const canonicalIdentity = `${context.mode}|${context.originCityId}|${context.destinationCityId}|${departureAt}|${arrivalAt}|${offer.price.amount}`;
  const providerId =
    offer.offer_id === undefined
      ? stableId(canonicalIdentity)
      : String(offer.offer_id);
  const bookingUrl =
    allowedTutuUrl(offer.checkout_url) ??
    allowedTutuUrl(offer.search_results_url);
  const route = RouteOptionSchema.parse({
    id: `tutu:${context.mode}:${providerId}`,
    originCityId: context.originCityId,
    destinationCityId: context.destinationCityId,
    mode: context.mode,
    departureAt,
    arrivalAt,
    durationMinutes,
    price: { amount: offer.price.amount, currency: "RUB" },
    ...(segmentsCount > 0 ? { transfers: Math.max(0, segmentsCount - 1) } : {}),
    ...(bookingUrl ? { bookingUrl } : {}),
    source: "tutu",
  });
  return {
    value: route,
    rawMetadata: Object.freeze({
      providerOfferId: offer.offer_id,
      transport: offer.transport,
      carriers: offer.carriers,
      checkoutRef: offer.checkout_ref,
    }),
  };
}

function toIsoInstant(value: string | undefined): string {
  if (!value || !/(?:Z|[+-]\d{2}:\d{2})$/.test(value))
    throw new Error("Datetime offset is required");
  const timestamp = Date.parse(value);
  if (!Number.isFinite(timestamp)) throw new Error("Invalid datetime");
  return new Date(timestamp).toISOString();
}

export function allowedTutuUrl(value: string | undefined): string | undefined {
  if (!value) return undefined;
  try {
    const url = new URL(value);
    if (
      url.protocol !== "https:" ||
      (url.hostname !== "tutu.ru" && !url.hostname.endsWith(".tutu.ru"))
    )
      return undefined;
    return value;
  } catch {
    return undefined;
  }
}

function invalidResponse(
  context: { tool: string; mode: TransportMode },
  message: string,
): ProviderFailure {
  return {
    code: "INVALID_RESPONSE",
    tool: context.tool,
    mode: context.mode,
    retryable: false,
    message,
  };
}
