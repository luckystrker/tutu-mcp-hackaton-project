import type { TutuMetric, TutuMetrics } from "./types.js";

export type TutuMetricSummary = {
  tool: string;
  calls: number;
  errorRate: number;
  p95DurationMs: number;
  cacheHits: number;
  staleHits: number;
};

export class InMemoryTutuMetrics implements TutuMetrics {
  readonly #metrics: TutuMetric[] = [];

  record(metric: TutuMetric): void {
    this.#metrics.push({
      ...metric,
      durationMs: Math.max(0, Math.round(metric.durationMs)),
    });
  }

  snapshot(): readonly TutuMetricSummary[] {
    const tools = new Map<string, TutuMetric[]>();
    for (const metric of this.#metrics) {
      const bucket = tools.get(metric.tool) ?? [];
      bucket.push(metric);
      tools.set(metric.tool, bucket);
    }
    return [...tools.entries()].map(([tool, metrics]) => {
      const durations = metrics
        .map(({ durationMs }) => durationMs)
        .sort((a, b) => a - b);
      const p95Index = Math.max(0, Math.ceil(durations.length * 0.95) - 1);
      return {
        tool,
        calls: metrics.length,
        errorRate:
          metrics.filter(({ status }) => status === "error").length /
          metrics.length,
        p95DurationMs: durations[p95Index] ?? 0,
        cacheHits: metrics.filter(({ cache }) => cache === "hit").length,
        staleHits: metrics.filter(({ cache }) => cache === "stale").length,
      };
    });
  }
}
