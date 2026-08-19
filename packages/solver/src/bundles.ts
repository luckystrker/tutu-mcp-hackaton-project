import type { RouteOption, TransportMode } from "@rendezvous/contracts";
import { pruneBundles } from "./bundle-pareto.js";
import type {
  CandidateTravelFacts,
  ParticipantTravelFacts,
  ReadySolverParticipant,
  RejectionReasonCode,
  RouteBundle,
} from "./model.js";
import { requiredMinutesBetween, toMinorUnits } from "./numeric.js";
import { calculatePenaltyBreakdown } from "./soft-penalty.js";

export type ParticipantBundleSet = {
  feasible: readonly RouteBundle[];
  all: readonly RouteBundle[];
  reasons: readonly RejectionReasonCode[];
};

export function hotelShareMinor(
  candidate: CandidateTravelFacts,
  participantCount: number,
  participantId: string,
): number {
  const prices = (candidate.hotels ?? []).flatMap((hotel) =>
    hotel.totalPrice ? [toMinorUnits(hotel.totalPrice.amount)] : [],
  );
  if (prices.length === 0) return 0;
  const total = Math.min(...prices);
  const participantIds = [...candidate.participants]
    .map(({ participantId: id }) => id)
    .sort()
    .slice(0, participantCount);
  const index = participantIds.indexOf(participantId);
  if (index < 0 || participantIds.length !== participantCount)
    throw new TypeError("Hotel allocation requires every participant");
  const quotient = Math.floor(total / participantCount);
  return quotient + (index < total % participantCount ? 1 : 0);
}

export function buildParticipantBundles(
  participant: ReadySolverParticipant,
  facts: ParticipantTravelFacts,
  candidate: CandidateTravelFacts,
  participantCount: number,
): ParticipantBundleSet {
  const all = facts.outbound.flatMap((outbound) =>
    facts.returns.flatMap((returning) => {
      const bundle = createBundle(
        participant,
        facts,
        candidate,
        outbound,
        returning,
        participantCount,
      );
      return bundle ? [bundle] : [];
    }),
  );
  const feasible = pruneBundles(all.filter(isHardFeasible));
  return { feasible, all, reasons: rejectionReasons(all) };
}

export function isHardFeasible(bundle: RouteBundle): boolean {
  return (
    bundle.requiredRelaxations.budgetMinor === 0 &&
    bundle.requiredRelaxations.departureMinutes === 0 &&
    bundle.requiredRelaxations.returnMinutes === 0 &&
    bundle.requiredRelaxations.forbiddenModes.length === 0
  );
}

function createBundle(
  participant: ReadySolverParticipant,
  facts: ParticipantTravelFacts,
  candidate: CandidateTravelFacts,
  outbound: RouteOption,
  returning: RouteOption,
  participantCount: number,
): RouteBundle | null {
  if (!matchesDirection(outbound, participant.originCityId, candidate.cityId))
    return null;
  if (!matchesDirection(returning, candidate.cityId, participant.originCityId))
    return null;
  if (Date.parse(returning.departureAt) < Date.parse(outbound.arrivalAt))
    return null;
  const transportCostMinor =
    toMinorUnits(outbound.price.amount) + toMinorUnits(returning.price.amount);
  const share = hotelShareMinor(candidate, participantCount, participant.id);
  const estimatedTripCostMinor = transportCostMinor + share;
  const departureMinutes = requiredMinutesBetween(
    outbound.departureAt,
    participant.availableFrom,
  );
  const returnMinutes = requiredMinutesBetween(
    participant.mustReturnBy,
    returning.arrivalAt,
  );
  const forbiddenModes = uniqueModes(
    [outbound.mode, returning.mode].filter((mode) =>
      participant.forbiddenModes.includes(mode),
    ),
  );
  const maxBudgetMinor = toMinorUnits(participant.maxBudget.amount);
  return {
    id: `${outbound.id}|${returning.id}`,
    participantId: participant.id,
    cityId: candidate.cityId,
    outbound,
    returning,
    transportCostMinor,
    hotelShareMinor: share,
    estimatedTripCostMinor,
    totalTravelMinutes: outbound.durationMinutes + returning.durationMinutes,
    presenceStart: outbound.arrivalAt,
    presenceEnd: returning.departureAt,
    penalties: calculatePenaltyBreakdown(
      outbound,
      returning,
      facts.originTimeZone,
      candidate.destinationTimeZone,
      participant.softPreferences.maxTravelHoursPreferred,
    ),
    requiredRelaxations: {
      budgetMinor: Math.max(0, estimatedTripCostMinor - maxBudgetMinor),
      departureMinutes,
      returnMinutes,
      forbiddenModes,
    },
  };
}

function rejectionReasons(
  all: readonly RouteBundle[],
): readonly RejectionReasonCode[] {
  if (all.length === 0) return ["NO_ROUTE_PAIR"];
  // Report every constraint violated by at least one option: relaxing the
  // listed constraints is necessary to unlock any bundle, and secondary
  // blockers stay visible when one constraint blocks every option.
  const reasons = new Set<RejectionReasonCode>();
  for (const bundle of all) {
    if (bundle.requiredRelaxations.departureMinutes > 0)
      reasons.add("DEPARTURE_WINDOW");
    if (bundle.requiredRelaxations.returnMinutes > 0)
      reasons.add("RETURN_WINDOW");
    if (bundle.requiredRelaxations.forbiddenModes.length > 0)
      reasons.add("FORBIDDEN_MODE");
    if (bundle.requiredRelaxations.budgetMinor > 0) reasons.add("BUDGET");
  }
  return [...reasons].sort();
}

function matchesDirection(
  route: RouteOption,
  origin: string,
  destination: string,
): boolean {
  return (
    route.originCityId === origin && route.destinationCityId === destination
  );
}

function uniqueModes(
  modes: readonly TransportMode[],
): readonly TransportMode[] {
  return [...new Set(modes)].sort();
}
