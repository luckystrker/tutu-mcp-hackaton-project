import type { ParticipantPrivate } from "@rendezvous/contracts";
import { describe, expect, it } from "vitest";
import { CITY_CATALOG } from "../city/catalog.js";
import { DEMO_PARTICIPANTS, DEMO_TRIP } from "../fixtures/demo.js";
import { validateTripForComputation } from "../trip/invariants.js";
import { validateParticipant } from "./invariants.js";

describe("participant and trip invariants", () => {
  it("promotes a complete profile to ReadyParticipant", () => {
    const result = validateParticipant(
      DEMO_PARTICIPANTS[0]!,
      DEMO_TRIP,
      CITY_CATALOG,
    );
    expect(result.ok).toBe(true);
    if (result.ok) expect(result.value.maxBudget.amount).toBeGreaterThan(0);
  });

  it("reports every missing or invalid hard constraint", () => {
    const invalid: ParticipantPrivate = {
      ...DEMO_PARTICIPANTS[0]!,
      ready: false,
      originCityId: null,
      availableFrom: "2026-09-07T00:00:00+03:00",
      mustReturnBy: "2026-09-06T00:00:00+03:00",
      maxBudget: { amount: 0, currency: "RUB" },
      forbiddenModes: ["air", "air"],
    };
    const result = validateParticipant(invalid, DEMO_TRIP, CITY_CATALOG);
    expect(result.ok).toBe(false);
    if (!result.ok) {
      expect(result.errors.map(({ code }) => code)).toEqual([
        "PARTICIPANT_NOT_READY",
        "ORIGIN_REQUIRED",
        "INVALID_WINDOW",
        "BUDGET_INVALID",
        "DUPLICATE_FORBIDDEN_MODE",
      ]);
    }
  });

  it("requires two unique ready users and respects trip capacity", () => {
    const one = validateTripForComputation(
      DEMO_TRIP,
      DEMO_PARTICIPANTS.slice(0, 1),
      CITY_CATALOG,
    );
    expect(one.ok).toBe(false);
    const duplicate = validateTripForComputation(
      DEMO_TRIP,
      [
        DEMO_PARTICIPANTS[0]!,
        { ...DEMO_PARTICIPANTS[1]!, userId: DEMO_PARTICIPANTS[0]!.userId },
      ],
      CITY_CATALOG,
    );
    expect(duplicate.ok).toBe(false);
    if (!duplicate.ok)
      expect(
        duplicate.errors.some(({ code }) => code === "DUPLICATE_USER"),
      ).toBe(true);
    const overCapacity = validateTripForComputation(
      { ...DEMO_TRIP, expectedParticipants: 2 },
      DEMO_PARTICIPANTS.slice(0, 3),
      CITY_CATALOG,
    );
    expect(overCapacity.ok).toBe(false);
    if (!overCapacity.ok)
      expect(
        overCapacity.errors.some(({ code }) => code === "PARTICIPANT_LIMIT"),
      ).toBe(true);
  });

  it("rejects participants from another trip and terminal trips", () => {
    const wrongTrip = validateParticipant(
      {
        ...DEMO_PARTICIPANTS[0]!,
        tripId: "22000000-0000-4000-8000-000000000001",
      },
      DEMO_TRIP,
      CITY_CATALOG,
    );
    expect(wrongTrip.ok).toBe(false);
    if (!wrongTrip.ok)
      expect(wrongTrip.errors.map(({ code }) => code)).toContain(
        "PARTICIPANT_TRIP_MISMATCH",
      );

    const finalized = validateTripForComputation(
      { ...DEMO_TRIP, status: "FINALIZED" },
      DEMO_PARTICIPANTS,
      CITY_CATALOG,
    );
    expect(finalized.ok).toBe(false);
    if (!finalized.ok)
      expect(finalized.errors.map(({ code }) => code)).toContain(
        "TRIP_NOT_COMPUTABLE",
      );
  });
});
