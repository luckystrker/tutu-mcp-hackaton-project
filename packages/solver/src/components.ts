import type { ScoringConfig } from "@rendezvous/contracts";
import type {
  ComponentScores,
  GroupSolution,
  ParticipantBurden,
  RouteBundle,
} from "./model.js";
import { clamp, mean, SolverError } from "./numeric.js";

export const SCORING_ALGORITHM_VERSION = "absolute-anchors-v1";

export function calculateComponents(input: {
  bundles: readonly RouteBundle[];
  burdens: readonly ParticipantBurden[];
  commonTimeMinutes: number;
}): ComponentScores {
  const meanBudgetBurden = mean(
    input.burdens.map(({ budgetBurden }) => budgetBurden),
  );
  const meanTimeBurden = mean(
    input.burdens.map(({ timeBurden }) => timeBurden),
  );
  const meanSoftPenalty = mean(
    input.burdens.map(({ softPenalty }) => softPenalty),
  );
  const burdenValues = input.burdens.map(
    ({ individualBurden }) => individualBurden,
  );
  const spread = Math.max(...burdenValues) - Math.min(...burdenValues);
  const arrivals = input.bundles.map(({ presenceStart }) =>
    Date.parse(presenceStart),
  );
  const departures = input.bundles.map(({ presenceEnd }) =>
    Date.parse(presenceEnd),
  );
  const arrivalSpreadHours =
    (Math.max(...arrivals) - Math.min(...arrivals)) / 3_600_000;
  const departureSpreadHours =
    (Math.max(...departures) - Math.min(...departures)) / 3_600_000;
  const synchronizationSpreadHours =
    0.5 * arrivalSpreadHours + 0.5 * departureSpreadHours;
  return {
    together: 100 * clamp(input.commonTimeMinutes / (48 * 60)),
    cost: 100 * clamp(1 - meanBudgetBurden),
    travel: 100 * clamp(1 - (0.7 * meanTimeBurden + 0.3 * meanSoftPenalty)),
    synchronization: 100 * clamp(1 - synchronizationSpreadHours / 8),
    fairness: 100 * clamp(1 - spread),
  };
}

export function scoreComponents(
  components: ComponentScores,
  scoring: ScoringConfig,
): number {
  const weights = normalizeWeights(scoring);
  return (
    weights.together * components.together +
    weights.cost * components.cost +
    weights.travel * components.travel +
    weights.synchronization * components.synchronization +
    weights.fairness * components.fairness
  );
}

export function normalizeWeights(scoring: ScoringConfig): ScoringConfig {
  const entries = Object.entries(scoring) as Array<
    [keyof ScoringConfig, number]
  >;
  if (entries.some(([, value]) => !Number.isFinite(value) || value < 0))
    throw new SolverError(
      "INVALID_INPUT",
      "Scoring weights must be finite and non-negative",
    );
  const total = entries.reduce((sum, [, value]) => sum + value, 0);
  if (total <= 0)
    throw new SolverError(
      "INVALID_INPUT",
      "At least one scoring weight must be positive",
    );
  return Object.fromEntries(
    entries.map(([key, value]) => [key, value / total]),
  ) as ScoringConfig;
}

export function compareGroupSolutions(
  left: GroupSolution,
  right: GroupSolution,
): number {
  return (
    right.score - left.score ||
    right.commonTimeMinutes - left.commonTimeMinutes ||
    left.totalCostMinor - right.totalCostMinor ||
    left.cityId.localeCompare(right.cityId) ||
    left.bundles
      .map(({ id }) => id)
      .join("|")
      .localeCompare(right.bundles.map(({ id }) => id).join("|"))
  );
}
