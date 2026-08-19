import type { City } from "@rendezvous/contracts";
import fc from "fast-check";
import { describe, expect, it } from "vitest";
import { CITY_BY_ID, CITY_CATALOG } from "../city/catalog.js";
import { getDemoComputableTrip } from "../fixtures/demo.js";
import {
  createCandidateGenerator,
  EXPANDED_CANDIDATE_WEIGHTS,
} from "./generate.js";

describe("candidate generator", () => {
  const generator = createCandidateGenerator(CITY_CATALOG);

  it("returns a deterministic explainable top-8 for the four-person demo", () => {
    const input = {
      participants: getDemoComputableTrip(4).participants,
      allowInternational: false,
    };
    const first = generator.generate(input);
    const second = generator.generate(input);
    expect(first).toEqual(second);
    expect(first).toHaveLength(8);
    expect(first.map(({ cityId }) => CITY_BY_ID.get(cityId)?.name))
      .toMatchInlineSnapshot(`
      [
        "Ярославль",
        "Москва",
        "Нижний Новгород",
        "Владимир",
        "Кострома",
        "Вологда",
        "Иваново",
        "Тверь",
      ]
    `);
    expect(
      first.every(
        ({ algorithmVersion, rankingScore, geoScore, tagBoost }) =>
          algorithmVersion === generator.algorithmVersion &&
          rankingScore === geoScore + tagBoost,
      ),
    ).toBe(true);
  });

  it("filters international cities unless explicitly allowed", () => {
    const participants = getDemoComputableTrip(2).participants;
    const domestic = generator.generate({
      participants,
      allowInternational: false,
      limit: 16,
    });
    expect(
      domestic.every(({ cityId }) => CITY_BY_ID.get(cityId)?.country === "RU"),
    ).toBe(true);
    const international = generator.generate({
      participants,
      allowInternational: true,
      limit: 16,
    });
    expect(
      international.some(
        ({ cityId }) => CITY_BY_ID.get(cityId)?.country !== "RU",
      ),
    ).toBe(true);
  });

  it("applies bounded participant tag boost without filtering unmatched cities", () => {
    const origin = CITY_CATALOG[0]!;
    const unmatched: City = {
      ...origin,
      id: "31000000-0000-4000-8000-000000000001",
      name: "Unmatched",
      tags: ["nightlife"],
    };
    const matched: City = {
      ...origin,
      id: "31000000-0000-4000-8000-000000000002",
      name: "Matched",
      tags: ["quiet"],
    };
    const participants = getDemoComputableTrip(4).participants.map(
      (participant) => ({
        ...participant,
        originCityId: unmatched.id,
      }),
    );
    const results = createCandidateGenerator([unmatched, matched]).generate({
      participants,
      allowInternational: false,
      limit: 2,
    });
    expect(
      results.every(({ tagBoost }) => tagBoost >= 0 && tagBoost <= 10),
    ).toBe(true);
    expect(results.some(({ tagBoost }) => tagBoost === 0)).toBe(true);
    expect(results.some(({ tagBoost }) => tagBoost > 0)).toBe(true);
    expect(results.map(({ cityId }) => cityId)).toContain(unmatched.id);
  });

  it("keeps tag boost at zero when nobody supplies tags", () => {
    const participants = getDemoComputableTrip(4).participants.map(
      (participant) => ({
        ...participant,
        softPreferences: { preferDirect: true },
      }),
    );
    const results = generator.generate({
      participants,
      allowInternational: false,
    });
    expect(
      results.every(
        ({ tagBoost, tagMatchRatio }) => tagBoost === 0 && tagMatchRatio === 0,
      ),
    ).toBe(true);
  });

  it("supports a top-16 expanded hub profile and validates limits", () => {
    const participants = getDemoComputableTrip(3).participants;
    const results = generator.generate({
      participants,
      allowInternational: false,
      limit: 16,
      weights: EXPANDED_CANDIDATE_WEIGHTS,
    });
    expect(results).toHaveLength(16);
    expect(new Set(results.map(({ cityId }) => cityId)).size).toBe(16);
    expect(() =>
      generator.generate({
        participants,
        allowInternational: false,
        limit: 17,
      }),
    ).toThrow(RangeError);
  });

  it("does not change the ranking when participant input order changes", () => {
    const participants = getDemoComputableTrip(4).participants;
    const forward = generator.generate({
      participants,
      allowInternational: false,
    });
    const reverse = generator.generate({
      participants: [...participants].reverse(),
      allowInternational: false,
    });
    expect(
      reverse.map(({ cityId, rankingScore }) => ({ cityId, rankingScore })),
    ).toEqual(
      forward.map(({ cityId, rankingScore }) => ({ cityId, rankingScore })),
    );
  });

  it("always returns a unique bounded result for valid group sizes and limits", () => {
    fc.assert(
      fc.property(
        fc.integer({ min: 2, max: 4 }),
        fc.integer({ min: 1, max: 16 }),
        (count, limit) => {
          const participants = getDemoComputableTrip(
            count as 2 | 3 | 4,
          ).participants;
          const result = generator.generate({
            participants,
            allowInternational: false,
            limit,
          });
          expect(result.length).toBeLessThanOrEqual(limit);
          expect(new Set(result.map(({ cityId }) => cityId)).size).toBe(
            result.length,
          );
        },
      ),
      { numRuns: 50 },
    );
  });

  it("uses stable hub and id tie-breaks for equal geometry", () => {
    const origin = CITY_CATALOG[0]!;
    const equalCities: City[] = [
      {
        ...origin,
        id: "30000000-0000-4000-8000-000000000003",
        name: "C",
        hubScore: 50,
      },
      {
        ...origin,
        id: "30000000-0000-4000-8000-000000000002",
        name: "B",
        hubScore: 80,
      },
      {
        ...origin,
        id: "30000000-0000-4000-8000-000000000001",
        name: "A",
        hubScore: 80,
      },
    ];
    const participants = getDemoComputableTrip(2).participants.map(
      (participant) => ({ ...participant, originCityId: equalCities[0]!.id }),
    );
    expect(
      createCandidateGenerator(equalCities)
        .generate({ participants, allowInternational: false, limit: 3 })
        .map(({ cityId }) => cityId),
    ).toEqual([equalCities[2]!.id, equalCities[1]!.id, equalCities[0]!.id]);
  });
});
