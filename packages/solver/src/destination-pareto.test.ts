import { describe, expect, it } from "vitest";
import type { DestinationSolution, GroupSolution } from "./model.js";
import { destinationFrontier } from "./destination-pareto.js";

describe("destination Pareto frontier", () => {
  it("compares city representatives rather than hidden route combinations", () => {
    const cityB = destination("city-b", axes(5, 5, 10, 90));
    const cityA = destination("city-a", axes(4, 6, 9, 91), [
      axes(4, 4, 11, 91),
    ]);

    const result = destinationFrontier([cityA, cityB]);

    expect(result.frontier.map(({ cityId }) => cityId)).toEqual([
      "city-a",
      "city-b",
    ]);
    expect(result.dominated).toEqual([]);
  });
});

function axes(
  totalCostMinor: number,
  totalTravelMinutes: number,
  commonTimeMinutes: number,
  fairness: number,
): GroupSolution {
  return {
    cityId: "placeholder",
    bundles: [],
    burdens: [],
    commonStart: "2026-09-01T00:00:00.000Z",
    commonEnd: "2026-09-02T00:00:00.000Z",
    totalCostMinor,
    totalTravelMinutes,
    commonTimeMinutes,
    components: {
      together: 50,
      cost: 50,
      travel: 50,
      synchronization: 50,
      fairness,
    },
    score: 50,
  };
}

function destination(
  cityId: string,
  representative: GroupSolution,
  hidden: readonly GroupSolution[] = [],
): DestinationSolution {
  return {
    ...representative,
    cityId,
    rank: 0,
    fetchedAt: "2026-09-01T00:00:00.000Z",
    hotels: [],
    hotelRequired: false,
    degraded: false,
    groupFrontier: [representative, ...hidden],
  };
}
