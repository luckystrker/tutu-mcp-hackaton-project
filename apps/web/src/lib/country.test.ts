// @vitest-environment jsdom
import { afterEach, describe, expect, it, vi } from "vitest";
import { detectCountryCode, guessCountryCode } from "./country.js";

const originalNavigator = globalThis.navigator;

afterEach(() => {
  Object.defineProperty(globalThis, "navigator", {
    value: originalNavigator,
    configurable: true,
  });
});

describe("country detection", () => {
  it("falls back to timezone/language without a geolocation permission", async () => {
    const navigatorMock = {
      language: "en-US",
      languages: ["en-US"],
      permissions: { query: vi.fn(async () => ({ state: "prompt" })) },
      geolocation: {
        getCurrentPosition: vi.fn(),
      },
    };
    Object.defineProperty(globalThis, "navigator", {
      value: navigatorMock,
      configurable: true,
    });
    const country = await detectCountryCode();
    expect(country).toBe(guessCountryCode());
    expect(navigatorMock.geolocation.getCurrentPosition).not.toHaveBeenCalled();
  });

  it("uses exact coordinates only when permission is already granted", async () => {
    const navigatorMock = {
      language: "ru-RU",
      languages: ["ru-RU"],
      permissions: { query: vi.fn(async () => ({ state: "granted" })) },
      geolocation: {
        getCurrentPosition: vi.fn(
          (
            resolve: (position: {
              coords: { latitude: number; longitude: number };
            }) => void,
          ) => resolve({ coords: { latitude: 55.7558, longitude: 37.6173 } }),
        ),
      },
    };
    Object.defineProperty(globalThis, "navigator", {
      value: navigatorMock,
      configurable: true,
    });
    await expect(detectCountryCode()).resolves.toBe("RU");
  });
});
