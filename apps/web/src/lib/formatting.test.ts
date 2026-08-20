import { describe, expect, it } from "vitest";
import {
  formatDate,
  formatDateInput,
  formatTime,
  parseDateInput,
} from "./formatting.js";

describe("date formatting", () => {
  it("renders dates as dd.mm.yyyy", () => {
    expect(formatDate("2026-09-05T12:00:00Z")).toMatch(/^\d{2}\.\d{2}\.2026$/);
  });

  it("accepts date-only strings for hotel check-ins", () => {
    expect(formatDate("2026-09-05")).toBe("05.09.2026");
  });

  it("adds the default time for editable fields", () => {
    expect(formatDateInput("2026-09-05T00:00:00Z", "18:00")).toMatch(
      /^\d{2}\.\d{2}\.2026 18:00$/,
    );
  });
});

describe("parseDateInput", () => {
  it("parses dd.mm.yyyy with optional time", () => {
    const date = parseDateInput("05.09.2026 18:30")!;
    expect(
      `${date.getFullYear()}-${date.getMonth() + 1}-${date.getDate()}`,
    ).toBe("2026-9-5");
    expect(`${date.getHours()}:${date.getMinutes()}`).toBe("18:30");
  });

  it("applies the default time when only the date is given", () => {
    const date = parseDateInput("05.09.2026", "21:00")!;
    expect(
      `${String(date.getHours()).padStart(2, "0")}:${String(date.getMinutes()).padStart(2, "0")}`,
    ).toBe("21:00");
  });

  it("accepts separators and short years", () => {
    const date = parseDateInput("5-9-26")!;
    expect(date.getFullYear()).toBe(2026);
    expect(date.getMonth()).toBe(8);
    expect(date.getDate()).toBe(5);
  });

  it("falls back to ISO strings", () => {
    const date = parseDateInput("2026-09-05T12:00:00Z")!;
    expect(date.toISOString()).toBe("2026-09-05T12:00:00.000Z");
  });

  it("rejects garbage", () => {
    expect(parseDateInput("next friday")).toBeNull();
    expect(parseDateInput("32.13.2026")).toBeNull();
  });
});

describe("DateField time preservation", () => {
  it("keeps the time from a saved value instead of the default", () => {
    const saved = parseDateInput("2026-08-22T09:30:00Z")!;
    const hasOwnTime = saved.getHours() !== 0 || saved.getMinutes() !== 0;
    const text = formatDateInput(
      saved,
      hasOwnTime ? formatTime(saved) : "18:00",
    );
    expect(text).toMatch(/^\d{2}\.\d{2}\.2026 \d{2}:\d{2}$/);
    expect(text.endsWith("18:00")).toBe(false);
  });

  it("falls back to the default time for local-midnight defaults", () => {
    const midnight = new Date(2026, 7, 22, 0, 0);
    const hasOwnTime = midnight.getHours() !== 0 || midnight.getMinutes() !== 0;
    const text = formatDateInput(
      midnight,
      hasOwnTime ? formatTime(midnight) : "18:00",
    );
    expect(text.endsWith("18:00")).toBe(true);
  });
});
