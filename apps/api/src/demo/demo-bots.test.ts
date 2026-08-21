import { describe, expect, it } from "vitest";
import type { UpdatePreferencesInput } from "@rendezvous/contracts";
import type { Actor } from "../application/actor.js";
import {
  DemoBots,
  type DemoBotRepository,
  type DemoBotTripCandidate,
} from "./demo-bots.js";

function fakeRepository(candidates: DemoBotTripCandidate[]) {
  const calls = {
    joined: [] as Actor[],
    preferences: [] as { userId: string; input: UpdatePreferencesInput }[],
    reactions: [] as { userId: string; cityId: string; value: string }[],
    candidateQueries: 0,
  };
  const state = { candidates, botsWithoutReactions: [] as string[] };
  const repository: DemoBotRepository & {
    setCandidates(value: DemoBotTripCandidate[]): void;
    setBotsWithoutReactions(value: string[]): void;
  } = {
    async listDemoBotTripCandidates() {
      calls.candidateQueries += 1;
      return state.candidates;
    },
    async addParticipant(actor) {
      calls.joined.push(actor);
    },
    async updatePreferences(userId, _tripId, input) {
      calls.preferences.push({ userId, input });
      return 1;
    },
    async latestCityIds() {
      return ["city-1", "city-2"];
    },
    async listBotUserIdsWithoutReactions() {
      return state.botsWithoutReactions;
    },
    async setReaction(userId, _tripId, input) {
      calls.reactions.push({ userId, ...input });
    },
    setCandidates(value) {
      state.candidates = value;
    },
    setBotsWithoutReactions(value) {
      state.botsWithoutReactions = value;
    },
  };
  return { repository, calls };
}

const baseCandidate: DemoBotTripCandidate = {
  tripId: "82010282-0000-4000-8000-000000000001",
  expectedParticipants: 3,
  participants: 1,
  readyCount: 1,
  periodFrom: new Date("2026-08-22T15:00:00Z"),
  periodTo: new Date("2026-08-23T18:00:00Z"),
  hasDestinations: false,
};

describe("demo bots", () => {
  it("joins a fresh trip and submits ready constraints", async () => {
    const { repository, calls } = fakeRepository([baseCandidate]);
    const bots = new DemoBots({
      repository,
      random: () => 0.5,
      now: () => new Date("2026-08-20T10:00:00Z"),
    });
    await bots.tick();
    expect(calls.joined).toHaveLength(1);
    expect(calls.joined[0]!.displayName).toMatch(/^Bot /);
    expect(calls.preferences).toHaveLength(1);
    const input = calls.preferences[0]!.input;
    expect(input.ready).toBe(true);
    expect(input.originCityId).toBeTruthy();
    expect(input.availableFrom).toBe("2026-08-22T15:00:00.000Z");
    expect(input.mustReturnBy).toBe("2026-08-23T18:00:00.000Z");
  });

  it("does not join trips without a ready participant", async () => {
    const { repository, calls } = fakeRepository([
      { ...baseCandidate, readyCount: 0 },
    ]);
    await new DemoBots({ repository }).tick();
    expect(calls.joined).toHaveLength(0);
  });

  it("does not join full trips but votes once results exist", async () => {
    const { repository, calls } = fakeRepository([
      {
        ...baseCandidate,
        participants: 3,
        readyCount: 3,
        hasDestinations: true,
      },
    ]);
    repository.setBotsWithoutReactions(["bot-1", "bot-2"]);
    await new DemoBots({ repository, random: () => 0.1 }).tick();
    expect(calls.joined).toHaveLength(0);
    expect(calls.preferences).toHaveLength(0);
    expect(calls.reactions.length).toBeGreaterThanOrEqual(2);
    expect(
      calls.reactions.every(({ cityId }) =>
        ["city-1", "city-2"].includes(cityId),
      ),
    ).toBe(true);
  });

  it("skips voting when bots already reacted", async () => {
    const { repository, calls } = fakeRepository([
      {
        ...baseCandidate,
        participants: 3,
        readyCount: 3,
        hasDestinations: true,
      },
    ]);
    repository.setBotsWithoutReactions([]);
    await new DemoBots({ repository }).tick();
    expect(calls.reactions).toHaveLength(0);
  });

  it("keeps ticking after a failing candidate", async () => {
    const { repository } = fakeRepository([baseCandidate, baseCandidate]);
    repository.addParticipant = async () => {
      throw new Error("db down");
    };
    const errors: unknown[] = [];
    const bots = new DemoBots({
      repository,
      onError: (error) => errors.push(error),
    });
    await bots.tick();
    expect(errors).toHaveLength(2);
  });
});
