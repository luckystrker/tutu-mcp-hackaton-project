import { CitySchema, type City } from "@rendezvous/contracts";
import { z } from "zod";
import catalogJson from "../../data/cities.v1.json" with { type: "json" };
import { configureCityLocalization } from "./localization.js";

export const CITY_CATALOG_VERSION = "cities-v1.0.0";
const CityCatalogSchema = z.array(CitySchema).min(100).max(200);

export function validateCityCatalog(input: unknown): readonly City[] {
  const catalog = CityCatalogSchema.parse(input);
  const ids = new Set<string>();
  const names = new Set<string>();
  const coordinates = new Set<string>();
  for (const city of catalog) {
    if (city.lat === 0 && city.lon === 0)
      throw new Error(`City ${city.name} uses placeholder coordinates`);
    const nameKey = `${city.country}:${city.name.toLocaleLowerCase("ru")}`;
    const coordinateKey = `${city.lat}:${city.lon}`;
    if (ids.has(city.id)) throw new Error(`Duplicate city id: ${city.id}`);
    if (names.has(nameKey))
      throw new Error(
        `Duplicate city name and country: ${city.name}, ${city.country}`,
      );
    if (coordinates.has(coordinateKey))
      throw new Error(`Duplicate city coordinates: ${city.lat}, ${city.lon}`);
    ids.add(city.id);
    names.add(nameKey);
    coordinates.add(coordinateKey);
  }
  return Object.freeze(
    catalog.map((city) =>
      Object.freeze({
        ...city,
        tags: Object.freeze([...city.tags]) as City["tags"],
      }),
    ),
  );
}

export const CITY_CATALOG = validateCityCatalog(catalogJson);
configureCityLocalization(CITY_CATALOG);
export const CITY_BY_ID: ReadonlyMap<string, City> = new Map(
  CITY_CATALOG.map((city) => [city.id, city]),
);

export function findCityByName(name: string, country = "RU"): City | undefined {
  const normalizedName = name.trim().toLocaleLowerCase("ru");
  return CITY_CATALOG.find(
    (city) =>
      city.country === country &&
      city.name.toLocaleLowerCase("ru") === normalizedName,
  );
}
