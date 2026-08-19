import { describe, expect, it, vi } from "vitest";
import { ConcurrencyLimiter } from "./concurrency.js";
import { TutuProviderError } from "./errors.js";
import { InMemoryTutuMetrics } from "./metrics.js";
import { callWithRetry } from "./retry.js";

describe("Tutu resilience", () => {
  it("retries one retryable error and does not retry validation errors", async () => {
    const retryable = vi
      .fn()
      .mockRejectedValueOnce(new Error("HTTP 503"))
      .mockResolvedValueOnce("ok");
    await expect(
      callWithRetry({
        tool: "search_rail",
        signal: new AbortController().signal,
        timeoutMs: 1000,
        operation: retryable,
      }),
    ).resolves.toBe("ok");
    expect(retryable).toHaveBeenCalledTimes(2);

    const invalid = vi.fn().mockRejectedValue(
      new TutuProviderError({
        code: "INVALID_RESPONSE",
        tool: "search_rail",
        message: "bad schema",
        retryable: false,
      }),
    );
    await expect(
      callWithRetry({
        tool: "search_rail",
        signal: new AbortController().signal,
        timeoutMs: 1000,
        operation: invalid,
      }),
    ).rejects.toMatchObject({ code: "INVALID_RESPONSE" });
    expect(invalid).toHaveBeenCalledTimes(1);
  });

  it("enforces one shared deadline across attempts", async () => {
    const operation = vi.fn(
      (signal: AbortSignal) =>
        new Promise((_resolve, reject) => {
          signal.addEventListener("abort", () => reject(signal.reason), {
            once: true,
          });
        }),
    );
    await expect(
      callWithRetry({
        tool: "search_bus",
        signal: new AbortController().signal,
        timeoutMs: 15,
        operation,
      }),
    ).rejects.toMatchObject({ code: "TIMEOUT" });
    expect(operation).toHaveBeenCalledTimes(1);
  });

  it("limits concurrent work", async () => {
    const limiter = new ConcurrencyLimiter(2);
    let active = 0;
    let maximum = 0;
    const tasks = Array.from({ length: 8 }, () =>
      limiter.run(async () => {
        active += 1;
        maximum = Math.max(maximum, active);
        await new Promise((resolve) => setTimeout(resolve, 2));
        active -= 1;
      }),
    );
    await Promise.all(tasks);
    expect(maximum).toBe(2);
  });

  it("reports bounded per-tool metrics", () => {
    const metrics = new InMemoryTutuMetrics();
    metrics.record({
      tool: "search_rail",
      durationMs: 10,
      status: "success",
      cache: "none",
    });
    metrics.record({
      tool: "search_rail",
      durationMs: 30,
      status: "error",
      cache: "stale",
    });
    expect(metrics.snapshot()).toEqual([
      {
        tool: "search_rail",
        calls: 2,
        errorRate: 0.5,
        p95DurationMs: 30,
        cacheHits: 0,
        staleHits: 1,
      },
    ]);
  });
});
