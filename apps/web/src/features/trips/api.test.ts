import { describe, expect, it } from "vitest";
import { parseSseFrame } from "./api.js";

const event = {
  id: "42",
  tripId: "40000000-0000-4000-8000-000000000001",
  revision: 3,
  occurredAt: "2026-08-19T12:00:00.000Z",
  type: "participant_ready",
  payload: {
    participantId: "41000000-0000-4000-8000-000000000001",
    readyCount: 2,
  },
};

describe("SSE wire parser", () => {
  it("parses a shared-contract event and ignores heartbeat comments", () => {
    expect(
      parseSseFrame(
        `id: 42\nevent: participant_ready\ndata: ${JSON.stringify(event)}`,
      ),
    ).toEqual(event);
    expect(parseSseFrame(": heartbeat 123")).toBeNull();
  });

  it("rejects payloads outside the public event projection", () => {
    expect(() =>
      parseSseFrame(
        `data: ${JSON.stringify({
          ...event,
          payload: { ...event.payload, maxBudget: 10000 },
        })}`,
      ),
    ).toThrow();
  });
});
