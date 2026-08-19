export type RateLimiter = {
  check: (key: string, limit: number) => void;
};

export function createRateLimiter(options: {
  windowMs: number;
  message: string;
}): RateLimiter {
  const hits = new Map<string, { startedAt: number; count: number }>();
  let lastSweepAt = Date.now();
  const sweep = (now: number) => {
    for (const [key, entry] of hits) {
      if (now - entry.startedAt >= options.windowMs) hits.delete(key);
    }
    lastSweepAt = now;
  };
  return {
    check(key, limit) {
      const now = Date.now();
      if (now - lastSweepAt >= options.windowMs) sweep(now);
      const current = hits.get(key);
      if (!current || now - current.startedAt >= options.windowMs) {
        hits.set(key, { startedAt: now, count: 1 });
        return;
      }
      current.count += 1;
      if (current.count > limit) {
        const error = new Error(options.message) as Error & {
          statusCode: number;
        };
        error.statusCode = 429;
        throw error;
      }
    },
  };
}
