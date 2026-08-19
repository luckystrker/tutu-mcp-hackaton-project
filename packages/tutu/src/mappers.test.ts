import { describe, expect, it } from "vitest";
import aviaFixture from "./fixtures/avia.json" with { type: "json" };
import busFixture from "./fixtures/bus.json" with { type: "json" };
import etrainFixture from "./fixtures/etrain.json" with { type: "json" };
import hotelFixture from "./fixtures/hotels.json" with { type: "json" };
import railFixture from "./fixtures/rail.json" with { type: "json" };
import { mapHotelResponse } from "./hotel-mapper.js";
import { mapTransportResponse } from "./transport-mapper.js";

const MOSCOW_ID = "11111111-1111-4111-8111-111111111111";
const YAROSLAVL_ID = "22222222-2222-4222-8222-222222222222";

describe("Tutu response mappers", () => {
  it.each([
    ["train", "search_rail", railFixture],
    ["air", "search_avia", aviaFixture],
    ["bus", "search_bus", busFixture],
    ["suburban", "search_etrain", etrainFixture],
  ] as const)(
    "normalizes %s offers without exposing provider shape",
    (mode, tool, fixture) => {
      const result = mapTransportResponse(fixture, {
        tool,
        mode,
        originCityId: MOSCOW_ID,
        destinationCityId: YAROSLAVL_ID,
      });

      expect(result.failures).toEqual([]);
      expect(result.options[0]?.value).toMatchObject({
        id: `tutu:${mode}:fixture-${mode === "train" ? "rail" : mode === "air" ? "avia" : mode === "suburban" ? "etrain" : "bus"}-101`,
        mode,
        departureAt: "2026-09-04T06:10:00.000Z",
        arrivalAt: "2026-09-04T09:40:00.000Z",
        durationMinutes: 210,
        price: { currency: "RUB" },
        source: "tutu",
      });
      expect(result.options[0]?.value).not.toHaveProperty("offer_id");
    },
  );

  it("rejects missing prices instead of converting them to zero", () => {
    const result = mapTransportResponse(
      {
        offers: [
          {
            offer_id: "free-by-accident",
            departure_at: "2026-09-04T09:00:00+03:00",
            arrival_at: "2026-09-04T10:00:00+03:00",
          },
        ],
      },
      {
        tool: "search_bus",
        mode: "bus",
        originCityId: MOSCOW_ID,
        destinationCityId: YAROSLAVL_ID,
      },
    );
    expect(result.options).toEqual([]);
    expect(result.failures[0]?.code).toBe("INVALID_RESPONSE");
  });

  it("requires timezone offsets, handles overnight trips, and drops unsafe URLs", () => {
    const response = {
      offers: [
        {
          price: { amount: 1000, currency: "RUB" },
          departure_at: "2026-09-04T23:30:00+03:00",
          arrival_at: "2026-09-05T02:00:00+03:00",
          duration_min: 10,
          checkout_url: "https://evil.example/steal",
        },
        {
          price: { amount: 1000, currency: "RUB" },
          departure_at: "2026-09-04T10:00:00",
          arrival_at: "2026-09-04T11:00:00",
        },
      ],
    };
    const result = mapTransportResponse(response, {
      tool: "search_rail",
      mode: "train",
      originCityId: MOSCOW_ID,
      destinationCityId: YAROSLAVL_ID,
    });
    expect(result.options).toHaveLength(1);
    expect(result.options[0]?.value.durationMinutes).toBe(150);
    expect(result.options[0]?.value.bookingUrl).toBeUndefined();
    expect(result.failures).toHaveLength(1);
  });

  it("normalizes hotels and preserves an unknown price as null", () => {
    const result = mapHotelResponse(hotelFixture, {
      cityId: YAROSLAVL_ID,
      checkIn: "2026-09-04",
      checkOut: "2026-09-06",
      fetchedAt: "2026-08-19T00:00:00.000Z",
    });
    expect(result.failures).toEqual([]);
    expect(result.options.map(({ value }) => value.totalPrice)).toEqual([
      { amount: 6420.5, currency: "RUB" },
      null,
    ]);
  });
});
