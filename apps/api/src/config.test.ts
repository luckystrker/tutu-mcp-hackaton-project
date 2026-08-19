import { describe, expect, it } from "vitest";
import { loadConfig, resolveLlmConfig } from "./config.js";

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
      LLM_BASE_URL: "",
      LLM_API_KEY: "",
    });
    expect(config.PORT).toBe(3000);
    expect(config.TELEGRAM_BOT_TOKEN).toBeUndefined();
  });

  it("accepts a complete LLM configuration", () => {
    const config = loadConfig({
      ...required,
      LLM_PROVIDER: "openai",
      LLM_MODEL: "gpt-4o-mini",
      LLM_BASE_URL: "https://api.openai.com/v1",
      LLM_API_KEY: "secret",
    });
    expect(config.LLM_PROVIDER).toBe("openai");
    expect(config.LLM_API_KEY).toBe("secret");
  });

  it("parses the reverse proxy trust setting", () => {
    expect(
      loadConfig({ ...required, TRUST_PROXY: "" }).TRUST_PROXY,
    ).toBeUndefined();
    expect(loadConfig({ ...required, TRUST_PROXY: "true" }).TRUST_PROXY).toBe(
      true,
    );
    expect(loadConfig({ ...required, TRUST_PROXY: "false" }).TRUST_PROXY).toBe(
      false,
    );
    expect(loadConfig({ ...required, TRUST_PROXY: "1" }).TRUST_PROXY).toBe(1);
    expect(
      loadConfig({ ...required, TRUST_PROXY: "10.0.0.0/8,192.168.0.1" })
        .TRUST_PROXY,
    ).toBe("10.0.0.0/8,192.168.0.1");
  });

  it("requires Telegram credentials in production", () => {
    expect(() => loadConfig({ ...required, NODE_ENV: "production" })).toThrow();
  });

  it("disables an incomplete optional LLM without blocking startup", () => {
    const resolved = resolveLlmConfig(
      loadConfig({
        ...required,
        LLM_PROVIDER: "provider",
        LLM_MODEL: "model",
        LLM_BASE_URL: "https://llm.example/v1",
      }),
    );
    expect(resolved).toEqual({
      enabled: false,
      requested: true,
      missing: ["LLM_API_KEY"],
    });
  });
});
