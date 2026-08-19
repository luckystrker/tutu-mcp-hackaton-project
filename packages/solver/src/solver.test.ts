import { describe, expect, it } from "vitest";
import { compareDestinations } from "./compare.js";
import { hotelShareMinor } from "./bundles.js";
import type { CandidateTravelFacts } from "./model.js";
import { SolverError } from "./numeric.js";
import { presetToWeights } from "./presets.js";
import { solve } from "./rank.js";
import { rescore } from "./rescore.js";
import {
  BALANCED,
  candidate,
  IDS,
  route,
  solverTrip,
} from "./test-fixtures.js";

describe("deterministic solver", () => {
  it("allocates every hotel minor unit exactly and deterministically", () => {
    const trip = solverTrip();
    const facts = {
      ...candidate({ participants: trip.participants }),
      hotels: [
        {
          id: "hotel-allocation",
          cityId: IDS.cities[0],
          name: "Hotel",
          totalPrice: { amount: 1000.01, currency: "RUB" as const },
          checkIn: "2026-09-04",
          checkOut: "2026-09-05",
          fetchedAt: "2026-08-19T00:00:00.000Z",
          source: "tutu" as const,
        },
      ],
    };
    const ids = facts.participants.map(({ participantId }) => participantId);
    const shares = ids.map((id) => hotelShareMinor(facts, ids.length, id));
    expect(shares.reduce((sum, value) => sum + value, 0)).toBe(100_001);
    expect(shares).toEqual(
      [...ids].sort().map((id) => hotelShareMinor(facts, ids.length, id)),
    );
  });

  it("changes the winner on local preset rescore without new travel facts", () => {
    const trip = solverTrip();
    const cheapShort = candidate({
      cityId: IDS.cities[0],
      participants: trip.participants,
      returnDeparture: "2026-09-05T00:00:00.000Z",
      price: 1000,
    });
    const expensiveLong = candidate({
      cityId: IDS.cities[1],
      participants: trip.participants,
      returnDeparture: "2026-09-06T12:00:00.000Z",
      price: 4000,
    });
    const middle = candidate({
      cityId: IDS.cities[3],
      participants: trip.participants,
      returnDeparture: "2026-09-05T12:00:00.000Z",
      price: 2000,
    });
    const initial = solve({
      trip,
      candidates: [cheapShort, expensiveLong, middle],
      scoring: BALANCED,
      algorithmVersion: "solver-v1",
    });
    expect(initial.ranked.map(({ cityId }) => cityId)).toEqual([
      IDS.cities[1],
      IDS.cities[3],
      IDS.cities[0],
    ]);

    const rescored = rescore(
      initial,
      trip.participants,
      presetToWeights("cheapest"),
    );
    expect(rescored.ranked.map(({ cityId }) => cityId)).toEqual([
      IDS.cities[0],
      IDS.cities[3],
      IDS.cities[1],
    ]);
    expect(
      rescored.allFeasible
        .flatMap(({ groupFrontier }) => groupFrontier)
        .flatMap(({ bundles }) => bundles)
        .map(({ id }) => id)
        .sort(),
    ).toEqual(
      initial.allFeasible
        .flatMap(({ groupFrontier }) => groupFrontier)
        .flatMap(({ bundles }) => bundles)
        .map(({ id }) => id)
        .sort(),
    );
  });

  it("recomputes max-travel-hours penalty from saved travel minutes", () => {
    const base = solverTrip();
    const strictParticipants = base.participants.map((current) => ({
      ...current,
      softPreferences: {
        ...current.softPreferences,
        maxTravelHoursPreferred: 1,
      },
    }));
    const trip = { ...base, participants: strictParticipants };
    const facts = candidate({
      participants: strictParticipants,
      returnDeparture: "2026-09-05T12:00:00.000Z",
    });
    const initial = solve({
      trip,
      candidates: [facts],
      scoring: BALANCED,
      algorithmVersion: "solver-v1",
    });
    const relaxedParticipants = strictParticipants.map((current) => ({
      ...current,
      softPreferences: {
        ...current.softPreferences,
        maxTravelHoursPreferred: 10,
      },
    }));
    const rescored = rescore(initial, relaxedParticipants, BALANCED);
    expect(rescored.ranked[0]!.components.travel).toBeGreaterThan(
      initial.ranked[0]!.components.travel,
    );
    expect(rescored.ranked[0]!.bundles.map(({ id }) => id)).toEqual(
      initial.ranked[0]!.bundles.map(({ id }) => id),
    );
  });

  it("returns an exact budget relaxation that unlocks the city", () => {
    const trip = solverTrip();
    const blocked = candidate({
      cityId: IDS.cities[2],
      participants: trip.participants,
      priceByParticipant: [6000, 1000],
      returnDeparture: "2026-09-05T12:00:00.000Z",
    });
    const result = solve({
      trip,
      candidates: [blocked],
      scoring: BALANCED,
      algorithmVersion: "solver-v1",
    });
    expect(result.ranked).toEqual([]);
    const relaxation = result.relaxations.find(({ type }) => type === "budget");
    expect(relaxation).toMatchObject({
      participantId: trip.participants[0]!.id,
      delta: 2000,
      unlockedCities: [IDS.cities[2]],
    });

    const relaxedTrip = {
      ...trip,
      participants: trip.participants.map((current, index) =>
        index === 0
          ? {
              ...current,
              maxBudget: { amount: 12_000, currency: "RUB" as const },
            }
          : current,
      ),
    };
    expect(
      solve({
        trip: relaxedTrip,
        candidates: [blocked],
        scoring: BALANCED,
        algorithmVersion: "solver-v1",
      }).ranked[0]?.cityId,
    ).toBe(IDS.cities[2]);
  });

  it("reports departure, return, and transport relaxations independently", () => {
    const base = solverTrip();
    const departureFacts = candidate({
      cityId: IDS.cities[0],
      participants: base.participants,
    });
    const departureBlocked = {
      ...departureFacts,
      participants: departureFacts.participants.map((facts, index) =>
        index === 0
          ? {
              ...facts,
              outbound: [
                {
                  ...facts.outbound[0]!,
                  departureAt: "2026-09-04T07:00:00.000Z",
                  durationMinutes: 300,
                },
              ],
            }
          : facts,
      ),
    };
    const departureResult = solve({
      trip: base,
      candidates: [departureBlocked],
      scoring: BALANCED,
      algorithmVersion: "solver-v1",
    });
    expect(departureResult.relaxations).toContainEqual({
      type: "departure",
      participantId: base.participants[0]!.id,
      delta: 60,
      unlockedCities: [IDS.cities[0]],
    });

    const returnTrip = {
      ...base,
      participants: base.participants.map((current, index) =>
        index === 0
          ? { ...current, mustReturnBy: "2026-09-05T01:00:00.000Z" }
          : current,
      ),
    };
    const returnFacts = candidate({
      cityId: IDS.cities[1],
      participants: returnTrip.participants,
    });
    expect(
      solve({
        trip: returnTrip,
        candidates: [returnFacts],
        scoring: BALANCED,
        algorithmVersion: "solver-v1",
      }).relaxations,
    ).toContainEqual({
      type: "return",
      participantId: base.participants[0]!.id,
      delta: 60,
      unlockedCities: [IDS.cities[1]],
    });

    const transportTrip = {
      ...base,
      participants: base.participants.map((current, index) =>
        index === 0
          ? { ...current, forbiddenModes: ["train" as const] }
          : current,
      ),
    };
    const transportFacts = candidate({
      cityId: IDS.cities[2],
      participants: transportTrip.participants,
    });
    expect(
      solve({
        trip: transportTrip,
        candidates: [transportFacts],
        scoring: BALANCED,
        algorithmVersion: "solver-v1",
      }).relaxations,
    ).toContainEqual({
      type: "transport",
      participantId: base.participants[0]!.id,
      mode: "train",
      unlockedCities: [IDS.cities[2]],
    });
  });

  it("returns a trip-level minimum-together relaxation", () => {
    const trip = solverTrip(2, { minTogetherMinutes: 900 });
    const short = candidate({
      cityId: IDS.cities[3],
      participants: trip.participants,
      returnDeparture: "2026-09-04T20:00:00.000Z",
    });
    const result = solve({
      trip,
      candidates: [short],
      scoring: BALANCED,
      algorithmVersion: "solver-v1",
    });
    expect(result.relaxations).toContainEqual({
      type: "minTogetherTime",
      participantId: null,
      delta: 420,
      unlockedCities: [IDS.cities[3]],
    });
  });

  it("retains wide presence windows beyond the bundle cap instead of falsely rejecting the city", () => {
    const trip = solverTrip();
    const [first, second] = trip.participants;
    const city = IDS.cities[0];
    const day = Date.parse("2026-09-04T00:00:00.000Z");
    const iso = (minutes: number) =>
      new Date(day + minutes * 60_000).toISOString();
    const facts: CandidateTravelFacts = {
      cityId: city,
      destinationTimeZone: "Europe/Moscow",
      fetchedAt: "2026-08-19T00:00:00.000Z",
      participants: [
        {
          participantId: first!.id,
          originTimeZone: "Europe/Moscow",
          outbound: [
            route({
              id: "p0-wide-out",
              originCityId: first!.originCityId,
              destinationCityId: city,
              departureAt: iso(9 * 60),
              arrivalAt: iso(12 * 60),
              price: 3000,
            }),
            ...[0, 1, 2, 3].map((index) =>
              route({
                id: `p0-narrow-${index}-out`,
                originCityId: first!.originCityId,
                destinationCityId: city,
                departureAt: iso(10 * 60),
                arrivalAt: iso(12 * 60 + 30 + index * 10),
                price: 1300 - index * 100,
              }),
            ),
          ],
          returns: [
            route({
              id: "p0-wide-ret",
              originCityId: city,
              destinationCityId: first!.originCityId,
              departureAt: iso(22 * 60),
              arrivalAt: iso(24 * 60),
              price: 3000,
            }),
            ...[0, 1, 2, 3].map((index) =>
              route({
                id: `p0-narrow-${index}-ret`,
                originCityId: city,
                destinationCityId: first!.originCityId,
                departureAt: iso(13 * 60 + 30 + index * 10),
                arrivalAt: iso(14 * 60 + 30 + index * 10),
                price: 1300 - index * 100,
              }),
            ),
          ],
        },
        {
          participantId: second!.id,
          originTimeZone: "Europe/Moscow",
          outbound: [
            route({
              id: "p1-out",
              originCityId: second!.originCityId,
              destinationCityId: city,
              departureAt: iso(10 * 60),
              arrivalAt: iso(12 * 60),
              price: 1000,
            }),
          ],
          returns: [
            route({
              id: "p1-ret",
              originCityId: city,
              destinationCityId: second!.originCityId,
              departureAt: iso(22 * 60),
              arrivalAt: iso(24 * 60),
              price: 1000,
            }),
          ],
        },
      ],
    };
    const result = solve({
      trip,
      candidates: [facts],
      scoring: BALANCED,
      algorithmVersion: "solver-v1",
    });
    expect(result.ranked.map(({ cityId }) => cityId)).toEqual([city]);
    expect(result.ranked[0]?.commonTimeMinutes).toBe(600);
  });

  it("reports secondary blockers alongside constraints that block every option", () => {
    const base = solverTrip();
    const tight = base.participants.map((current, index) =>
      index === 0
        ? { ...current, availableFrom: "2026-09-04T11:00:00.000Z" }
        : current,
    );
    const facts = candidate({
      cityId: IDS.cities[0],
      participants: tight,
    });
    const withPriceyReturn = {
      ...facts,
      participants: facts.participants.map((current, index) =>
        index === 0
          ? {
              ...current,
              returns: [
                ...current.returns,
                route({
                  id: "pricey-return",
                  originCityId: facts.cityId,
                  destinationCityId: tight[0]!.originCityId,
                  departureAt: "2026-09-05T00:00:00.000Z",
                  arrivalAt: "2026-09-05T02:00:00.000Z",
                  price: 9500,
                }),
              ],
            }
          : current,
      ),
    };
    const result = solve({
      trip: { ...base, participants: tight },
      candidates: [withPriceyReturn],
      scoring: BALANCED,
      algorithmVersion: "solver-v1",
    });
    expect(result.ranked).toEqual([]);
    expect(result.rejected[0]?.reasons).toEqual(["BUDGET", "DEPARTURE_WINDOW"]);
    expect(result.rejected[0]?.affectedParticipantIds).toEqual([tight[0]!.id]);
  });

  it("raises SolverError instead of a builtin error when rescore receives stale participants", () => {
    const trip = solverTrip();
    const initial = solve({
      trip,
      candidates: [candidate({ participants: trip.participants })],
      scoring: BALANCED,
      algorithmVersion: "solver-v1",
    });
    const broke = trip.participants.map((current, index) =>
      index === 0
        ? { ...current, maxBudget: { amount: 0, currency: "RUB" as const } }
        : current,
    );
    expect(() => rescore(initial, broke, BALANCED)).toThrow(SolverError);
  });

  it("applies valid hotel cost, degrades unknown price, and removes no-availability cities", () => {
    const trip = solverTrip();
    const validHotel = {
      id: "hotel-valid",
      cityId: IDS.cities[0],
      name: "Hotel",
      totalPrice: { amount: 2000, currency: "RUB" as const },
      checkIn: "2026-09-04",
      checkOut: "2026-09-05",
      fetchedAt: "2026-08-19T00:00:00.000Z",
      source: "tutu" as const,
    };
    const withHotel = {
      ...candidate({ cityId: IDS.cities[0], participants: trip.participants }),
      hotels: [validHotel],
    };
    const incomplete = {
      ...candidate({ cityId: IDS.cities[1], participants: trip.participants }),
      hotels: [
        {
          ...validHotel,
          id: "hotel-incomplete",
          cityId: IDS.cities[1],
          totalPrice: null,
        },
      ],
    };
    const unavailable = {
      ...candidate({ cityId: IDS.cities[2], participants: trip.participants }),
      hotels: [],
    };
    const unenriched = candidate({
      cityId: IDS.cities[3],
      participants: trip.participants,
    });
    const result = solve({
      trip,
      candidates: [withHotel, incomplete, unavailable, unenriched],
      scoring: BALANCED,
      algorithmVersion: "solver-v1",
    });
    expect(
      result.allFeasible.find(({ cityId }) => cityId === IDS.cities[0])
        ?.bundles[0]?.hotelShareMinor,
    ).toBe(100_000);
    expect(
      result.allFeasible.find(({ cityId }) => cityId === IDS.cities[0])
        ?.hotelRequired,
    ).toBe(true);
    expect(
      result.allFeasible.find(({ cityId }) => cityId === IDS.cities[1])
        ?.degraded,
    ).toBe(true);
    expect(
      result.rejected.find(({ cityId }) => cityId === IDS.cities[2])?.reasons,
    ).toEqual(["NO_HOTEL_AVAILABILITY"]);
    expect(
      result.allFeasible.find(({ cityId }) => cityId === IDS.cities[3])
        ?.degraded,
    ).toBe(true);
  });

  it("keeps a same-local-day destination feasible without hotels and marks it hotelRequired=false", () => {
    const trip = solverTrip();
    const sameDay = {
      ...candidate({ cityId: IDS.cities[0], participants: trip.participants }),
      hotelRequired: false,
      hotels: [],
    };
    const overnightWithoutHotels = {
      ...candidate({ cityId: IDS.cities[1], participants: trip.participants }),
      hotelRequired: true,
      hotels: [],
    };
    const result = solve({
      trip,
      candidates: [sameDay, overnightWithoutHotels],
      scoring: BALANCED,
      algorithmVersion: "solver-v1",
    });
    const solution = result.allFeasible.find(
      ({ cityId }) => cityId === IDS.cities[0],
    );
    expect(solution?.hotelRequired).toBe(false);
    expect(solution?.degraded).toBe(false);
    expect(result.ranked.map(({ cityId }) => cityId)).toEqual([IDS.cities[0]]);
    expect(
      result.rejected.find(({ cityId }) => cityId === IDS.cities[1])?.reasons,
    ).toEqual(["NO_HOTEL_AVAILABILITY"]);
  });

  it("is invariant to participant and option permutations", () => {
    const trip = solverTrip();
    const facts = candidate({
      participants: trip.participants,
      returnDeparture: "2026-09-05T12:00:00.000Z",
    });
    const direct = solve({
      trip,
      candidates: [facts],
      scoring: BALANCED,
      algorithmVersion: "solver-v1",
    });
    const permuted = solve({
      trip: { ...trip, participants: [...trip.participants].reverse() },
      candidates: [
        { ...facts, participants: [...facts.participants].reverse() },
      ],
      scoring: BALANCED,
      algorithmVersion: "solver-v1",
    });
    expect(
      permuted.ranked.map(({ cityId, score }) => ({ cityId, score })),
    ).toEqual(direct.ranked.map(({ cityId, score }) => ({ cityId, score })));
    expect(permuted.ranked[0]?.bundles.map(({ id }) => id)).toEqual(
      direct.ranked[0]?.bundles.map(({ id }) => id),
    );
  });

  it("produces privacy-marked structured comparison facts", () => {
    const trip = solverTrip();
    const result = solve({
      trip,
      candidates: [
        candidate({
          cityId: IDS.cities[0],
          participants: trip.participants,
          price: 1000,
        }),
        candidate({
          cityId: IDS.cities[1],
          participants: trip.participants,
          price: 2000,
        }),
      ],
      scoring: BALANCED,
      algorithmVersion: "solver-v1",
    });
    const [first, second] = result.allFeasible;
    expect(
      first && second ? compareDestinations(second, first) : null,
    ).toMatchObject({
      cityId: IDS.cities[1],
      comparedWithCityId: IDS.cities[0],
      costDifference: 4000,
      mostAffectedParticipant: "private",
    });
  });

  it("handles eight cities and a 4^4 local search without becoming a bottleneck", () => {
    const trip = solverTrip(4);
    const candidates = Array.from({ length: 8 }, (_, cityIndex) => {
      const base = candidate({
        cityId: `40000000-0000-4000-8000-${String(cityIndex + 1).padStart(12, "0")}`,
        participants: trip.participants,
        returnDeparture: "2026-09-05T12:00:00.000Z",
      });
      return {
        ...base,
        participants: base.participants.map((facts) => ({
          ...facts,
          outbound: Array.from({ length: 4 }, (_, index) => ({
            ...facts.outbound[0]!,
            id: `${facts.outbound[0]!.id}:${index}`,
          })),
          returns: Array.from({ length: 4 }, (_, index) => ({
            ...facts.returns[0]!,
            id: `${facts.returns[0]!.id}:${index}`,
          })),
        })),
      };
    });
    const startedAt = performance.now();
    const result = solve({
      trip,
      candidates,
      scoring: BALANCED,
      algorithmVersion: "solver-v1",
    });
    expect(result.allFeasible).toHaveLength(8);
    // This is a regression smoke, not a micro-benchmark: shared CI runners can
    // be several times slower under contention. The end-to-end 60s budget is
    // measured separately by the recompute workflow.
    expect(performance.now() - startedAt).toBeLessThan(3000);
  });
});
