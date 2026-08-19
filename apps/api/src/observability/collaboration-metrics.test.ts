import { describe, expect, it } from "vitest";
import { InMemoryCollaborationMetrics } from "./collaboration-metrics.js";

describe("collaboration metrics", () => {
  it("tracks bounded SSE counters without identifiers", () => {
    const metrics = new InMemoryCollaborationMetrics();
    metrics.connected(false);
    metrics.connected(true);
    metrics.disconnected();
    const snapshot = metrics.snapshot();
    expect(snapshot).toEqual({
      activeSseConnections: 1,
      sseConnections: 2,
      sseReconnects: 1,
    });
    expect(Object.keys(snapshot)).not.toContain("tripId");
    expect(Object.keys(snapshot)).not.toContain("userId");
  });
});
