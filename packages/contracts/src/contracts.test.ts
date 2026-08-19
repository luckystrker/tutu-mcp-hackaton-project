import { describe, expect, it } from "vitest";
import {
  ApiErrorSchema,
  CitySchema,
  DestinationResultDtoSchema,
  HotelOptionSchema,
  ParticipantPrivateSchema,
  RouteOptionSchema,
  SoftPreferencesSchema,
  TripEventSchema,
  TripGroupDtoSchema,
  TripOrganizerDtoSchema,
  TripPrivateDtoSchema,
  TripSchema,
} from "./index.js";

const ids = {
  trip: "00000000-0000-4000-8000-000000000001",
  user: "00000000-0000-4000-8000-000000000002",
  participant: "00000000-0000-4000-8000-000000000003",
  city: "00000000-0000-4000-8000-000000000004",
};
const now = "2026-09-04T12:00:00+07:00";
const money = { amount: 5000, currency: "RUB" as const };
const city = {
  id: ids.city,
  name: "Ярославль",
  country: "RU",
  lat: 57.6261,
  lon: 39.8845,
  hubScore: 75,
  tags: ["history" as const],
};
const trip = {
  id: ids.trip,
  title: "Сентябрьский побег",
  organizerUserId: ids.user,
  expectedParticipants: 2 as const,
  status: "COLLECTING" as const,
  computeStatus: "idle" as const,
  revision: 0,
  rankingVersion: 0,
  minTogetherMinutes: 600,
  periodFrom: now,
  periodTo: "2026-09-06T23:00:00+07:00",
  allowInternational: false,
  scoringConfig: {
    together: 35,
    cost: 25,
    travel: 20,
    synchronization: 10,
    fairness: 10,
  },
  createdAt: now,
  updatedAt: now,
};
const participant = {
  id: ids.participant,
  tripId: ids.trip,
  userId: ids.user,
  displayName: "Данил",
  originCityId: ids.city,
  availableFrom: now,
  mustReturnBy: "2026-09-06T23:00:00+07:00",
  maxBudget: money,
  forbiddenModes: ["air" as const],
  softPreferences: { preferDirect: true },
  ready: true,
  createdAt: now,
  updatedAt: now,
};
const destination = {
  city: { id: city.id, name: city.name, country: city.country },
  rank: 1,
  score: 94,
  components: {
    together: 98,
    cost: 89,
    travel: 88,
    synchronization: 94,
    fairness: 96,
  },
  commonTimeMinutes: 1860,
  routes: [
    {
      participantId: ids.participant,
      mode: "train" as const,
      outboundDepartureAt: now,
      outboundArrivalAt: "2026-09-04T16:00:00+07:00",
      returnDepartureAt: "2026-09-06T17:00:00+07:00",
      returnArrivalAt: "2026-09-06T21:00:00+07:00",
      estimatedCost: money,
    },
  ],
  hotels: [],
  valid: true,
  checkedAt: now,
  degraded: false,
};

describe("shared contracts", () => {
  it("parses a city and rejects invalid coordinates", () => {
    expect(CitySchema.parse(city)).toEqual(city);
    expect(CitySchema.safeParse({ ...city, lat: 100 }).success).toBe(false);
  });

  it("allows only the soft preference vocabulary", () => {
    expect(
      SoftPreferencesSchema.parse({
        avoidNightTravel: true,
        destinationTags: ["quiet"],
      }),
    ).toBeDefined();
    expect(SoftPreferencesSchema.safeParse({ maxBudget: 9000 }).success).toBe(
      false,
    );
  });

  it("parses trips and participants and rejects incomplete values", () => {
    expect(TripSchema.parse(trip)).toEqual(trip);
    expect(ParticipantPrivateSchema.parse(participant)).toEqual(participant);
    expect(
      TripSchema.safeParse({ ...trip, expectedParticipants: 5 }).success,
    ).toBe(false);
    expect(
      ParticipantPrivateSchema.safeParse({
        ...participant,
        maxBudget: { amount: -1, currency: "RUB" },
      }).success,
    ).toBe(false);
  });

  it("parses normalized travel options without raw provider metadata", () => {
    const route = {
      id: "tutu-route-1",
      originCityId: ids.city,
      destinationCityId: ids.city,
      mode: "train",
      departureAt: now,
      arrivalAt: "2026-09-04T16:00:00+07:00",
      durationMinutes: 240,
      price: money,
      source: "tutu",
    };
    expect(RouteOptionSchema.safeParse(route).success).toBe(true);
    expect(
      RouteOptionSchema.safeParse({ ...route, rawMetadata: {} }).success,
    ).toBe(false);
    expect(
      HotelOptionSchema.safeParse({
        id: "hotel-1",
        cityId: ids.city,
        name: "Hotel",
        totalPrice: money,
        checkIn: "2026-09-04",
        checkOut: "2026-09-06",
        fetchedAt: now,
        source: "tutu",
      }).success,
    ).toBe(true);
  });

  it("keeps private, group and organizer projections structurally distinct", () => {
    const groupParticipant = {
      id: ids.participant,
      displayName: "Данил",
      ready: true,
      suitability: "suitable" as const,
    };
    const publicTrip = (({ organizerUserId: _, ...value }) => value)(trip);
    const me = (({ userId: _, ...value }) => value)(participant);
    const group = {
      trip: publicTrip,
      participants: [groupParticipant],
      me,
      destinations: [destination],
    };

    expect(
      TripPrivateDtoSchema.safeParse({
        trip,
        participants: [participant],
        destinations: [destination],
      }).success,
    ).toBe(true);
    expect(TripGroupDtoSchema.safeParse(group).success).toBe(true);
    expect(
      TripOrganizerDtoSchema.safeParse({
        ...group,
        capabilities: {
          canEditSettings: true,
          canShortlist: true,
          canFinalize: true,
          canCancel: true,
        },
      }).success,
    ).toBe(true);
    expect(
      TripGroupDtoSchema.safeParse({ ...group, participants: [participant] })
        .success,
    ).toBe(false);
    expect(DestinationResultDtoSchema.safeParse(destination).success).toBe(
      true,
    );
  });

  it("parses API errors and discriminated SSE events", () => {
    expect(
      ApiErrorSchema.safeParse({
        error: {
          code: "INVALID",
          message: "Invalid input",
          requestId: "request-1",
        },
      }).success,
    ).toBe(true);
    expect(
      TripEventSchema.safeParse({
        id: "event-1",
        tripId: ids.trip,
        revision: 1,
        occurredAt: now,
        type: "ranking_updated",
        payload: { rankingVersion: 1, destinations: [destination] },
      }).success,
    ).toBe(true);
    expect(
      TripEventSchema.safeParse({
        id: "event-2",
        tripId: ids.trip,
        revision: 1,
        occurredAt: now,
        type: "unknown",
        payload: {},
      }).success,
    ).toBe(false);
  });
});
