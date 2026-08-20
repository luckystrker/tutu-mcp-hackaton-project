import type { ComponentScores, DestinationSolution } from "./model.js";
import { EPSILON } from "./numeric.js";

type DestinationAxisValues = {
  totalCostMinor: number;
  totalTravelMinutes: number;
  commonTimeMinutes: number;
  components: Pick<ComponentScores, "fairness">;
};

export function dominatesDestination(
  left: DestinationSolution,
  right: DestinationSolution,
): boolean {
  return dominatesOnDestinationAxes(left, right);
}

export function destinationFrontier(
  solutions: readonly DestinationSolution[],
): {
  frontier: readonly DestinationSolution[];
  dominated: readonly DestinationSolution[];
} {
  const frontier: DestinationSolution[] = [];
  const dominated: DestinationSolution[] = [];
  for (const [index, candidate] of solutions.entries()) {
    // Pareto is defined for the city representatives selected by the solver,
    // not for arbitrary route combinations hidden inside each city.
    const isDominated = solutions.some(
      (other, otherIndex) =>
        index !== otherIndex && dominatesOnDestinationAxes(other, candidate),
    );
    (isDominated ? dominated : frontier).push(candidate);
  }
  return { frontier, dominated };
}

function dominatesOnDestinationAxes(
  left: DestinationAxisValues,
  right: DestinationAxisValues,
): boolean {
  const noWorse =
    left.totalCostMinor <= right.totalCostMinor &&
    left.totalTravelMinutes <= right.totalTravelMinutes &&
    left.commonTimeMinutes >= right.commonTimeMinutes &&
    left.components.fairness + EPSILON >= right.components.fairness;
  const strictlyBetter =
    left.totalCostMinor < right.totalCostMinor ||
    left.totalTravelMinutes < right.totalTravelMinutes ||
    left.commonTimeMinutes > right.commonTimeMinutes ||
    left.components.fairness > right.components.fairness + EPSILON;
  return noWorse && strictlyBetter;
}
