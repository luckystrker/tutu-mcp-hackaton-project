import type {
  ConstraintRelaxation,
  ReadySolverParticipant,
  RouteBundle,
} from "./model.js";
import { fromMinorUnits } from "./numeric.js";
import { cartesianProduct, intersectPresence } from "./presence.js";
import type { PreparedCandidate } from "./solver-core.js";

type ParticipantRelaxationType =
  "budget" | "departure" | "return" | "transport";

export function calculateRelaxations(
  preparedCandidates: readonly PreparedCandidate[],
  participants: readonly ReadySolverParticipant[],
  minimumTogetherMinutes: number,
): readonly ConstraintRelaxation[] {
  const relaxations: ConstraintRelaxation[] = [];
  for (const prepared of preparedCandidates) {
    if (prepared.missingParticipantIds.length > 0) continue;
    relaxations.push(
      ...participantRelaxations(prepared, participants, minimumTogetherMinutes),
    );
    const feasibleGroups = cartesianProduct(
      participants.map(
        (participant) =>
          prepared.bundleSets.get(participant.id)?.feasible ?? [],
      ),
    );
    if (feasibleGroups.length > 0) {
      const maxCommon = Math.max(
        ...feasibleGroups.map(
          (bundles) => intersectPresence(bundles).commonTimeMinutes,
        ),
      );
      if (maxCommon > 0 && maxCommon < minimumTogetherMinutes) {
        relaxations.push({
          type: "minTogetherTime",
          participantId: null,
          delta: minimumTogetherMinutes - maxCommon,
          unlockedCities: [prepared.candidate.cityId],
        });
      }
    }
  }
  return groupRelaxations(relaxations);
}

function participantRelaxations(
  prepared: PreparedCandidate,
  participants: readonly ReadySolverParticipant[],
  minimumTogetherMinutes: number,
): readonly ConstraintRelaxation[] {
  const result: ConstraintRelaxation[] = [];
  for (const participant of participants) {
    const set = prepared.bundleSets.get(participant.id);
    if (!set) continue;
    for (const type of [
      "budget",
      "departure",
      "return",
      "transport",
    ] as const) {
      const candidates = set.all.filter((bundle) => requiresOnly(bundle, type));
      const modes =
        type === "transport" ? uniqueRequiredModes(candidates) : [undefined];
      for (const mode of modes) {
        const eligible = mode
          ? candidates.filter(
              (bundle) =>
                bundle.requiredRelaxations.forbiddenModes.length === 1 &&
                bundle.requiredRelaxations.forbiddenModes[0] === mode,
            )
          : candidates;
        const groups = cartesianProduct(
          participants.map((current) =>
            current.id === participant.id
              ? eligible
              : (prepared.bundleSets.get(current.id)?.feasible ?? []),
          ),
        ).filter(
          (bundles) =>
            intersectPresence(bundles).commonTimeMinutes >=
            minimumTogetherMinutes,
        );
        if (groups.length === 0) continue;
        const targetBundles = groups.map((bundles) =>
          bundles.find((bundle) => bundle.participantId === participant.id)!,
        );
        const delta = minimumDelta(type, targetBundles);
        result.push({
          type,
          participantId: participant.id,
          ...(delta === undefined ? {} : { delta }),
          ...(mode === undefined ? {} : { mode }),
          unlockedCities: [prepared.candidate.cityId],
        });
      }
    }
  }
  return result;
}

function requiresOnly(
  bundle: RouteBundle,
  type: ParticipantRelaxationType,
): boolean {
  const required = bundle.requiredRelaxations;
  const hasTarget =
    type === "budget"
      ? required.budgetMinor > 0
      : type === "departure"
        ? required.departureMinutes > 0
        : type === "return"
          ? required.returnMinutes > 0
          : required.forbiddenModes.length > 0;
  return (
    hasTarget &&
    (type === "budget" || required.budgetMinor === 0) &&
    (type === "departure" || required.departureMinutes === 0) &&
    (type === "return" || required.returnMinutes === 0) &&
    (type === "transport" || required.forbiddenModes.length === 0)
  );
}

function minimumDelta(
  type: ParticipantRelaxationType,
  bundles: readonly RouteBundle[],
): number | undefined {
  if (type === "transport") return undefined;
  const values = bundles.map(({ requiredRelaxations }) =>
    type === "budget"
      ? fromMinorUnits(requiredRelaxations.budgetMinor)
      : type === "departure"
        ? requiredRelaxations.departureMinutes
        : requiredRelaxations.returnMinutes,
  );
  return Math.min(...values);
}

function uniqueRequiredModes(bundles: readonly RouteBundle[]) {
  return [
    ...new Set(
      bundles.flatMap(
        ({ requiredRelaxations }) => requiredRelaxations.forbiddenModes,
      ),
    ),
  ].sort();
}

function groupRelaxations(
  relaxations: readonly ConstraintRelaxation[],
): readonly ConstraintRelaxation[] {
  const grouped = new Map<string, ConstraintRelaxation>();
  for (const relaxation of relaxations) {
    const key = `${relaxation.type}|${relaxation.participantId ?? "trip"}|${relaxation.delta ?? ""}|${relaxation.mode ?? ""}`;
    const existing = grouped.get(key);
    grouped.set(key, {
      ...relaxation,
      unlockedCities: [
        ...new Set([
          ...(existing?.unlockedCities ?? []),
          ...relaxation.unlockedCities,
        ]),
      ].sort(),
    });
  }
  return [...grouped.values()].sort(
    (left, right) =>
      normalizedRelaxationCost(left) - normalizedRelaxationCost(right) ||
      (left.delta ?? 0) - (right.delta ?? 0) ||
      left.type.localeCompare(right.type) ||
      (left.participantId ?? "").localeCompare(right.participantId ?? ""),
  );
}

function normalizedRelaxationCost(relaxation: ConstraintRelaxation): number {
  if (relaxation.type === "transport") return 1;
  if (relaxation.type === "budget") return (relaxation.delta ?? 0) / 10_000;
  return (relaxation.delta ?? 0) / (48 * 60);
}
