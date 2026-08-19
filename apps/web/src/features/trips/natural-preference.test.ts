import { describe, expect, it } from "vitest";
import { parseNaturalPreference } from "./natural-preference.js";

describe("natural preference parser", () => {
  it("turns supported Russian phrases into the shared contract", () => {
    expect(
      parseNaturalPreference(
        "Без ночных поездок, прибыть утром, до 8 часов, гулять у воды",
      ),
    ).toEqual({
      avoidNightTravel: true,
      preferMorningArrival: true,
      maxTravelHoursPreferred: 8,
      destinationTags: ["nature"],
    });
  });
});
