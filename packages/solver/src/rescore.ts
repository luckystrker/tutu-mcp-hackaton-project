import type { ScoringConfig } from "@rendezvous/contracts";
import { calculateBurden } from "./burden.js";
import {
  calculateComponents,
  compareGroupSolutions,
  normalizeWeights,
  scoreComponents,
} from "./components.js";
import { destinationFrontier } from "./destination-pareto.js";
import type {
  GroupSolution,
  ReadySolverParticipant,
  SolverOutput,
} from "./model.js";
import { SolverError } from "./numeric.js";
import { rankDestinations } from "./rank.js";
import { intersectPresence } from "./presence.js";

export function rescore(
  previous: SolverOutput,
  participants: readonly ReadySolverParticipant[],
  scoring: ScoringConfig,
): SolverOutput {
  const normalizedScoring = normalizeWeights(scoring);
  const rescoredFeasible = previous.allFeasible.map((destination) => {
    const frontier = destination.groupFrontier.map((solution) =>
      rescoreGroup(solution, participants, normalizedScoring),
    );
    const best = [...frontier].sort(compareGroupSolutions)[0]!;
    return { ...destination, ...best, rank: 0, groupFrontier: frontier };
  });
  const { frontier, dominated } = destinationFrontier(rescoredFeasible);
  const hardRejected = previous.rejected.filter(
    ({ reasons }) => !reasons.includes("DOMINATED"),
  );
  return {
    ...previous,
    scoring: normalizedScoring,
    ranked: rankDestinations(frontier),
    allFeasible: rescoredFeasible,
    rejected: [
      ...hardRejected,
      ...dominated.map((destination) => ({
        cityId: destination.cityId,
        reasons: ["DOMINATED" as const],
        affectedParticipantIds: [],
        maxCommonTimeMinutes: destination.commonTimeMinutes,
      })),
    ].sort((left, right) => left.cityId.localeCompare(right.cityId)),
  };
}

function rescoreGroup(
  solution: GroupSolution,
  participants: readonly ReadySolverParticipant[],
  scoring: ScoringConfig,
): GroupSolution {
  const byId = new Map(
    participants.map((participant) => [participant.id, participant]),
  );
  const burdens = solution.bundles.map((bundle) => {
    const participant = byId.get(bundle.participantId);
    if (!participant)
      throw new SolverError(
        "INVALID_INPUT",
        `Missing participant for rescore: ${bundle.participantId}`,
      );
    return calculateBurden(bundle, participant);
  });
  const presence = intersectPresence(solution.bundles);
  const components = calculateComponents({
    bundles: solution.bundles,
    burdens,
    commonTimeMinutes: presence.commonTimeMinutes,
  });
  return {
    ...solution,
    ...presence,
    burdens,
    components,
    score: scoreComponents(components, scoring),
  };
}
