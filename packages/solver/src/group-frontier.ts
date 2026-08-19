import type { GroupSolution } from "./model.js";
import { EPSILON } from "./numeric.js";

export function dominatesGroupSolution(
  left: GroupSolution,
  right: GroupSolution,
): boolean {
  const axes = [
    "together",
    "cost",
    "travel",
    "synchronization",
    "fairness",
  ] as const;
  const noWorse = axes.every(
    (axis) => left.components[axis] + EPSILON >= right.components[axis],
  );
  const strictlyBetter = axes.some(
    (axis) => left.components[axis] > right.components[axis] + EPSILON,
  );
  return noWorse && strictlyBetter;
}

export function pruneGroupSolutions(
  solutions: readonly GroupSolution[],
): readonly GroupSolution[] {
  return solutions.filter(
    (candidate, index) =>
      !solutions.some(
        (other, otherIndex) =>
          index !== otherIndex && dominatesGroupSolution(other, candidate),
      ),
  );
}
