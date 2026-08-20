import type {
  DestinationResultDto,
  ParticipantGroupDto,
  ParticipantSelfDto,
  PublicCity,
  TripGroupDto,
  TripOrganizerDto,
  TripPublic,
} from "@rendezvous/contracts";
import type { DestinationSolution, SolverOutput } from "@rendezvous/solver";
import { fromMinorUnits } from "@rendezvous/solver";
import type { TripAggregate } from "../repositories/trip-repository.js";

export function projectAggregate(
  aggregate: TripAggregate,
): TripGroupDto | TripOrganizerDto {
  const trip = omitOrganizer(aggregate.trip);
  const me = omitUser(aggregate.actorParticipant);
  const leadingDestination = aggregate.destinations[0];
  const coveredParticipants = new Set(
    leadingDestination?.routes.map(({ participantId }) => participantId) ?? [],
  );
  // A participant can only conflict with a computation outcome. Waiting for
  // people, a running job, or an infrastructure failure says nothing about
  // suitability; only a completed computation that found no feasible option
  // for them is a conflict.
  const awaitingOutcome =
    leadingDestination === undefined &&
    (["COLLECTING", "CREATED"].includes(aggregate.trip.status) ||
      aggregate.trip.computeStatus === "running" ||
      aggregate.trip.computeStatus === "failed");
  const participants: ParticipantGroupDto[] = aggregate.participants.map(
    (participant) => ({
      id: participant.id,
      displayName: participant.displayName,
      ready: participant.ready,
      suitability: !participant.ready
        ? "unknown"
        : awaitingOutcome
          ? "unknown"
          : leadingDestination === undefined
            ? "conflict"
            : coveredParticipants.has(participant.id)
              ? "suitable"
              : "conflict",
    }),
  );
  const group: TripGroupDto = {
    trip,
    participants,
    me,
    destinations: [...aggregate.destinations],
    shortlist: {
      ...aggregate.shortlist,
      cityIds: [...aggregate.shortlist.cityIds],
    },
  };
  return aggregate.isOrganizer
    ? {
        ...group,
        capabilities: {
          canEditSettings: !["FINALIZED", "CANCELLED"].includes(
            aggregate.trip.status,
          ),
          canShortlist: aggregate.trip.status === "LIVE",
          canFinalize: aggregate.trip.status === "SHORTLIST",
          canCancel: !["FINALIZED", "CANCELLED"].includes(
            aggregate.trip.status,
          ),
        },
      }
    : group;
}

export function projectSolverOutput(
  output: SolverOutput,
  cities: ReadonlyMap<string, PublicCity>,
): readonly DestinationResultDto[] {
  return output.ranked
    .slice(0, 3)
    .map((solution) => projectDestination(solution, cities));
}

function projectDestination(
  solution: DestinationSolution,
  cities: ReadonlyMap<string, PublicCity>,
): DestinationResultDto {
  const city = cities.get(solution.cityId);
  if (!city)
    throw new TypeError(`Solver returned unknown city: ${solution.cityId}`);
  return {
    city: { id: city.id, name: city.name, country: city.country },
    rank: solution.rank,
    score: round(solution.score),
    components: {
      together: round(solution.components.together),
      cost: round(solution.components.cost),
      travel: round(solution.components.travel),
      synchronization: round(solution.components.synchronization),
      fairness: round(solution.components.fairness),
    },
    commonTimeMinutes: solution.commonTimeMinutes,
    routes: solution.bundles.map((bundle) => ({
      participantId: bundle.participantId,
      mode: bundle.outbound.mode,
      outboundDepartureAt: bundle.outbound.departureAt,
      outboundArrivalAt: bundle.outbound.arrivalAt,
      returnDepartureAt: bundle.returning.departureAt,
      returnArrivalAt: bundle.returning.arrivalAt,
      estimatedCost: {
        amount: fromMinorUnits(bundle.estimatedTripCostMinor),
        currency: "RUB",
      },
      ...(bundle.outbound.bookingUrl
        ? { outboundBookingUrl: bundle.outbound.bookingUrl }
        : {}),
      ...(bundle.returning.bookingUrl
        ? { returnBookingUrl: bundle.returning.bookingUrl }
        : {}),
    })),
    hotels: [...solution.hotels],
    hotelRequired: solution.hotelRequired,
    valid: true,
    checkedAt: solution.fetchedAt,
    degraded: solution.degraded,
  };
}

function omitOrganizer(trip: TripAggregate["trip"]): TripPublic {
  const { organizerUserId: _, ...publicTrip } = trip;
  return publicTrip;
}

function omitUser(
  participant: TripAggregate["actorParticipant"],
): ParticipantSelfDto {
  const { userId: _, ...self } = participant;
  return self;
}

function round(value: number): number {
  return Math.round((value + Number.EPSILON) * 100) / 100;
}
