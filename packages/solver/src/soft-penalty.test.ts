import { describe, expect, it } from "vitest";
import {
  aggregateSoftPenalty,
  calculatePenaltyBreakdown,
} from "./soft-penalty.js";
import { IDS, route } from "./test-fixtures.js";

describe("soft penalties", () => {
  it("stores independent night, transfer, arrival, and travel-hour penalties", () => {
    const outbound = route({
      id: "night-outbound",
      originCityId: IDS.origins[0],
      destinationCityId: IDS.cities[0],
      departureAt: "2026-09-04T21:00:00.000Z",
      arrivalAt: "2026-09-05T07:00:00.000Z",
      price: 1000,
      transfers: 2,
    });
    const returning = route({
      id: "day-return",
      originCityId: IDS.cities[0],
      destinationCityId: IDS.origins[0],
      departureAt: "2026-09-05T12:00:00.000Z",
      arrivalAt: "2026-09-05T22:00:00.000Z",
      price: 1000,
      transfers: 2,
    });
    const penalties = calculatePenaltyBreakdown(
      outbound,
      returning,
      "Europe/Moscow",
      "Europe/Moscow",
      10,
    );
    expect(penalties).toEqual({
      nightTravel: 0.5,
      transfers: 1,
      arrivalWindow: 0,
      maxTravelHours: 1,
    });
    expect(
      aggregateSoftPenalty(
        penalties,
        {
          avoidNightTravel: true,
          preferDirect: true,
          preferMorningArrival: true,
          maxTravelHoursPreferred: 10,
        },
        1200,
      ),
    ).toBe(0.625);
    expect(aggregateSoftPenalty(penalties, {})).toBe(0);
    expect(
      aggregateSoftPenalty(penalties, { maxTravelHoursPreferred: 15 }, 1200),
    ).toBeCloseTo(1 / 3, 8);
  });
});
