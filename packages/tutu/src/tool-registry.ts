import type { TransportMode } from "@rendezvous/contracts";
import { z } from "zod";

export const TUTU_SCHEMA_VERSION = "tutu-mcp-0.38.0-v1";

export const TOOL_BY_MODE: Readonly<
  Record<TransportMode, TutuTransportToolName>
> = {
  train: "search_rail",
  air: "search_avia",
  bus: "search_bus",
  suburban: "search_etrain",
};

export type TutuTransportToolName =
  "search_rail" | "search_avia" | "search_bus" | "search_etrain";
export type TutuToolName = TutuTransportToolName | "search_hotels";

const CommonTransportInputSchema = z.strictObject({
  origin: z.string().trim().min(1),
  destination: z.string().trim().min(1),
  departure_date: z.iso.date(),
  page: z.literal(1),
  page_size: z.number().int().min(1).max(30),
  sort: z.enum(["price_asc", "duration_asc", "departure_asc"]),
  view: z.literal("compact"),
});

export const RailInputSchema = CommonTransportInputSchema.extend({
  passengers: z.literal(1),
});
export const AviaInputSchema = CommonTransportInputSchema.extend({
  adults: z.literal(1),
  children: z.literal(0),
  infants: z.literal(0),
});
export const BusInputSchema = CommonTransportInputSchema.extend({
  adults: z.literal(1),
  children: z.literal(0),
});
export const EtrainInputSchema = CommonTransportInputSchema;
export const HotelInputSchema = z.strictObject({
  city_name: z.string().trim().min(1),
  check_in: z.iso.date(),
  check_out: z.iso.date(),
  adults: z.number().int().min(1).max(6),
  page: z.literal(1),
  page_size: z.number().int().min(1).max(30),
  view: z.literal("compact"),
});

export function buildTransportToolInput(
  tool: TutuTransportToolName,
  input: { origin: string; destination: string; departureDate: string },
): Readonly<Record<string, unknown>> {
  const common = {
    origin: input.origin,
    destination: input.destination,
    departure_date: input.departureDate,
    page: 1 as const,
    page_size: 30,
    sort: "price_asc" as const,
    view: "compact" as const,
  };
  if (tool === "search_rail")
    return RailInputSchema.parse({ ...common, passengers: 1 });
  if (tool === "search_avia")
    return AviaInputSchema.parse({
      ...common,
      adults: 1,
      children: 0,
      infants: 0,
    });
  if (tool === "search_bus")
    return BusInputSchema.parse({ ...common, adults: 1, children: 0 });
  return EtrainInputSchema.parse(common);
}
