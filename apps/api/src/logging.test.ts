import { describe, expect, it } from "vitest";
import { buildLoggerOptions, SENSITIVE_LOG_PATHS } from "./logging.js";

describe("logger configuration", () => {
  it("redacts credentials and private participant constraints", () => {
    expect(SENSITIVE_LOG_PATHS).toEqual(
      expect.arrayContaining([
        "req.headers.authorization",
        "req.body.initData",
        "telegramBotToken",
        "softPreferences",
        "maxBudget",
      ]),
    );
    expect(buildLoggerOptions("production")).toMatchObject({
      level: "info",
      redact: { censor: "[REDACTED]" },
    });
  });
});
