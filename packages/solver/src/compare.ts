import type { ComparisonFacts, DestinationSolution } from "./model.js";
import { fromMinorUnits } from "./numeric.js";

export function compareDestinations(
  city: DestinationSolution,
  reference: DestinationSolution,
): ComparisonFacts {
  const referenceBurden = new Map(
    reference.burdens.map((burden) => [
      burden.participantId,
      burden.individualBurden,
    ]),
  );
  const burdenDeltas = city.burdens.map((burden) => ({
    participantId: burden.participantId,
    delta: Math.abs(
      burden.individualBurden -
        (referenceBurden.get(burden.participantId) ?? 0),
    ),
  }));
  const mostAffected = burdenDeltas.sort(
    (left, right) =>
      right.delta - left.delta ||
      left.participantId.localeCompare(right.participantId),
  )[0];
  return {
    cityId: city.cityId,
    comparedWithCityId: reference.cityId,
    travelTimeDifference:
      city.totalTravelMinutes - reference.totalTravelMinutes,
    commonTimeDifference: city.commonTimeMinutes - reference.commonTimeMinutes,
    costDifference: fromMinorUnits(
      city.totalCostMinor - reference.totalCostMinor,
    ),
    scoreDifference: city.score - reference.score,
    mostAffectedParticipant: "private",
    mostAffectedParticipantIdInternal: mostAffected?.participantId ?? null,
  };
}
