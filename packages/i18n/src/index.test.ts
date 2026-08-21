import { describe, expect, it } from "vitest";
import { normalizeLocale, resolveLocale } from "./index.js";

describe("locale resolution", () => {
  it.each([
    ["ru", "ru"],
    ["ru-RU", "ru"],
    ["RU_ru", "ru"],
    ["en", "en"],
    ["en-GB", "en"],
    ["de", null],
    ["", null],
    [undefined, null],
  ])("normalizes %s", (input, expected) => {
    expect(normalizeLocale(input)).toBe(expected);
  });

  it("uses the first supported candidate and falls back to English", () => {
    expect(resolveLocale(["de-DE", "ru-RU", "en"])).toBe("ru");
    expect(resolveLocale(["de-DE", undefined])).toBe("en");
  });
});
