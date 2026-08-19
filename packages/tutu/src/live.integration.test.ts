import { describe, expect, it } from "vitest";
import { createTutuTransportAdapter } from "./adapter.js";
import { createTutuToolCaller } from "./client.js";

const live = process.env.TUTU_LIVE_TEST === "1" ? describe : describe.skip;
const MOSCOW_ID = "11111111-1111-4111-8111-111111111111";
const YAROSLAVL_ID = "22222222-2222-4222-8222-222222222222";

live("Tutu MCP live adapter", () => {
  it("returns normalized outbound and return offers with safe Tutu links", async () => {
    const caller = createTutuToolCaller({
      url: new URL(process.env.TUTU_MCP_URL ?? "https://mcp.tutu.ru/mcp"),
      timeoutMs: 10_000,
    });
    const adapter = createTutuTransportAdapter({ caller, timeoutMs: 10_000 });
    const departure = new Date(Date.now() + 21 * 86_400_000)
      .toISOString()
      .slice(0, 10);
    const signal = AbortSignal.timeout(30_000);
    const common = {
      earliestDepartureAt: `${departure}T00:00:00.000Z`,
      latestArrivalAt: `${departure}T20:59:59.999Z`,
      allowedModes: ["train"] as const,
      passengers: 1 as const,
    };
    try {
      const checkout = new Date(`${departure}T00:00:00.000Z`);
      checkout.setUTCDate(checkout.getUTCDate() + 2);
      const [outbound, returning, hotels] = await Promise.all([
        adapter.searchOutbound(
          {
            ...common,
            origin: { id: MOSCOW_ID, name: "Москва", tz: "Europe/Moscow" },
            destination: {
              id: YAROSLAVL_ID,
              name: "Ярославль",
              tz: "Europe/Moscow",
            },
          },
          signal,
        ),
        adapter.searchReturn(
          {
            ...common,
            origin: {
              id: YAROSLAVL_ID,
              name: "Ярославль",
              tz: "Europe/Moscow",
            },
            destination: { id: MOSCOW_ID, name: "Москва", tz: "Europe/Moscow" },
          },
          signal,
        ),
        adapter.searchHotels(
          {
            city: {
              id: YAROSLAVL_ID,
              name: "Ярославль",
              tz: "Europe/Moscow",
            },
            checkIn: departure,
            checkOut: checkout.toISOString().slice(0, 10),
            guests: 1,
            rooms: 1,
            currency: "RUB",
          },
          signal,
        ),
      ]);
      expect(outbound.data.length).toBeGreaterThan(0);
      expect(returning.data.length).toBeGreaterThan(0);
      for (const option of [...outbound.data, ...returning.data]) {
        expect(option.source).toBe("tutu");
        expect(option.bookingUrl).toMatch(/^https:\/\/(?:[^/]+\.)?tutu\.ru\//);
      }
      expect(hotels.data.length).toBeGreaterThan(0);
      expect(hotels.data.every((hotel) => hotel.source === "tutu")).toBe(true);
    } finally {
      await caller.close();
    }
  }, 40_000);
});
