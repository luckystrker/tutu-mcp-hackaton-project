import { createHash } from "node:crypto";
import { CITY_CATALOG } from "@rendezvous/domain";
import type { UpdatePreferencesInput } from "@rendezvous/contracts";
import type { Actor } from "../application/actor.js";

export const DEMO_BOT_NAME_PREFIX = "Bot";

const BOT_NAMES = [
  "Anna",
  "Mark",
  "Sofia",
  "Timur",
  "Vera",
  "Egor",
  "Lera",
  "Pavel",
  "Nika",
  "Greg",
] as const;

const BOT_NAMESPACE = "3f7b8a52-9d1e-4f6a-b5c4-2a8d9e0f1b23";

/** Deterministic RFC 4122 v5 UUID so bot identities survive restarts. */
function uuidV5(name: string): string {
  const hash = createHash("sha1")
    .update(BOT_NAMESPACE.replace(/-/g, ""), "hex")
    .update(name, "utf8")
    .digest();
  hash[6] = (hash[6]! & 0x0f) | 0x50;
  hash[8] = (hash[8]! & 0x3f) | 0x80;
  const hex = hash.toString("hex");
  return [
    hex.slice(0, 8),
    hex.slice(8, 12),
    hex.slice(12, 16),
    hex.slice(16, 20),
    hex.slice(20, 32),
  ].join("-");
}

function botActor(tripId: string, slot: number): Actor {
  const name = BOT_NAMES[slot % BOT_NAMES.length]!;
  return {
    userId: uuidV5(`${tripId}:${slot}`),
    displayName: `${DEMO_BOT_NAME_PREFIX} ${name}`,
  };
}

const HUB_CITY_IDS = [...CITY_CATALOG]
  .sort((left, right) => right.hubScore - left.hubScore)
  .slice(0, 40)
  .map(({ id }) => id);

export interface DemoBotTripCandidate {
  tripId: string;
  expectedParticipants: number;
  participants: number;
  readyCount: number;
  periodFrom: Date | null;
  periodTo: Date | null;
  hasDestinations: boolean;
}

export interface DemoBotRepository {
  listDemoBotTripCandidates(
    freshWindowHours?: number,
  ): Promise<readonly DemoBotTripCandidate[]>;
  addParticipant(actor: Actor, tripId: string): Promise<void>;
  updatePreferences(
    actorId: string,
    tripId: string,
    input: UpdatePreferencesInput,
  ): Promise<number>;
  latestCityIds(tripId: string): Promise<readonly string[]>;
  listBotUserIdsWithoutReactions(tripId: string): Promise<readonly string[]>;
  setReaction(
    actorId: string,
    tripId: string,
    input: { cityId: string; value: "love" | "ok" | "dislike" },
  ): Promise<void>;
}

export interface DemoBotsOptions {
  repository: DemoBotRepository;
  intervalMs?: number;
  now?: () => Date;
  random?: () => number;
  onError?: (error: unknown) => void;
}

/**
 * Local-testing helper: fake participants that join fresh trips, fill their
 * constraints and vote on the computed ranking. Enabled only through
 * DEMO_BOTS=true outside production.
 */
export class DemoBots {
  private readonly repository: DemoBotRepository;
  private readonly intervalMs: number;
  private readonly now: () => Date;
  private readonly random: () => number;
  private readonly onError: (error: unknown) => void;
  private timer: NodeJS.Timeout | undefined;
  private running = false;

  constructor(options: DemoBotsOptions) {
    this.repository = options.repository;
    this.intervalMs = options.intervalMs ?? 15_000;
    this.now = options.now ?? (() => new Date());
    this.random = options.random ?? Math.random;
    this.onError = options.onError ?? (() => {});
  }

  start(): void {
    if (this.timer) return;
    this.timer = setInterval(() => {
      void this.tick();
    }, this.intervalMs);
    this.timer.unref();
  }

  stop(): void {
    if (this.timer) clearInterval(this.timer);
    this.timer = undefined;
  }

  async tick(): Promise<void> {
    if (this.running) return;
    this.running = true;
    try {
      const candidates = await this.repository.listDemoBotTripCandidates();
      for (const candidate of candidates) {
        await this.processCandidate(candidate);
      }
    } finally {
      this.running = false;
    }
  }

  private async processCandidate(
    candidate: DemoBotTripCandidate,
  ): Promise<void> {
    try {
      if (
        candidate.participants < candidate.expectedParticipants &&
        candidate.readyCount >= 1
      ) {
        const actor = botActor(candidate.tripId, candidate.participants);
        await this.repository.addParticipant(actor, candidate.tripId);
        await this.repository.updatePreferences(
          actor.userId,
          candidate.tripId,
          this.botPreferences(candidate.periodFrom, candidate.periodTo),
        );
        return;
      }
      if (candidate.readyCount >= 2 && candidate.hasDestinations)
        await this.vote(candidate.tripId);
    } catch (error) {
      this.onError(error);
    }
  }

  private botPreferences(
    periodFrom: Date | null,
    periodTo: Date | null,
  ): UpdatePreferencesInput {
    const now = this.now();
    const from = periodFrom ?? new Date(now.getTime() + 86_400_000);
    const to = periodTo ?? new Date(now.getTime() + 3 * 86_400_000);
    const cityId =
      HUB_CITY_IDS[Math.floor(this.random() * HUB_CITY_IDS.length)]!;
    return {
      originCityId: cityId,
      availableFrom: from.toISOString(),
      mustReturnBy: to.toISOString(),
      maxBudget: {
        amount: 10_000 + Math.round(this.random() * 20_000),
        currency: "RUB",
      },
      forbiddenModes: this.random() < 0.25 ? ["air"] : [],
      softPreferences: {},
      ready: true,
    };
  }

  private async vote(tripId: string): Promise<void> {
    const botIds = await this.repository.listBotUserIdsWithoutReactions(tripId);
    if (!botIds.length) return;
    const cityIds = await this.repository.latestCityIds(tripId);
    if (!cityIds.length) return;
    for (const botId of botIds) {
      if (cityIds[0])
        await this.repository.setReaction(botId, tripId, {
          cityId: cityIds[0],
          value: this.random() < 0.8 ? "love" : "ok",
        });
      if (cityIds[1] && this.random() < 0.5)
        await this.repository.setReaction(botId, tripId, {
          cityId: cityIds[1],
          value: "ok",
        });
    }
  }
}

export { botActor };
