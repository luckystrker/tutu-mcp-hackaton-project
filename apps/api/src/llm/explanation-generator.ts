import { z } from "zod";
import type { ExplanationFacts } from "@rendezvous/contracts";
import type { LlmClient } from "./llm-client.js";

const RewriteSchema = z.strictObject({
  text: z.string().trim().min(1).max(2_000),
});

export type ExplanationGeneration = {
  source: "template" | "llm";
  text: string;
};

export class InMemoryLlmMetrics {
  #calls = 0;
  #fallbacks = 0;
  #invalid = 0;
  #durations: number[] = [];

  record(durationMs: number, result: "success" | "fallback" | "invalid") {
    this.#calls += 1;
    this.#durations.push(Math.max(0, Math.round(durationMs)));
    if (result !== "success") this.#fallbacks += 1;
    if (result === "invalid") this.#invalid += 1;
  }

  snapshot() {
    const ordered = [...this.#durations].sort((a, b) => a - b);
    return {
      calls: this.#calls,
      fallbacks: this.#fallbacks,
      invalidOutputs: this.#invalid,
      p95DurationMs:
        ordered[Math.max(0, Math.ceil(ordered.length * 0.95) - 1)] ?? 0,
    };
  }
}

export class ExplanationGenerator {
  #consecutiveFailures = 0;
  #openUntil = 0;

  constructor(
    private readonly client: LlmClient | undefined,
    private readonly metrics: InMemoryLlmMetrics = new InMemoryLlmMetrics(),
    private readonly now: () => number = Date.now,
    private readonly failureThreshold = 3,
    private readonly openMs = 30_000,
  ) {}

  async generate(
    facts: ExplanationFacts,
    template: string,
  ): Promise<ExplanationGeneration> {
    if (!this.client || this.now() < this.#openUntil)
      return { source: "template", text: template };
    const startedAt = performance.now();
    try {
      const raw = await this.completeWithOneRetry(facts);
      const parsed = RewriteSchema.safeParse(JSON.parse(raw));
      if (!parsed.success || /\d/.test(parsed.data.text)) {
        this.#recordFailure();
        this.metrics.record(performance.now() - startedAt, "invalid");
        return { source: "template", text: template };
      }
      this.#consecutiveFailures = 0;
      this.metrics.record(performance.now() - startedAt, "success");
      return { source: "llm", text: parsed.data.text };
    } catch {
      this.#recordFailure();
      this.metrics.record(performance.now() - startedAt, "fallback");
      return { source: "template", text: template };
    }
  }

  private async completeWithOneRetry(facts: ExplanationFacts): Promise<string> {
    const messages = [
      {
        role: "system" as const,
        content:
          'Rewrite the supplied travel explanation facts in concise Russian using at most three short sentences. Return strict JSON {"text":string}. Do not use digits, add facts, infer private values, or give advice.',
      },
      { role: "user" as const, content: JSON.stringify(facts) },
    ];
    try {
      return await this.client!.complete(messages, { json: true });
    } catch (error) {
      if (
        typeof error === "object" &&
        error !== null &&
        "retryable" in error &&
        error.retryable === true
      )
        return this.client!.complete(messages, { json: true });
      throw error;
    }
  }

  #recordFailure() {
    this.#consecutiveFailures += 1;
    if (this.#consecutiveFailures >= this.failureThreshold) {
      this.#openUntil = this.now() + this.openMs;
      this.#consecutiveFailures = 0;
    }
  }
}
