import type { City, DestinationTag } from "@rendezvous/contracts";
import type { ReadyParticipant } from "../participant/entities.js";
import { haversineDistanceKm } from "./haversine.js";
import { normalizeInverse } from "./normalize.js";

export const CANDIDATE_ALGORITHM_VERSION = "geo-v1.1.0";

export type CandidateWeights = {
  maxDistance: number;
  meanDistance: number;
  hub: number;
};

export const DEFAULT_CANDIDATE_WEIGHTS: CandidateWeights = {
  maxDistance: 0.55,
  meanDistance: 0.3,
  hub: 0.15,
};
export const EXPANDED_CANDIDATE_WEIGHTS: CandidateWeights = {
  maxDistance: 0.45,
  meanDistance: 0.25,
  hub: 0.3,
};

export type CandidateReason = {
  algorithmVersion: string;
  cityId: string;
  distancesKm: Readonly<Record<string, number>>;
  maxDistanceKm: number;
  meanDistanceKm: number;
  maxDistanceScore: number;
  meanDistanceScore: number;
  hubScore: number;
  geoScore: number;
  tagMatchRatio: number;
  tagBoost: number;
  rankingScore: number;
};

export type GenerateCandidatesInput = {
  participants: readonly ReadyParticipant[];
  allowInternational: boolean;
  limit?: number;
  weights?: CandidateWeights;
};

export interface CandidateGenerator {
  readonly algorithmVersion: string;
  generate(input: GenerateCandidatesInput): readonly CandidateReason[];
}

export function createCandidateGenerator(
  cityCatalog: readonly City[],
): CandidateGenerator {
  const catalog = [...cityCatalog];
  const citiesById = new Map(catalog.map((city) => [city.id, city]));

  return {
    algorithmVersion: CANDIDATE_ALGORITHM_VERSION,
    generate({
      participants,
      allowInternational,
      limit = 8,
      weights = DEFAULT_CANDIDATE_WEIGHTS,
    }) {
      if (participants.length < 2 || participants.length > 4)
        throw new RangeError(
          "Candidate generation requires 2 to 4 ready participants",
        );
      if (!Number.isInteger(limit) || limit < 1 || limit > 16)
        throw new RangeError("Candidate limit must be an integer from 1 to 16");
      const normalizedWeights = normalizeWeights(weights);
      const origins = participants.map((participant) => {
        const city = citiesById.get(participant.originCityId);
        if (!city)
          throw new RangeError(
            `Unknown origin city: ${participant.originCityId}`,
          );
        return city;
      });
      const pool = catalog.filter(
        (city) => allowInternational || city.country === "RU",
      );
      if (pool.length === 0) return [];

      const raw = pool.map((city) => {
        const distanceValues = origins.map((origin) =>
          haversineDistanceKm(origin, city),
        );
        return {
          city,
          distanceValues,
          maxDistanceKm: Math.max(...distanceValues),
          meanDistanceKm:
            distanceValues.reduce((sum, value) => sum + value, 0) /
            distanceValues.length,
        };
      });
      const maxScores = normalizeInverse(
        raw.map(({ maxDistanceKm }) => maxDistanceKm),
      );
      const meanScores = normalizeInverse(
        raw.map(({ meanDistanceKm }) => meanDistanceKm),
      );
      const tagsAreActive = participants.some(
        ({ softPreferences }) =>
          (softPreferences.destinationTags?.length ?? 0) > 0,
      );

      return raw
        .map(
          (
            { city, distanceValues, maxDistanceKm, meanDistanceKm },
            index,
          ): CandidateReason => {
            const maxDistanceScore = maxScores[index]!;
            const meanDistanceScore = meanScores[index]!;
            const tagMatchRatio = tagsAreActive
              ? matchedParticipantRatio(city.tags, participants)
              : 0;
            const tagBoost = 10 * tagMatchRatio;
            const geoScore =
              normalizedWeights.maxDistance * maxDistanceScore +
              normalizedWeights.meanDistance * meanDistanceScore +
              normalizedWeights.hub * city.hubScore;
            const roundedGeoScore = round(geoScore, 6);
            const roundedTagBoost = round(tagBoost, 6);
            return {
              algorithmVersion: CANDIDATE_ALGORITHM_VERSION,
              cityId: city.id,
              distancesKm: Object.fromEntries(
                participants.map((participant, participantIndex) => [
                  participant.id,
                  round(distanceValues[participantIndex]!, 3),
                ]),
              ),
              maxDistanceKm: round(maxDistanceKm, 3),
              meanDistanceKm: round(meanDistanceKm, 3),
              maxDistanceScore: round(maxDistanceScore, 6),
              meanDistanceScore: round(meanDistanceScore, 6),
              hubScore: city.hubScore,
              geoScore: roundedGeoScore,
              tagMatchRatio: round(tagMatchRatio, 6),
              tagBoost: roundedTagBoost,
              rankingScore: round(roundedGeoScore + roundedTagBoost, 6),
            };
          },
        )
        .sort(
          (left, right) =>
            right.rankingScore - left.rankingScore ||
            right.hubScore - left.hubScore ||
            left.cityId.localeCompare(right.cityId),
        )
        .slice(0, limit);
    },
  };
}

function matchedParticipantRatio(
  cityTags: readonly DestinationTag[],
  participants: readonly ReadyParticipant[],
): number {
  const tags = new Set(cityTags);
  const matches = participants.filter(({ softPreferences }) =>
    softPreferences.destinationTags?.some((tag) => tags.has(tag)),
  ).length;
  return matches / participants.length;
}

function normalizeWeights(weights: CandidateWeights): CandidateWeights {
  const values = [weights.maxDistance, weights.meanDistance, weights.hub];
  if (values.some((value) => !Number.isFinite(value) || value < 0))
    throw new RangeError("Candidate weights must be finite and non-negative");
  const total = values.reduce((sum, value) => sum + value, 0);
  if (total === 0)
    throw new RangeError("At least one candidate weight must be positive");
  return {
    maxDistance: weights.maxDistance / total,
    meanDistance: weights.meanDistance / total,
    hub: weights.hub / total,
  };
}

function round(value: number, fractionDigits: number): number {
  const scale = 10 ** fractionDigits;
  return Math.round((value + Number.EPSILON) * scale) / scale;
}
