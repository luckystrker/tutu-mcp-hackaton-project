import { CitySchema } from "@rendezvous/contracts";
import { describe, expect, it } from "vitest";
import {
  CITY_CATALOG,
  CITY_CATALOG_VERSION,
  findCityByName,
  validateCityCatalog,
} from "./catalog.js";

describe("city catalog", () => {
  it("contains a valid versioned MVP catalog", () => {
    expect(CITY_CATALOG_VERSION).toBe("cities-v1.0.0");
    expect(CITY_CATALOG).toHaveLength(110);
    expect(
      CITY_CATALOG.every((city) => CitySchema.safeParse(city).success),
    ).toBe(true);
    expect(new Set(CITY_CATALOG.map(({ id }) => id)).size).toBe(
      CITY_CATALOG.length,
    );
    expect(
      new Set(CITY_CATALOG.map(({ country, name }) => `${country}:${name}`))
        .size,
    ).toBe(CITY_CATALOG.length);
    expect(
      new Set(CITY_CATALOG.map(({ lat, lon }) => `${lat}:${lon}`)).size,
    ).toBe(CITY_CATALOG.length);
    expect(Object.isFrozen(CITY_CATALOG)).toBe(true);
    expect(Object.isFrozen(CITY_CATALOG[0])).toBe(true);
    expect(Object.isFrozen(CITY_CATALOG[0]!.tags)).toBe(true);
  });

  it("contains all demo origins and nearby countries", () => {
    for (const city of [
      "Москва",
      "Санкт-Петербург",
      "Нижний Новгород",
      "Казань",
    ])
      expect(findCityByName(city)).toBeDefined();
    expect(
      new Set(CITY_CATALOG.map(({ country }) => country)).size,
    ).toBeGreaterThanOrEqual(8);
  });

  it("rejects duplicate and placeholder catalog entries", () => {
    expect(() =>
      validateCityCatalog([...CITY_CATALOG.slice(0, 100), CITY_CATALOG[0]!]),
    ).toThrow(/Duplicate city id/);
    expect(() =>
      validateCityCatalog(
        CITY_CATALOG.map((city, index) =>
          index === 0 ? { ...city, lat: 0, lon: 0 } : city,
        ),
      ),
    ).toThrow(/placeholder coordinates/);
  });
});
