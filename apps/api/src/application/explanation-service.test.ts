import type { SolverOutput, DestinationSolution } from "@rendezvous/solver";
import { ExplainResponseSchema } from "@rendezvous/contracts";
import { describe, expect, it, vi } from "vitest";
import type { TripRepository } from "../repositories/trip-repository.js";
import {
  ExplanationService,
  renderExplanation,
} from "./explanation-service.js";

const cityA = "30000000-0000-4000-8000-000000000041";
const cityB = "30000000-0000-4000-8000-000000000042";
const self = "30000000-0000-4000-8000-000000000011";
const other = "30000000-0000-4000-8000-000000000012";

describe("privacy-safe explanations", () => {
  it("projects the most affected participant without exposing their id", async () => {
    const service = fixtureService(output());
    const response = await service.explain(self, "trip", {
      type: "compare",
      cityA,
      cityB,
    });
    expect(response.source).toBe("template");
    expect(response.facts).toMatchObject({
      type: "compare",
      affectedParticipant: "private",
    });
    expect(JSON.stringify(response)).not.toContain(other);
  });

  it("hides another participant's counterfactual value but shows self detail", async () => {
    const service = fixtureService(output());
    const response = await service.explain(self, "trip", {
      type: "counterfactual",
    });
    if (response.facts.type !== "counterfactual") throw new Error("facts");
    const privateChange = response.facts.changes.find(
      ({ affectedParticipant }) => affectedParticipant === "private",
    )!;
    const selfChange = response.facts.changes.find(
      ({ affectedParticipant }) => affectedParticipant === "self",
    )!;
    expect(privateChange).not.toHaveProperty("delta");
    expect(privateChange).not.toHaveProperty("mode");
    expect(selfChange).toMatchObject({
      delta: 500,
      affectedParticipant: "self",
    });
    expect(response.text).not.toContain(other);
  });

  it("renders a deterministic fallback for empty counterfactuals", () => {
    expect(
      renderExplanation({ type: "counterfactual", city: null, changes: [] }),
    ).toContain("Нет одного безопасного");
  });

  it("caps counterfactual rendering to the contract text limit", () => {
    const changes = Array.from({ length: 60 }, (_, index) => ({
      constraint: "budget" as const,
      affectedParticipant: "group" as const,
      delta: 100 + index,
      unlockedCities: [{ id: cityB, name: "Ярославль", country: "RU" }],
    }));
    const facts = { type: "counterfactual" as const, city: null, changes };
    const text = renderExplanation(facts);
    expect(text.length).toBeGreaterThan(1_000);
    expect(text.length).toBeLessThanOrEqual(2_000);
    expect(() =>
      ExplainResponseSchema.parse({
        source: "template",
        factsVersion: "explanation-facts-v1",
        text,
        facts,
      }),
    ).not.toThrow();
  });
});

function fixtureService(solverOutput: SolverOutput) {
  const repository = {
    getExplanationContext: vi.fn(async () => ({
      actorParticipantId: self,
      solverOutput,
    })),
  } as unknown as TripRepository;
  return new ExplanationService(
    repository,
    new Map([
      [cityA, { id: cityA, name: "Казань", country: "RU" }],
      [cityB, { id: cityB, name: "Ярославль", country: "RU" }],
    ]),
  );
}

function output(): SolverOutput {
  const first = solution(cityA, [0.1, 0.2]);
  const second = solution(cityB, [0.2, 0.9]);
  return {
    algorithmVersion: "solver-v1",
    scoringAlgorithmVersion: "scoring-v1",
    scoring: {
      together: 35,
      cost: 25,
      travel: 20,
      synchronization: 10,
      fairness: 10,
    },
    ranked: [first, second],
    allFeasible: [first, second],
    rejected: [],
    relaxations: [
      {
        type: "budget",
        participantId: self,
        delta: 500,
        unlockedCities: [cityB],
      },
      {
        type: "transport",
        participantId: other,
        mode: "air",
        unlockedCities: [cityB],
      },
    ],
  };
}

function solution(
  cityId: string,
  burdens: [number, number],
): DestinationSolution {
  return {
    cityId,
    rank: cityId === cityA ? 1 : 2,
    fetchedAt: "2026-08-20T00:00:00.000Z",
    hotels: [],
    hotelRequired: false,
    degraded: false,
    bundles: [],
    burdens: [
      {
        participantId: self,
        budgetBurden: 0,
        timeBurden: 0,
        softPenalty: 0,
        individualBurden: burdens[0],
      },
      {
        participantId: other,
        budgetBurden: 0,
        timeBurden: 0,
        softPenalty: 0,
        individualBurden: burdens[1],
      },
    ],
    commonStart: "2026-09-01T00:00:00.000Z",
    commonEnd: "2026-09-02T00:00:00.000Z",
    commonTimeMinutes: cityId === cityA ? 1200 : 1000,
    totalCostMinor: cityId === cityA ? 10_000 : 12_000,
    totalTravelMinutes: cityId === cityA ? 500 : 700,
    components: {
      together: 90,
      cost: 80,
      travel: 70,
      synchronization: 85,
      fairness: 88,
    },
    score: cityId === cityA ? 90 : 85,
    groupFrontier: [],
  };
}
