import fc from "fast-check";
import { describe, expect, it } from "vitest";
import {
  calculateComponents,
  normalizeWeights,
  scoreComponents,
} from "./components.js";
import type { ParticipantBurden, RouteBundle } from "./model.js";
import { SolverError } from "./numeric.js";
import { presetToWeights, sliderToWeights } from "./presets.js";

const bundles = [bundle("p1"), bundle("p2")];

describe("absolute scoring anchors", () => {
  it("matches the versioned golden component values", () => {
    const burdens: ParticipantBurden[] = [
      burden("p1", 0.2, 0.1),
      burden("p2", 0.2, 0.1),
    ];
    const components = calculateComponents({
      bundles,
      burdens,
      commonTimeMinutes: 1440,
    });
    expect(components).toEqual({
      together: 50,
      cost: 80,
      travel: 93,
      synchronization: 100,
      fairness: 100,
    });
    expect(
      scoreComponents(components, presetToWeights("balanced")),
    ).toBeCloseTo(76.1, 8);
  });

  it("keeps meaningful absolute scores for one feasible destination", () => {
    const components = calculateComponents({
      bundles,
      burdens: [burden("p1", 0.4, 0.5), burden("p2", 0.4, 0.5)],
      commonTimeMinutes: 360,
    });
    expect(components).toMatchObject({ together: 12.5, cost: 60, travel: 65 });
    expect(
      Object.values(components).every((score) => score >= 0 && score <= 100),
    ).toBe(true);
  });

  it("does not let an equally miserable option win from fairness alone", () => {
    const equallyPoor = calculateComponents({
      bundles,
      burdens: [burden("p1", 1, 1), burden("p2", 1, 1)],
      commonTimeMinutes: 600,
    });
    const usefulButUneven = calculateComponents({
      bundles,
      burdens: [burden("p1", 0.2, 0.2), burden("p2", 0.6, 0.2)],
      commonTimeMinutes: 600,
    });
    expect(equallyPoor.fairness).toBe(100);
    expect(
      scoreComponents(usefulButUneven, presetToWeights("balanced")),
    ).toBeGreaterThan(
      scoreComponents(equallyPoor, presetToWeights("balanced")),
    );
  });

  it("maps presets and slider interpolation deterministically", () => {
    expect(presetToWeights("balanced")).toEqual({
      together: 0.35,
      cost: 0.25,
      travel: 0.2,
      synchronization: 0.1,
      fairness: 0.1,
    });
    expect(sliderToWeights(0.5)).toEqual({
      together: 0.25,
      cost: 0.375,
      travel: 0.175,
      synchronization: 0.1,
      fairness: 0.1,
    });
  });

  it("rejects malformed weights and slider positions with SolverError", () => {
    const zero = {
      together: 0,
      cost: 0,
      travel: 0,
      synchronization: 0,
      fairness: 0,
    };
    expect(() => normalizeWeights(zero)).toThrow(SolverError);
    expect(() => normalizeWeights({ ...zero, together: -1, cost: 1 })).toThrow(
      SolverError,
    );
    expect(() =>
      normalizeWeights({ ...zero, together: Number.NaN, cost: 1 }),
    ).toThrow(SolverError);
    expect(() => sliderToWeights(-0.5)).toThrow(SolverError);
    expect(() => sliderToWeights(4)).toThrow(SolverError);
  });

  it("always produces a score in the component range", () => {
    fc.assert(
      fc.property(
        fc.record({
          together: fc.double({ min: 0, max: 100, noNaN: true }),
          cost: fc.double({ min: 0, max: 100, noNaN: true }),
          travel: fc.double({ min: 0, max: 100, noNaN: true }),
          synchronization: fc.double({ min: 0, max: 100, noNaN: true }),
          fairness: fc.double({ min: 0, max: 100, noNaN: true }),
        }),
        fc
          .record({
            together: fc.nat(100),
            cost: fc.nat(100),
            travel: fc.nat(100),
            synchronization: fc.nat(100),
            fairness: fc.nat(100),
          })
          .filter((weights) =>
            Object.values(weights).some((weight) => weight > 0),
          ),
        (components, weights) => {
          const score = scoreComponents(components, normalizeWeights(weights));
          return score >= 0 && score <= 100;
        },
      ),
    );
  });
});

function burden(
  participantId: string,
  budgetBurden: number,
  timeBurden: number,
): ParticipantBurden {
  return {
    participantId,
    budgetBurden,
    timeBurden,
    softPenalty: 0,
    individualBurden: 0.45 * budgetBurden + 0.4 * timeBurden,
  };
}

function bundle(participantId: string): RouteBundle {
  return {
    id: participantId,
    participantId,
    cityId: "city",
    outbound: {} as RouteBundle["outbound"],
    returning: {} as RouteBundle["returning"],
    transportCostMinor: 100,
    hotelShareMinor: 0,
    estimatedTripCostMinor: 100,
    totalTravelMinutes: 60,
    presenceStart: "2026-09-04T12:00:00.000Z",
    presenceEnd: "2026-09-05T12:00:00.000Z",
    penalties: {
      nightTravel: 0,
      transfers: 0,
      arrivalWindow: 0,
      maxTravelHours: 0,
    },
    requiredRelaxations: {
      budgetMinor: 0,
      departureMinutes: 0,
      returnMinutes: 0,
      forbiddenModes: [],
    },
  };
}
