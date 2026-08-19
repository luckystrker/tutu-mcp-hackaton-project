import type { ScoringConfig } from "@rendezvous/contracts";
import {
  buildParticipantBundles,
  type ParticipantBundleSet,
} from "./bundles.js";
import { calculateBurden } from "./burden.js";
import { calculateComponents, scoreComponents } from "./components.js";
import type {
  CandidateTravelFacts,
  GroupSolution,
  ReadySolverParticipant,
  RejectionReasonCode,
  RouteBundle,
} from "./model.js";
import { cartesianProduct, intersectPresence } from "./presence.js";

export type PreparedCandidate = {
  candidate: CandidateTravelFacts;
  bundleSets: ReadonlyMap<string, ParticipantBundleSet>;
  missingParticipantIds: readonly string[];
};

export function prepareCandidate(
  candidate: CandidateTravelFacts,
  participants: readonly ReadySolverParticipant[],
): PreparedCandidate {
  const factsByParticipant = new Map(
    candidate.participants.map((facts) => [facts.participantId, facts]),
  );
  const bundleSets = new Map<string, ParticipantBundleSet>();
  const missingParticipantIds: string[] = [];
  for (const participant of participants) {
    const facts = factsByParticipant.get(participant.id);
    if (!facts) {
      missingParticipantIds.push(participant.id);
      continue;
    }
    bundleSets.set(
      participant.id,
      buildParticipantBundles(
        participant,
        facts,
        candidate,
        participants.length,
      ),
    );
  }
  return { candidate, bundleSets, missingParticipantIds };
}

export function enumerateGroupSolutions(
  participantBundles: readonly (readonly RouteBundle[])[],
  participants: readonly ReadySolverParticipant[],
  scoring: ScoringConfig,
  minimumTogetherMinutes: number,
): readonly GroupSolution[] {
  return cartesianProduct(participantBundles)
    .map((bundles) => createGroupSolution(bundles, participants, scoring))
    .filter(
      ({ commonTimeMinutes }) => commonTimeMinutes >= minimumTogetherMinutes,
    );
}

export function createGroupSolution(
  bundles: readonly RouteBundle[],
  participants: readonly ReadySolverParticipant[],
  scoring: ScoringConfig,
): GroupSolution {
  if (bundles.length !== participants.length)
    throw new TypeError("Every participant must have one bundle");
  const participantById = new Map(
    participants.map((participant) => [participant.id, participant]),
  );
  const burdens = bundles.map((bundle) => {
    const participant = participantById.get(bundle.participantId);
    if (!participant)
      throw new TypeError(
        `Unknown participant in bundle: ${bundle.participantId}`,
      );
    return calculateBurden(bundle, participant);
  });
  const presence = intersectPresence(bundles);
  const components = calculateComponents({
    bundles,
    burdens,
    commonTimeMinutes: presence.commonTimeMinutes,
  });
  return {
    cityId: bundles[0]!.cityId,
    bundles,
    burdens,
    ...presence,
    totalCostMinor: bundles.reduce(
      (sum, bundle) => sum + bundle.estimatedTripCostMinor,
      0,
    ),
    totalTravelMinutes: bundles.reduce(
      (sum, bundle) => sum + bundle.totalTravelMinutes,
      0,
    ),
    components,
    score: scoreComponents(components, scoring),
  };
}

export function rejectionFacts(
  prepared: PreparedCandidate,
  participants: readonly ReadySolverParticipant[],
  maxCommonTimeMinutes: number,
  minimumTogetherMinutes: number,
): {
  reasons: readonly RejectionReasonCode[];
  affectedParticipantIds: readonly string[];
} {
  const reasons = new Set<RejectionReasonCode>();
  const affected = new Set<string>(prepared.missingParticipantIds);
  if (prepared.missingParticipantIds.length > 0)
    reasons.add("NO_PARTICIPANT_FACTS");
  for (const participant of participants) {
    const set = prepared.bundleSets.get(participant.id);
    if (!set || set.feasible.length > 0) continue;
    affected.add(participant.id);
    for (const reason of set.reasons) reasons.add(reason);
  }
  if (
    prepared.missingParticipantIds.length === 0 &&
    participants.every(
      (participant) =>
        (prepared.bundleSets.get(participant.id)?.feasible.length ?? 0) > 0,
    ) &&
    maxCommonTimeMinutes < minimumTogetherMinutes
  ) {
    reasons.add("MIN_TOGETHER_TIME");
  }
  return {
    reasons: [...reasons].sort(),
    affectedParticipantIds: [...affected].sort(),
  };
}
