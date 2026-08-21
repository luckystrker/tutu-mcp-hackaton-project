import { describe, expect, it } from "vitest";
import { createDemoFixture } from "./demo.js";

describe("dynamic demo fixture", () => {
  it("selects a Friday at least two weeks away and a Sunday return", () => {
    const fixture = createDemoFixture(new Date("2026-08-21T00:00:00.000Z"));

    expect(fixture.trip.periodFrom).toBe("2026-09-04T15:00:00+03:00");
    expect(fixture.trip.periodTo).toBe("2026-09-06T23:30:00+03:00");
    expect(fixture.participants.map(({ displayName }) => displayName)).toEqual([
      "Данил",
      "Саша",
      "Катя",
      "Маша",
    ]);
  });

  it("is deterministic for a supplied preflight time", () => {
    const reference = new Date("2026-12-20T18:30:00.000Z");
    expect(createDemoFixture(reference)).toEqual(createDemoFixture(reference));
  });

  it("rejects an invalid reference time", () => {
    expect(() => createDemoFixture(new Date("invalid"))).toThrow(
      /reference date/,
    );
  });
});
