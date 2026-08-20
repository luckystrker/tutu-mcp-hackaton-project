import { describe, expect, it } from "vitest";
import { CITY_CATALOG } from "@rendezvous/domain";
import { findNearestCity } from "../lib/geolocation.js";

describe("findNearestCity", () => {
  it("matches a browser position to the nearest supported catalog city", () => {
    const match = findNearestCity(CITY_CATALOG, {
      latitude: 56.015,
      longitude: 92.89,
    });
    expect(match?.city.name).toBe("Красноярск");
    expect(match?.distanceKm).toBeLessThan(1);
  });

  it("returns undefined for an empty catalog", () => {
    expect(
      findNearestCity([], { latitude: 56.015, longitude: 92.89 }),
    ).toBeUndefined();
  });
});
