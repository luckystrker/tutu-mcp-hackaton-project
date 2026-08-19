import type { ReadySolverParticipant, RouteBundle } from "./model.js";
import { isHardFeasible } from "./bundles.js";

export type HardConstraint = "budget" | "departure" | "return" | "transport";

export function violatedConstraints(
  bundle: RouteBundle,
): readonly HardConstraint[] {
  const violations: HardConstraint[] = [];
  if (bundle.requiredRelaxations.budgetMinor > 0) violations.push("budget");
  if (bundle.requiredRelaxations.departureMinutes > 0)
    violations.push("departure");
  if (bundle.requiredRelaxations.returnMinutes > 0) violations.push("return");
  if (bundle.requiredRelaxations.forbiddenModes.length > 0)
    violations.push("transport");
  return violations;
}

export function participantCanUseBundle(
  bundle: RouteBundle,
  participant: ReadySolverParticipant,
): boolean {
  return bundle.participantId === participant.id && isHardFeasible(bundle);
}
