import { describe, expect, it, vi } from "vitest";
import type { ExplanationFacts } from "@rendezvous/contracts";
import type { LlmClient } from "./llm-client.js";
import {
  ExplanationGenerator,
  InMemoryLlmMetrics,
} from "./explanation-generator.js";

const facts: ExplanationFacts = {
  type: "counterfactual",
  city: null,
  changes: [],
};

describe("optional explanation generator", () => {
  it("accepts strict text without numbers", async () => {
    const client = {
      complete: vi.fn(async () => '{"text":"Хороший баланс для группы"}'),
    } as LlmClient;
    await expect(
      new ExplanationGenerator(client).generate(facts, "fallback"),
    ).resolves.toEqual({
      source: "llm",
      text: "Хороший баланс для группы",
    });
  });

  it("falls back when the model adds a number or invalid JSON", async () => {
    for (const value of ['{"text":"Добавьте 500 рублей"}', "not json"]) {
      const client = { complete: vi.fn(async () => value) } as LlmClient;
      await expect(
        new ExplanationGenerator(client).generate(facts, "safe"),
      ).resolves.toEqual({
        source: "template",
        text: "safe",
      });
    }
  });

  it("opens the breaker and stops calling the provider", async () => {
    const metrics = new InMemoryLlmMetrics();
    const client = {
      complete: vi.fn(async () => {
        throw new Error("down");
      }),
    } as LlmClient;
    const generator = new ExplanationGenerator(
      client,
      metrics,
      () => 1000,
      2,
      30_000,
    );
    await generator.generate(facts, "safe");
    await generator.generate(facts, "safe");
    await generator.generate(facts, "safe");
    expect(client.complete).toHaveBeenCalledTimes(2);
    expect(metrics.snapshot()).toMatchObject({ calls: 2, fallbacks: 2 });
  });
});
