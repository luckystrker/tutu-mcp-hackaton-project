import { describe, expect, it, vi } from "vitest";
import { createRateLimiter } from "./rate-limit.js";

describe("createRateLimiter", () => {
  it("allows hits within the limit and rejects above it", () => {
    const limiter = createRateLimiter({
      windowMs: 60_000,
      message: "Too many requests",
    });
    for (let hit = 0; hit < 3; hit += 1) limiter.check("192.0.2.1", 3);
    expect(() => limiter.check("192.0.2.1", 3)).toThrowError(
      expect.objectContaining({
        statusCode: 429,
        message: "Too many requests",
      }),
    );
  });

  it("tracks keys independently", () => {
    const limiter = createRateLimiter({
      windowMs: 60_000,
      message: "Too many requests",
    });
    for (let hit = 0; hit < 2; hit += 1) limiter.check("192.0.2.1", 2);
    expect(() => limiter.check("192.0.2.2", 2)).not.toThrow();
  });

  it("resets the counter after the window elapses", () => {
    const limiter = createRateLimiter({
      windowMs: 60_000,
      message: "Too many requests",
    });
    limiter.check("192.0.2.1", 1);
    vi.useFakeTimers({ toFake: ["Date"] });
    try {
      vi.setSystemTime(Date.now() + 61_000);
      limiter.check("192.0.2.1", 1);
    } finally {
      vi.useRealTimers();
    }
  });
});
