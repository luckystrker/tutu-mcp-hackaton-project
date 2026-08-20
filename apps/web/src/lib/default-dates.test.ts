import { describe, expect, it } from "vitest";
import {
  isPublicHoliday,
  nextDaysOff,
  weekendDaysFor,
} from "./default-dates.js";

function date(iso: string): Date {
  return new Date(`${iso}T12:00:00`);
}

function day(value: Date): string {
  const pad = (part: number) => String(part).padStart(2, "0");
  return `${value.getFullYear()}-${pad(value.getMonth() + 1)}-${pad(
    value.getDate(),
  )}`;
}

describe("default dates", () => {
  it("returns the closest Saturday–Sunday for a midweek day", () => {
    // 2026-08-20 is a Thursday
    const range = nextDaysOff(date("2026-08-20"), "RU");
    expect(day(range.from)).toBe("2026-08-22");
    expect(day(range.to)).toBe("2026-08-23");
  });

  it("returns the current block when today is already a day off", () => {
    const range = nextDaysOff(date("2026-08-22"), "RU");
    expect(day(range.from)).toBe("2026-08-22");
    expect(day(range.to)).toBe("2026-08-23");
  });

  it("prefers an earlier public holiday block over the weekend", () => {
    // 2026-11-04 (Wednesday) is a Russian holiday
    const range = nextDaysOff(date("2026-11-02"), "RU");
    expect(day(range.from)).toBe("2026-11-04");
    expect(day(range.to)).toBe("2026-11-04");
  });

  it("extends a weekend with adjacent holidays into one block", () => {
    const holidays = { RU: ["11-02", "11-03", "11-04"] };
    // Saturday 2026-10-31, Sunday 11-01, then holidays Mon–Wed
    const range = nextDaysOff(date("2026-10-29"), "RU", holidays);
    expect(day(range.from)).toBe("2026-10-31");
    expect(day(range.to)).toBe("2026-11-04");
  });

  it("uses country weekends where they differ", () => {
    expect(weekendDaysFor("IL")).toEqual([5, 6]);
    expect(weekendDaysFor("RU")).toEqual([6, 0]);
  });

  it("recognizes public holidays per country only", () => {
    expect(isPublicHoliday(date("2026-05-09"), "RU")).toBe(true);
    expect(isPublicHoliday(date("2026-05-09"), "GE")).toBe(true);
    expect(isPublicHoliday(date("2026-06-12"), "BY")).toBe(false);
  });
});
