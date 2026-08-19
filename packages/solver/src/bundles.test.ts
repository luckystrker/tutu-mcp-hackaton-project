import fc from "fast-check";
import { describe, expect, it } from "vitest";
import { dominatesBundle, pruneBundles } from "./bundle-pareto.js";
import { buildParticipantBundles } from "./bundles.js";
import { intersectPresence } from "./presence.js";
import { candidate, participant } from "./test-fixtures.js";

describe("bundle feasibility and Pareto pruning", () => {
  it.each([
    [
      "departure",
      { availableFrom: "2026-09-04T11:00:00.000Z" },
      "departureMinutes",
      60,
    ],
    [
      "return",
      { mustReturnBy: "2026-09-05T01:00:00.000Z" },
      "returnMinutes",
      60,
    ],
    [
      "budget",
      { maxBudget: { amount: 1500, currency: "RUB" as const } },
      "budgetMinor",
      50_000,
    ],
    [
      "transport",
      { forbiddenModes: ["train"] as Array<"train"> },
      "forbiddenModes",
      ["train"],
    ],
  ] as const)(
    "records the exact %s relaxation",
    (_name, overrides, field, expected) => {
      const current = participant(0, overrides);
      const facts = candidate({ participants: [current] });
      const result = buildParticipantBundles(
        current,
        facts.participants[0]!,
        facts,
        1,
      );
      expect(result.feasible).toEqual([]);
      expect(result.all[0]?.requiredRelaxations[field]).toEqual(expected);
    },
  );

  it("accepts exact departure, return, and budget boundaries", () => {
    const current = participant(0, {
      availableFrom: "2026-09-04T10:00:00.000Z",
      mustReturnBy: "2026-09-05T02:00:00.000Z",
      maxBudget: { amount: 2000, currency: "RUB" },
    });
    const facts = candidate({ participants: [current] });
    expect(
      buildParticipantBundles(current, facts.participants[0]!, facts, 1)
        .feasible,
    ).toHaveLength(1);
  });

  it("rounds hard time relaxation upward instead of accepting partial minutes", () => {
    const current = participant(0, {
      availableFrom: "2026-09-04T10:00:01.000Z",
    });
    const facts = candidate({ participants: [current] });
    const bundle = buildParticipantBundles(
      current,
      facts.participants[0]!,
      facts,
      1,
    ).all[0];
    expect(bundle?.requiredRelaxations.departureMinutes).toBe(1);
  });

  it("never admits a bundle whose real round-trip cost exceeds the budget", () => {
    fc.assert(
      fc.property(
        fc.integer({ min: 100, max: 10_000 }),
        fc.integer({ min: 1, max: 99 }),
        (legPrice, gap) => {
          const budget = Math.max(0.01, 2 * legPrice - gap / 100);
          const current = participant(0, {
            maxBudget: { amount: budget, currency: "RUB" },
          });
          const facts = candidate({ participants: [current], price: legPrice });
          return (
            buildParticipantBundles(current, facts.participants[0]!, facts, 1)
              .feasible.length === 0
          );
        },
      ),
    );
  });

  it("prunes preference-independent dominated bundles", () => {
    const current = participant(0);
    const facts = candidate({ participants: [current] });
    const base = buildParticipantBundles(
      current,
      facts.participants[0]!,
      facts,
      1,
    ).all[0]!;
    const dominated = {
      ...base,
      id: "dominated",
      estimatedTripCostMinor: base.estimatedTripCostMinor + 100,
      totalTravelMinutes: base.totalTravelMinutes + 10,
    };
    expect(dominatesBundle(base, dominated)).toBe(true);
    expect(pruneBundles([dominated, base])).toEqual([base]);
  });

  it("keeps cost and presence extremes when the frontier exceeds the cap", () => {
    const current = participant(0);
    const facts = candidate({ participants: [current] });
    const base = buildParticipantBundles(
      current,
      facts.participants[0]!,
      facts,
      1,
    ).all[0]!;
    const narrow = (index: number) => ({
      ...base,
      id: `narrow-${index}`,
      estimatedTripCostMinor: base.estimatedTripCostMinor + (4 - index) * 100,
      presenceStart: `2026-09-04T13:0${index}:00.000Z`,
      presenceEnd: `2026-09-04T14:0${index}:00.000Z`,
    });
    const wide = {
      ...base,
      id: "wide",
      estimatedTripCostMinor: base.estimatedTripCostMinor + 5000,
      presenceStart: "2026-09-04T12:00:00.000Z",
      presenceEnd: "2026-09-04T22:00:00.000Z",
    };
    const pruned = pruneBundles([
      narrow(0),
      narrow(1),
      narrow(2),
      narrow(3),
      wide,
    ]);
    expect(pruned.map(({ id }) => id)).toEqual([
      "narrow-3",
      "narrow-2",
      "narrow-1",
      "wide",
    ]);
  });

  it("calculates intersected and zero common presence", () => {
    const current = participant(0);
    const facts = candidate({ participants: [current] });
    const base = buildParticipantBundles(
      current,
      facts.participants[0]!,
      facts,
      1,
    ).all[0]!;
    expect(
      intersectPresence([
        base,
        {
          ...base,
          id: "second",
          presenceStart: "2026-09-04T14:00:00.000Z",
          presenceEnd: "2026-09-04T20:00:00.000Z",
        },
      ]).commonTimeMinutes,
    ).toBe(360);
    expect(
      intersectPresence([
        base,
        {
          ...base,
          id: "non-overlap",
          presenceStart: "2026-09-05T02:00:00.000Z",
          presenceEnd: "2026-09-05T03:00:00.000Z",
        },
      ]).commonTimeMinutes,
    ).toBe(0);
  });
});
