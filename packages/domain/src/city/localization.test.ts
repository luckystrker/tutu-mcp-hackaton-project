import { describe, expect, it } from "vitest";
import { CITY_BY_ID, CITY_CATALOG } from "./catalog.js";
import { cityDisplayName, ENGLISH_CITY_NAMES } from "./localization.js";

describe("city localization", () => {
  it("covers the complete catalog with unique Latin display names", () => {
    const names = Object.values(ENGLISH_CITY_NAMES);
    expect(names).toHaveLength(CITY_CATALOG.length);
    expect(new Set(names).size).toBe(CITY_CATALOG.length);
    expect(names.every((name) => !/[А-Яа-яЁё]/u.test(name))).toBe(true);
    for (const city of CITY_CATALOG) {
      expect(ENGLISH_CITY_NAMES[city.id], city.name).toBeTruthy();
    }
  });

  it("keys localized names by city id, not catalog order", () => {
    const anchors: ReadonlyArray<[string, string, string]> = [
      ["10000000-0000-4000-8000-000000000001", "Moscow", "Москва"],
      ["10000000-0000-4000-8000-000000000005", "Kazan", "Казань"],
      ["10000000-0000-4000-8000-000000000043", "Sochi", "Сочи"],
      ["10000000-0000-4000-8000-000000000099", "Almaty", "Алматы"],
      ["10000000-0000-4000-8000-000000000110", "Chisinau", "Кишинёв"],
    ];
    for (const [id, english, russian] of anchors) {
      const city = CITY_BY_ID.get(id)!;
      expect(cityDisplayName(city, "en")).toBe(english);
      expect(cityDisplayName(city, "ru")).toBe(russian);
    }
  });
});
