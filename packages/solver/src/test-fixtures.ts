import type {
  ParticipantPrivate,
  RouteOption,
  ScoringConfig,
  Trip,
  TransportMode,
} from "@rendezvous/contracts";
import type {
  CandidateTravelFacts,
  ComputableSolverTrip,
  ReadySolverParticipant,
} from "./model.js";

export const IDS = {
  trip: "30000000-0000-4000-8000-000000000001",
  participants: [
    "30000000-0000-4000-8000-000000000011",
    "30000000-0000-4000-8000-000000000012",
    "30000000-0000-4000-8000-000000000013",
    "30000000-0000-4000-8000-000000000014",
  ],
  users: [
    "30000000-0000-4000-8000-000000000021",
    "30000000-0000-4000-8000-000000000022",
    "30000000-0000-4000-8000-000000000023",
    "30000000-0000-4000-8000-000000000024",
  ],
  origins: [
    "30000000-0000-4000-8000-000000000031",
    "30000000-0000-4000-8000-000000000032",
    "30000000-0000-4000-8000-000000000033",
    "30000000-0000-4000-8000-000000000034",
  ],
  cities: [
    "30000000-0000-4000-8000-000000000041",
    "30000000-0000-4000-8000-000000000042",
    "30000000-0000-4000-8000-000000000043",
    "30000000-0000-4000-8000-000000000044",
  ],
} as const;

export const BALANCED: ScoringConfig = {
  together: 35,
  cost: 25,
  travel: 20,
  synchronization: 10,
  fairness: 10,
};

export function solverTrip(
  count: 2 | 3 | 4 = 2,
  overrides: Partial<Trip> = {},
): ComputableSolverTrip {
  const trip: Trip = {
    id: IDS.trip,
    title: "Solver fixture",
    organizerUserId: IDS.users[0],
    expectedParticipants: count,
    status: "LIVE",
    computeStatus: "idle",
    revision: 1,
    rankingVersion: 1,
    minTogetherMinutes: 600,
    periodFrom: "2026-09-04T08:00:00.000Z",
    periodTo: "2026-09-06T22:00:00.000Z",
    allowInternational: false,
    scoringConfig: BALANCED,
    createdAt: "2026-08-19T00:00:00.000Z",
    updatedAt: "2026-08-19T00:00:00.000Z",
    ...overrides,
  };
  return {
    trip,
    participants: Array.from({ length: count }, (_, index) =>
      participant(index),
    ),
  };
}

export function participant(
  index: number,
  overrides: Partial<ParticipantPrivate> = {},
): ReadySolverParticipant {
  const base: ParticipantPrivate = {
    id: IDS.participants[index]!,
    tripId: IDS.trip,
    userId: IDS.users[index]!,
    displayName: `Participant ${index + 1}`,
    originCityId: IDS.origins[index]!,
    availableFrom: "2026-09-04T08:00:00.000Z",
    mustReturnBy: "2026-09-06T22:00:00.000Z",
    maxBudget: { amount: 10_000, currency: "RUB" },
    forbiddenModes: [],
    softPreferences: {},
    ready: true,
    createdAt: "2026-08-19T00:00:00.000Z",
    updatedAt: "2026-08-19T00:00:00.000Z",
    ...overrides,
  };
  return base as ReadySolverParticipant;
}

export function candidate(
  options: {
    cityId?: string;
    participants?: readonly ReadySolverParticipant[];
    outboundArrival?: string;
    returnDeparture?: string;
    price?: number;
    priceByParticipant?: readonly number[];
    mode?: TransportMode;
  } = {},
): CandidateTravelFacts {
  const participants = options.participants ?? solverTrip().participants;
  const cityId = options.cityId ?? IDS.cities[0];
  const outboundArrival = options.outboundArrival ?? "2026-09-04T12:00:00.000Z";
  const returnDeparture = options.returnDeparture ?? "2026-09-05T00:00:00.000Z";
  return {
    cityId,
    destinationTimeZone: "Europe/Moscow",
    fetchedAt: "2026-08-19T00:00:00.000Z",
    participants: participants.map((current, index) => ({
      participantId: current.id,
      originTimeZone: "Europe/Moscow",
      outbound: [
        route({
          id: `${cityId}:p${index}:out`,
          originCityId: current.originCityId,
          destinationCityId: cityId,
          departureAt: "2026-09-04T10:00:00.000Z",
          arrivalAt: outboundArrival,
          price: options.priceByParticipant?.[index] ?? options.price ?? 1000,
          ...(options.mode === undefined ? {} : { mode: options.mode }),
        }),
      ],
      returns: [
        route({
          id: `${cityId}:p${index}:return`,
          originCityId: cityId,
          destinationCityId: current.originCityId,
          departureAt: returnDeparture,
          arrivalAt: new Date(
            Date.parse(returnDeparture) + 2 * 3_600_000,
          ).toISOString(),
          price: options.priceByParticipant?.[index] ?? options.price ?? 1000,
          ...(options.mode === undefined ? {} : { mode: options.mode }),
        }),
      ],
    })),
  };
}

export function route(options: {
  id: string;
  originCityId: string;
  destinationCityId: string;
  departureAt: string;
  arrivalAt: string;
  price: number;
  mode?: TransportMode;
  transfers?: number;
}): RouteOption {
  return {
    id: options.id,
    originCityId: options.originCityId,
    destinationCityId: options.destinationCityId,
    mode: options.mode ?? "train",
    departureAt: options.departureAt,
    arrivalAt: options.arrivalAt,
    durationMinutes: Math.max(
      1,
      Math.round(
        (Date.parse(options.arrivalAt) - Date.parse(options.departureAt)) /
          60_000,
      ),
    ),
    price: { amount: options.price, currency: "RUB" },
    ...(options.transfers === undefined
      ? {}
      : { transfers: options.transfers }),
    source: "tutu",
  };
}
