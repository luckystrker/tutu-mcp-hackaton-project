import type { SoftPreferences } from "@rendezvous/contracts";
import type {
  ParticipantBurden,
  ReadySolverParticipant,
  RouteBundle,
} from "./model.js";
import { clamp, minutesBetween, SolverError, toMinorUnits } from "./numeric.js";
import { aggregateSoftPenalty } from "./soft-penalty.js";

export function calculateBurden(
  bundle: RouteBundle,
  participant: ReadySolverParticipant,
  preferences: SoftPreferences = participant.softPreferences,
): ParticipantBurden {
  const budget = toMinorUnits(participant.maxBudget.amount);
  const availableWindowMinutes = minutesBetween(
    participant.availableFrom,
    participant.mustReturnBy,
  );
  if (budget <= 0 || availableWindowMinutes <= 0)
    throw new SolverError(
      "INVALID_INPUT",
      "Participant budget and availability window must be positive",
    );
  const budgetBurden = clamp(bundle.estimatedTripCostMinor / budget);
  const timeBurden = clamp(bundle.totalTravelMinutes / availableWindowMinutes);
  const softPenalty = aggregateSoftPenalty(
    bundle.penalties,
    preferences,
    bundle.totalTravelMinutes,
  );
  return {
    participantId: participant.id,
    budgetBurden,
    timeBurden,
    softPenalty,
    individualBurden:
      0.45 * budgetBurden + 0.4 * timeBurden + 0.15 * softPenalty,
  };
}
