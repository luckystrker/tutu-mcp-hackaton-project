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

export type DemoFixture = {
  trip: Trip;
  participants: readonly ParticipantPrivate[];
};

/**
 * Builds the four demo personas for the first Friday at least two weeks away.
 * The lead time keeps the dataset inside a useful provider booking horizon
 * without baking a presentation date permanently into release tooling.
 */
export function createDemoFixture(referenceDate = new Date()): DemoFixture {
  if (Number.isNaN(referenceDate.getTime()))
    throw new Error("Demo reference date must be valid");
  const friday = nextWeekday(addUtcDays(referenceDate, 14), 5);
  const sunday = addUtcDays(friday, 2);
  const fridayDate = isoDate(friday);
  const sundayDate = isoDate(sunday);
  const createdAt = referenceDate.toISOString();
  const trip: Trip = {
    id: ids.trip,
    title: "Демо-встреча",
    organizerUserId: ids.users[0],
    expectedParticipants: 4,
    status: "LIVE",
    computeStatus: "idle",
    revision: 4,
    rankingVersion: 1,
    minTogetherMinutes: 1_200,
    periodFrom: `${fridayDate}T15:00:00+03:00`,
    periodTo: `${sundayDate}T23:30:00+03:00`,
    allowInternational: false,
    preferredTransportModes: ["train"],
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
  return {
    trip,
    participants: [
      participant(
        0,
        "Данил",
        "Москва",
        `${fridayDate}T18:00:00+03:00`,
        `${sundayDate}T23:00:00+03:00`,
        15_000,
        ["quiet", "history"],
        createdAt,
      ),
      participant(
        1,
        "Саша",
        "Санкт-Петербург",
        `${fridayDate}T17:30:00+03:00`,
        `${sundayDate}T22:30:00+03:00`,
        17_000,
        ["food"],
        createdAt,
      ),
      participant(
        2,
        "Катя",
        "Нижний Новгород",
        `${fridayDate}T18:30:00+03:00`,
        `${sundayDate}T23:30:00+03:00`,
        12_000,
        ["quiet"],
        createdAt,
      ),
      participant(
        3,
        "Маша",
        "Казань",
        `${fridayDate}T19:00:00+03:00`,
        `${sundayDate}T22:00:00+03:00`,
        14_000,
        [],
        createdAt,
      ),
    ],
  };
}

// Stable snapshot used by deterministic tests and the self-contained web demo.
const DEMO_SNAPSHOT = createDemoFixture(new Date("2026-08-21T00:00:00.000Z"));
export const DEMO_TRIP: Trip = DEMO_SNAPSHOT.trip;
export const DEMO_PARTICIPANTS: readonly ParticipantPrivate[] =
  DEMO_SNAPSHOT.participants;

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
  createdAt: string,
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

function addUtcDays(date: Date, days: number): Date {
  const result = new Date(date);
  result.setUTCHours(12, 0, 0, 0);
  result.setUTCDate(result.getUTCDate() + days);
  return result;
}

function nextWeekday(date: Date, weekday: number): Date {
  return addUtcDays(date, (weekday - date.getUTCDay() + 7) % 7);
}

function isoDate(date: Date): string {
  return date.toISOString().slice(0, 10);
}
