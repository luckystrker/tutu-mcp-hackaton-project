import { describe, expect, it } from "vitest";
import { randomTripTitle } from "./trip-titles.js";

describe("random trip titles", () => {
  it("matches the season of the current date", () => {
    const september = randomTripTitle(new Date("2026-09-15T10:00:00"), "ru");
    expect(
      [
        "Сентябрьский побег",
        "Бархатный сезон",
        "Тихий сентябрь",
        "Утренний старт",
        "Кофе и поезд",
      ].includes(september),
    ).toBe(true);
  });

  it("changes between draws", () => {
    const draws = new Set(
      Array.from({ length: 40 }, () =>
        randomTripTitle(new Date("2026-05-04T12:00:00"), "ru"),
      ),
    );
    expect(draws.size).toBeGreaterThan(1);
  });

  it("never returns an empty title", () => {
    for (let month = 0; month < 12; month += 1) {
      const title = randomTripTitle(new Date(2026, month, 10, 3, 0));
      expect(title.length).toBeGreaterThan(3);
    }
  });

  it("uses English by default", () => {
    expect(randomTripTitle(new Date("2026-09-15T10:00:00"))).toMatch(
      /^[A-Za-z]/,
    );
  });
});
