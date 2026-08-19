import type { ParticipantPrivate, Trip } from "@rendezvous/contracts";
import { CITY_CATALOG, findCityByName } from "../city/catalog.js";
import { validateTripForComputation } from "../trip/invariants.js";
import type { ComputableTrip } from "../trip/entities.js";

const ids = {
  trip: "20000000-0000-4000-8000-000000000001",
  participants: [
    "20000000-0000-4000-8000-000000000011",
    "20000000-0000-4000-8000-000000000012",
    "20000000-0000-4000-8000-000000000013",
    "20000000-0000-4000-8000-000000000014",
  ],
  users: [
    "20000000-0000-4000-8000-000000000021",
    "20000000-0000-4000-8000-000000000022",
    "20000000-0000-4000-8000-000000000023",
    "20000000-0000-4000-8000-000000000024",
  ],
} as const;

const createdAt = "2026-09-01T12:00:00+03:00";

export const DEMO_TRIP: Trip = {
  id: ids.trip,
  title: "Сентябрьский побег",
  organizerUserId: ids.users[0],
  expectedParticipants: 4,
  status: "LIVE",
  computeStatus: "idle",
  revision: 4,
  rankingVersion: 1,
  minTogetherMinutes: 1_200,
  periodFrom: "2026-09-04T15:00:00+03:00",
  periodTo: "2026-09-06T23:30:00+03:00",
  allowInternational: false,
  scoringConfig: {
    together: 35,
    cost: 25,
    travel: 20,
    synchronization: 10,
    fairness: 10,
  },
  createdAt,
  updatedAt: createdAt,
};

export const DEMO_PARTICIPANTS: readonly ParticipantPrivate[] = [
  participant(
    0,
    "Данил",
    "Москва",
    "2026-09-04T18:00:00+03:00",
    "2026-09-06T23:00:00+03:00",
    15_000,
    ["quiet", "history"],
  ),
  participant(
    1,
    "Саша",
    "Санкт-Петербург",
    "2026-09-04T17:30:00+03:00",
    "2026-09-06T22:30:00+03:00",
    17_000,
    ["food"],
  ),
  participant(
    2,
    "Катя",
    "Нижний Новгород",
    "2026-09-04T18:30:00+03:00",
    "2026-09-06T23:30:00+03:00",
    12_000,
    ["quiet"],
  ),
  participant(
    3,
    "Маша",
    "Казань",
    "2026-09-04T19:00:00+03:00",
    "2026-09-06T22:00:00+03:00",
    14_000,
    [],
  ),
];

export function getDemoComputableTrip(count: 2 | 3 | 4 = 4): ComputableTrip {
  const result = validateTripForComputation(
    DEMO_TRIP,
    DEMO_PARTICIPANTS.slice(0, count),
    CITY_CATALOG,
  );
  if (!result.ok)
    throw new Error(
      `Invalid demo fixture: ${result.errors.map(({ code }) => code).join(", ")}`,
    );
  return result.value;
}

function participant(
  index: 0 | 1 | 2 | 3,
  displayName: string,
  originName: string,
  availableFrom: string,
  mustReturnBy: string,
  budget: number,
  destinationTags: Array<"quiet" | "history" | "food">,
): ParticipantPrivate {
  const origin = findCityByName(originName);
  if (!origin)
    throw new Error(`Demo origin is missing from catalog: ${originName}`);
  return {
    id: ids.participants[index],
    tripId: ids.trip,
    userId: ids.users[index],
    displayName,
    originCityId: origin.id,
    availableFrom,
    mustReturnBy,
    maxBudget: { amount: budget, currency: "RUB" },
    forbiddenModes: index === 1 ? ["air"] : [],
    softPreferences: {
      preferDirect: true,
      ...(destinationTags.length > 0 ? { destinationTags } : {}),
    },
    ready: true,
    createdAt,
    updatedAt: createdAt,
  };
}
