import { describe, expect, it } from "vitest";
import { localizedErrorMessage } from "./localization.js";

const APPLICATION_ERROR_CODES = [
  "BAD_REQUEST",
  "UNAUTHORIZED",
  "FORBIDDEN",
  "NOT_FOUND",
  "METHOD_NOT_ALLOWED",
  "CONFLICT",
  "VALIDATION_FAILED",
  "RATE_LIMITED",
  "INTERNAL_ERROR",
  "REQUEST_FAILED",
  "TRIP_CLOSED",
  "TRIP_FULL",
  "UNKNOWN_CITY",
  "RESULT_NOT_FOUND",
  "INVALID_RESULT",
  "COMPUTATION_RUNNING",
  "TRIP_NOT_READY",
  "RESULT_NOT_READY",
  "STALE",
  "STALE_RESULT",
  "INCOMPLETE_RESULT",
  "HOTEL_UNAVAILABLE",
  "EMPTY_SHORTLIST",
  "INVALID_STATE",
  "INVALID_PERIOD",
  "TRIP_FINALIZED",
  "ORGANIZER_CANNOT_LEAVE",
  "INVALID_TELEGRAM_AUTH",
  "TELEGRAM_AUTH_EXPIRED",
] as const;

describe("localizedErrorMessage", () => {
  it.each(APPLICATION_ERROR_CODES)("localizes %s in both locales", (code) => {
    const en = localizedErrorMessage(code, "en");
    const ru = localizedErrorMessage(code, "ru");
    expect(en).toBeTruthy();
    expect(ru).toBeTruthy();
    expect(en).not.toMatch(/[А-Яа-яЁё]/u);
    expect(ru).toMatch(/[А-Яа-яЁё]/u);
  });

  it("falls back to the generic message for unknown codes", () => {
    expect(localizedErrorMessage("SOMETHING_ELSE", "en")).toBe(
      "The request could not be completed",
    );
    expect(localizedErrorMessage("SOMETHING_ELSE", "ru")).toBe(
      "Не удалось выполнить запрос",
    );
  });
});
