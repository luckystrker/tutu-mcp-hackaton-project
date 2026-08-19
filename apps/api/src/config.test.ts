import { describe, expect, it } from "vitest";
import { loadConfig } from "./config.js";

const required = {
  DATABASE_URL: "postgresql://user:password@localhost:5432/rendezvous",
  PUBLIC_MINI_APP_URL: "http://localhost:5173",
};

describe("application config", () => {
  it("parses defaults and strips empty optional settings", () => {
    const config = loadConfig({
      ...required,
      TELEGRAM_BOT_TOKEN: "",
      LLM_PROVIDER: "",
      LLM_MODEL: "",
    });
    expect(config.PORT).toBe(3000);
    expect(config.TELEGRAM_BOT_TOKEN).toBeUndefined();
  });

  it("requires Telegram credentials in production", () => {
    expect(() => loadConfig({ ...required, NODE_ENV: "production" })).toThrow();
  });

  it("requires both LLM provider fields or neither", () => {
    expect(() =>
      loadConfig({ ...required, LLM_PROVIDER: "provider" }),
    ).toThrow();
  });
});
