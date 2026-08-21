// @vitest-environment jsdom

import { beforeEach, describe, expect, it, vi } from "vitest";
import { detectInitialLocale, LOCALE_STORAGE_KEY } from "./index.js";

describe("browser locale detection", () => {
  const values = new Map<string, string>();
  const storage = {
    getItem: vi.fn((key: string) => values.get(key) ?? null),
    setItem: vi.fn((key: string, value: string) => values.set(key, value)),
    clear: vi.fn(() => values.clear()),
  };

  beforeEach(() => {
    vi.restoreAllMocks();
    storage.clear();
    Object.defineProperty(globalThis, "localStorage", {
      configurable: true,
      value: storage,
    });
    Object.defineProperty(window, "Telegram", {
      configurable: true,
      value: undefined,
    });
  });

  it("prefers a saved locale", () => {
    storage.setItem(LOCALE_STORAGE_KEY, "en");
    Object.defineProperty(window, "Telegram", {
      configurable: true,
      value: { WebApp: { initDataUnsafe: { user: { language_code: "ru" } } } },
    });
    expect(detectInitialLocale()).toBe("en");
  });

  it("uses Telegram before the browser", () => {
    Object.defineProperty(window, "Telegram", {
      configurable: true,
      value: { WebApp: { initDataUnsafe: { user: { language_code: "ru" } } } },
    });
    expect(detectInitialLocale()).toBe("ru");
  });

  it("survives unavailable local storage", () => {
    storage.getItem.mockImplementationOnce(() => {
      throw new Error("blocked");
    });
    Object.defineProperty(window, "Telegram", {
      configurable: true,
      value: undefined,
    });
    expect(["en", "ru"]).toContain(detectInitialLocale());
  });
});
