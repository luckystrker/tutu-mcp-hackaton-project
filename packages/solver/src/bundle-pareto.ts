import type { RouteBundle } from "./model.js";

export function dominatesBundle(
  left: RouteBundle,
  right: RouteBundle,
): boolean {
  const noWorse =
    left.estimatedTripCostMinor <= right.estimatedTripCostMinor &&
    left.totalTravelMinutes <= right.totalTravelMinutes &&
    Date.parse(left.presenceStart) <= Date.parse(right.presenceStart) &&
    Date.parse(left.presenceEnd) >= Date.parse(right.presenceEnd);
  const strictlyBetter =
    left.estimatedTripCostMinor < right.estimatedTripCostMinor ||
    left.totalTravelMinutes < right.totalTravelMinutes ||
    Date.parse(left.presenceStart) < Date.parse(right.presenceStart) ||
    Date.parse(left.presenceEnd) > Date.parse(right.presenceEnd);
  return noWorse && strictlyBetter;
}

export function pruneBundles(
  bundles: readonly RouteBundle[],
  limit = 4,
): readonly RouteBundle[] {
  const frontier = bundles
    .filter(
      (candidate, index) =>
        !bundles.some(
          (other, otherIndex) =>
            index !== otherIndex && dominatesBundle(other, candidate),
        ),
    )
    .sort(compareBundles);
  if (frontier.length <= limit) return frontier;
  // The limit bounds group-combination growth; it is not a Pareto filter.
  // Always retain the cheapest bundle and the presence-window extremes so
  // the cap can never drop budget feasibility or the widest windows behind
  // common-time checks. Selection among the remaining frontier points is
  // heuristic and follows cost order.
  const selected = new Set<number>();
  const pins: ReadonlyArray<(bundle: RouteBundle) => number> = [
    ({ estimatedTripCostMinor }) => estimatedTripCostMinor,
    ({ presenceStart }) => Date.parse(presenceStart),
    ({ presenceEnd }) => -Date.parse(presenceEnd),
    ({ presenceStart, presenceEnd }) =>
      -(Date.parse(presenceEnd) - Date.parse(presenceStart)),
  ];
  for (const score of pins) {
    if (selected.size >= limit) break;
    pinExtreme(selected, frontier, score);
  }
  for (let index = 0; selected.size < limit; index++) selected.add(index);
  return frontier.filter((_, index) => selected.has(index));
}

function pinExtreme(
  selected: Set<number>,
  frontier: readonly RouteBundle[],
  score: (bundle: RouteBundle) => number,
): void {
  let best = 0;
  for (let index = 1; index < frontier.length; index++) {
    if (score(frontier[index]!) < score(frontier[best]!)) best = index;
  }
  selected.add(best);
}

function compareBundles(left: RouteBundle, right: RouteBundle): number {
  return (
    left.estimatedTripCostMinor - right.estimatedTripCostMinor ||
    left.totalTravelMinutes - right.totalTravelMinutes ||
    Date.parse(left.presenceStart) - Date.parse(right.presenceStart) ||
    Date.parse(right.presenceEnd) - Date.parse(left.presenceEnd) ||
    left.id.localeCompare(right.id)
  );
}
