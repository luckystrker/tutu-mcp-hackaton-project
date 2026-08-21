// @vitest-environment jsdom

import { cleanup, render, screen } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import { MemoryRouter } from "react-router-dom";
import {
  afterAll,
  afterEach,
  beforeAll,
  describe,
  expect,
  it,
  vi,
} from "vitest";
import i18n, { LOCALE_STORAGE_KEY, setLocale } from "../i18n/index.js";
import { SettingsPage } from "./SettingsPage.js";

const stored = new Map<string, string>();
const storage = {
  getItem: vi.fn((key: string) => stored.get(key) ?? null),
  setItem: vi.fn((key: string, value: string) => stored.set(key, value)),
};

beforeAll(async () => {
  Object.defineProperty(window, "localStorage", {
    configurable: true,
    value: storage,
  });
  await setLocale("en");
});
afterEach(cleanup);
afterAll(() => setLocale("en"));

describe("language settings", () => {
  it("switches immediately and saves the choice on this device", async () => {
    render(
      <MemoryRouter>
        <SettingsPage />
      </MemoryRouter>,
    );

    expect(
      screen.getByRole("heading", { name: "Make Rendezvous yours" }),
    ).toBeTruthy();
    await userEvent.click(screen.getByRole("radio", { name: "Русский" }));

    expect(
      await screen.findByRole("heading", {
        name: "Настройте Rendezvous под себя",
      }),
    ).toBeTruthy();
    expect(storage.setItem).toHaveBeenLastCalledWith(LOCALE_STORAGE_KEY, "ru");
    expect(document.documentElement.lang).toBe("ru");
    expect(i18n.resolvedLanguage).toBe("ru");
  });
});
