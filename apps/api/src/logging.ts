import type { FastifyServerOptions } from "fastify";

export const SENSITIVE_LOG_PATHS = [
  "req.headers.authorization",
  "req.headers.cookie",
  "req.body.initData",
  "authorization",
  "cookie",
  "initData",
  "telegramBotToken",
  "softPreferences",
  "maxBudget",
] as const;

export function buildLoggerOptions(
  environment: "development" | "test" | "production",
): FastifyServerOptions["logger"] {
  return {
    level: environment === "development" ? "debug" : "info",
    redact: { paths: [...SENSITIVE_LOG_PATHS], censor: "[REDACTED]" },
  };
}
