import { describe, expect, it } from "vitest";
import { haversineDistanceKm } from "./haversine.js";
import { normalizeInverse } from "./normalize.js";

describe("geographic helpers", () => {
  it("calculates a known Moscow to Saint Petersburg distance", () => {
    const distance = haversineDistanceKm(
      { lat: 55.7558, lon: 37.6173 },
      { lat: 59.9343, lon: 30.3351 },
    );
    expect(distance).toBeCloseTo(634, -1);
  });

  it("returns zero for identical coordinates and rejects invalid ones", () => {
    expect(
      haversineDistanceKm({ lat: 55, lon: 37 }, { lat: 55, lon: 37 }),
    ).toBe(0);
    expect(() =>
      haversineDistanceKm({ lat: 91, lon: 37 }, { lat: 55, lon: 37 }),
    ).toThrow(RangeError);
  });

  it("normalizes smaller values to larger scores and handles a flat range", () => {
    expect(normalizeInverse([10, 20, 30])).toEqual([100, 50, 0]);
    expect(normalizeInverse([42, 42])).toEqual([100, 100]);
    expect(normalizeInverse([])).toEqual([]);
  });
});
