import {
  compareGroupSolutions,
  normalizeWeights,
  SCORING_ALGORITHM_VERSION,
} from "./components.js";
import { calculateRelaxations } from "./counterfactual.js";
import { destinationFrontier } from "./destination-pareto.js";
import type {
  DestinationSolution,
  RejectedDestination,
  SolverInput,
  SolverOutput,
} from "./model.js";
import { SolverError } from "./numeric.js";
import {
  enumerateGroupSolutions,
  prepareCandidate,
  rejectionFacts,
} from "./solver-core.js";

export function solve(input: SolverInput): SolverOutput {
  validateInput(input);
  const participants = [...input.trip.participants].sort((left, right) =>
    left.id.localeCompare(right.id),
  );
  const scoringVersion =
    input.scoringAlgorithmVersion ?? SCORING_ALGORITHM_VERSION;
  const scoring = normalizeWeights(input.scoring);
  if (scoringVersion !== SCORING_ALGORITHM_VERSION) {
    throw new SolverError(
      "UNSUPPORTED_VERSION",
      `Unsupported scoring algorithm: ${scoringVersion}`,
    );
  }
  const prepared = input.candidates.map((candidate) =>
    prepareCandidate(candidate, participants),
  );
  const feasible: DestinationSolution[] = [];
  const rejected: RejectedDestination[] = [];

  for (const candidate of prepared) {
    if (candidate.candidate.hotels?.length === 0) {
      rejected.push({
        cityId: candidate.candidate.cityId,
        reasons: ["NO_HOTEL_AVAILABILITY"],
        affectedParticipantIds: [],
        maxCommonTimeMinutes: 0,
      });
      continue;
    }
    const bundleGroups = participants.map(
      (participant) => candidate.bundleSets.get(participant.id)?.feasible ?? [],
    );
    const allGroups = enumerateGroupSolutions(
      bundleGroups,
      participants,
      scoring,
      0,
    );
    const eligibleGroups = allGroups.filter(
      ({ commonTimeMinutes }) =>
        commonTimeMinutes >= input.trip.trip.minTogetherMinutes,
    );
    if (eligibleGroups.length === 0) {
      const maxCommonTimeMinutes =
        allGroups.length === 0
          ? 0
          : Math.max(
              ...allGroups.map(({ commonTimeMinutes }) => commonTimeMinutes),
            );
      const facts = rejectionFacts(
        candidate,
        participants,
        maxCommonTimeMinutes,
        input.trip.trip.minTogetherMinutes,
      );
      rejected.push({
        cityId: candidate.candidate.cityId,
        ...facts,
        maxCommonTimeMinutes,
      });
      continue;
    }
    // At most 4^4 combinations. Keeping the full feasible set guarantees that
    // local soft-preference rescore cannot revive a combination pruned under
    // the previous preference vector.
    const groupFrontier = eligibleGroups;
    const best = [...groupFrontier].sort(compareGroupSolutions)[0]!;
    feasible.push({
      ...best,
      rank: 0,
      fetchedAt: candidate.candidate.fetchedAt,
      hotels: candidate.candidate.hotels ?? [],
      degraded:
        candidate.candidate.hotels === undefined ||
        candidate.candidate.hotels.every((hotel) => hotel.totalPrice === null),
      groupFrontier,
    });
  }

  const { frontier, dominated } = destinationFrontier(feasible);
  for (const destination of dominated) {
    rejected.push({
      cityId: destination.cityId,
      reasons: ["DOMINATED"],
      affectedParticipantIds: [],
      maxCommonTimeMinutes: destination.commonTimeMinutes,
    });
  }
  const ranked = rankDestinations(frontier);
  return {
    algorithmVersion: input.algorithmVersion,
    scoringAlgorithmVersion: scoringVersion,
    scoring,
    ranked,
    allFeasible: feasible,
    rejected: rejected.sort((left, right) =>
      left.cityId.localeCompare(right.cityId),
    ),
    relaxations: calculateRelaxations(
      prepared.filter(({ candidate }) =>
        rejected.some(
          ({ cityId, reasons }) =>
            cityId === candidate.cityId &&
            !reasons.includes("DOMINATED") &&
            !reasons.includes("NO_HOTEL_AVAILABILITY"),
        ),
      ),
      participants,
      input.trip.trip.minTogetherMinutes,
    ),
  };
}

export function rankDestinations(
  destinations: readonly DestinationSolution[],
): readonly DestinationSolution[] {
  return [...destinations]
    .sort(
      (left, right) =>
        right.score - left.score ||
        right.commonTimeMinutes - left.commonTimeMinutes ||
        left.totalCostMinor - right.totalCostMinor ||
        left.cityId.localeCompare(right.cityId),
    )
    .map((destination, index) => ({ ...destination, rank: index + 1 }));
}

function validateInput(input: SolverInput): void {
  if (!input.algorithmVersion.trim())
    throw new SolverError("INVALID_INPUT", "Algorithm version is required");
  if (
    input.trip.participants.length < 2 ||
    input.trip.participants.length > 4
  ) {
    throw new SolverError(
      "INVALID_INPUT",
      "Solver requires 2 to 4 participants",
    );
  }
  if (
    new Set(input.trip.participants.map(({ id }) => id)).size !==
    input.trip.participants.length
  ) {
    throw new SolverError("INVALID_INPUT", "Participant ids must be unique");
  }
  if (
    new Set(input.candidates.map(({ cityId }) => cityId)).size !==
    input.candidates.length
  ) {
    throw new SolverError("INVALID_INPUT", "Candidate city ids must be unique");
  }
  const participantIds = new Set(input.trip.participants.map(({ id }) => id));
  for (const candidate of input.candidates) {
    const factIds = candidate.participants.map(
      ({ participantId }) => participantId,
    );
    if (
      new Set(factIds).size !== factIds.length ||
      factIds.some((participantId) => !participantIds.has(participantId))
    ) {
      throw new SolverError(
        "INVALID_INPUT",
        `Candidate ${candidate.cityId} has duplicate or unknown participant facts`,
      );
    }
  }
}
