import {
  CreateTripResponseSchema,
  FinalTripDtoSchema,
  ExplainResponseSchema,
  TripOrganizerDtoSchema,
  type CreateTripInput,
  type DestinationResultDto,
  type FinalTripDto,
  type ExplainInput,
  type ExplainResponse,
  type ScoringConfig,
  type SetReactionInput,
  type TripOrganizerDto,
  type UpdatePreferencesInput,
} from "@rendezvous/contracts";
import type { RendezvousApi, TripView } from "../features/trips/api.js";
import { DEMO_PARTICIPANTS } from "@rendezvous/domain/fixtures";
import { DEMO_TRIP_IDS } from "./ids.js";
export { DEMO_TRIP_IDS } from "./ids.js";

const participantIds = [
  "41000000-0000-4000-8000-000000000001",
  "41000000-0000-4000-8000-000000000002",
  "41000000-0000-4000-8000-000000000003",
  "41000000-0000-4000-8000-000000000004",
] as const;
const originCityIds = [
  "42000000-0000-4000-8000-000000000001",
  "42000000-0000-4000-8000-000000000002",
  "42000000-0000-4000-8000-000000000003",
] as const;
const cityIds = [
  "42100000-0000-4000-8000-000000000001",
  "42100000-0000-4000-8000-000000000002",
  "42100000-0000-4000-8000-000000000003",
] as const;
const now = "2026-09-01T12:00:00.000Z";

const destinations: readonly DestinationResultDto[] = [
  destination(0, "Казань", 91.4, [96, 78, 86, 94, 89], 2_460),
  destination(1, "Нижний Новгород", 87.8, [87, 92, 82, 88, 91], 2_280),
  destination(2, "Ярославль", 82.1, [82, 88, 76, 80, 85], 2_100),
];

function destination(
  index: 0 | 1 | 2,
  name: string,
  score: number,
  components: [number, number, number, number, number],
  commonTimeMinutes: number,
): DestinationResultDto {
  return {
    resultId: `43000000-0000-4000-8000-00000000000${index + 1}`,
    city: { id: cityIds[index], name, country: "RU" },
    rank: index + 1,
    score,
    components: {
      together: components[0],
      cost: components[1],
      travel: components[2],
      synchronization: components[3],
      fairness: components[4],
    },
    commonTimeMinutes,
    routes: participantIds.slice(0, 3).map((participantId, routeIndex) => ({
      participantId,
      mode: routeIndex === 2 ? "air" : "train",
      outboundDepartureAt: `2026-09-04T${17 + routeIndex}:00:00.000Z`,
      outboundArrivalAt: `2026-09-04T${20 + routeIndex}:00:00.000Z`,
      returnDepartureAt: `2026-09-06T${17 - routeIndex}:00:00.000Z`,
      returnArrivalAt: `2026-09-06T${20 - routeIndex}:00:00.000Z`,
      estimatedCost: { amount: 5_400 + routeIndex * 1_100, currency: "RUB" },
    })),
    hotels: [
      {
        id: `hotel-${index}`,
        cityId: cityIds[index],
        name: index === 0 ? "Дом у Кремля" : "Городской отель",
        totalPrice: { amount: 9_600 + index * 1_400, currency: "RUB" },
        rating: 9.1 - index * 0.3,
        checkIn: "2026-09-05",
        checkOut: "2026-09-06",
        fetchedAt: now,
        source: "tutu",
      },
    ],
    valid: true,
    checkedAt: now,
    degraded: false,
    reactions: { love: index + 1, ok: 1, dislike: 0, mine: null },
  };
}

function makeView(
  id: string,
  options: {
    status?: TripOrganizerDto["trip"]["status"];
    computeStatus?: TripOrganizerDto["trip"]["computeStatus"];
    ready?: number;
    destinations?: readonly DestinationResultDto[];
    degraded?: boolean;
  } = {},
): TripOrganizerDto {
  const result = options.destinations ?? destinations;
  return TripOrganizerDtoSchema.parse({
    trip: {
      id,
      title: "Сентябрьский побег",
      expectedParticipants: 4,
      status: options.status ?? "LIVE",
      computeStatus: options.computeStatus ?? "idle",
      revision: 4,
      rankingVersion: 1,
      minTogetherMinutes: 1_200,
      periodFrom: "2026-09-04T12:00:00.000Z",
      periodTo: "2026-09-06T21:00:00.000Z",
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
    },
    participants: DEMO_PARTICIPANTS.map(({ displayName }, index) => ({
      id: participantIds[index],
      displayName,
      ready: index < (options.ready ?? 3),
      suitability: index < (options.ready ?? 3) ? "suitable" : "unknown",
    })),
    me: {
      id: participantIds[0],
      tripId: id,
      displayName: "Данил",
      originCityId: originCityIds[0],
      availableFrom: "2026-09-04T15:00:00.000Z",
      mustReturnBy: "2026-09-06T20:00:00.000Z",
      maxBudget: { amount: 15_000, currency: "RUB" },
      forbiddenModes: [],
      softPreferences: { preferDirect: true, destinationTags: ["history"] },
      ready: true,
      createdAt: now,
      updatedAt: now,
    },
    destinations: result.map((item) => ({
      ...item,
      degraded: options.degraded ?? item.degraded,
    })),
    shortlist: {
      cityIds:
        options.status === "SHORTLIST" ? result.map((d) => d.city.id) : [],
      revision: options.status === "SHORTLIST" ? 4 : null,
      stale: false,
    },
    capabilities: {
      canEditSettings: options.status !== "FINALIZED",
      canShortlist: (options.status ?? "LIVE") === "LIVE",
      canFinalize: options.status === "SHORTLIST",
      canCancel: !["FINALIZED", "CANCELLED"].includes(options.status ?? "LIVE"),
    },
  });
}

export const FIXTURE_TRIPS: Readonly<Record<string, TripOrganizerDto>> = {
  [DEMO_TRIP_IDS.live]: makeView(DEMO_TRIP_IDS.live),
  [DEMO_TRIP_IDS.running]: makeView(DEMO_TRIP_IDS.running, {
    computeStatus: "running",
    ready: 3,
  }),
  [DEMO_TRIP_IDS.degraded]: makeView(DEMO_TRIP_IDS.degraded, {
    computeStatus: "degraded",
    degraded: true,
  }),
  [DEMO_TRIP_IDS.empty]: makeView(DEMO_TRIP_IDS.empty, { destinations: [] }),
  [DEMO_TRIP_IDS.failed]: makeView(DEMO_TRIP_IDS.failed, {
    computeStatus: "failed",
    destinations: [],
  }),
  [DEMO_TRIP_IDS.final]: makeView(DEMO_TRIP_IDS.final, {
    status: "FINALIZED",
    ready: 4,
  }),
};

export class FixtureRendezvousApi implements RendezvousApi {
  readonly #views = new Map(
    Object.entries(FIXTURE_TRIPS).map(([id, value]) => [
      id,
      structuredClone(value),
    ]),
  );

  async listTrips() {
    await fixtureDelay();
    return [...this.#views.values()]
      .map(({ trip }) => TripOrganizerDtoSchema.shape.trip.parse(trip))
      .sort((left, right) => right.updatedAt.localeCompare(left.updatedAt));
  }

  async getTrip(id: string): Promise<TripView> {
    await fixtureDelay();
    return TripOrganizerDtoSchema.parse(
      this.#views.get(id) ?? FIXTURE_TRIPS[DEMO_TRIP_IDS.live],
    );
  }

  async getFinal(id: string): Promise<FinalTripDto> {
    const view = (await this.getTrip(id)) as TripOrganizerDto;
    const destination = view.destinations[0]!;
    return FinalTripDtoSchema.parse({
      trip: view.trip,
      city: destination.city,
      score: destination.score,
      components: destination.components,
      commonTimeMinutes: destination.commonTimeMinutes,
      myRoute:
        destination.routes.find(
          ({ participantId }) => participantId === view.me.id,
        ) ?? null,
      hotel: destination.hotels[0] ?? null,
      hotelAssumption: destination.hotels[0]
        ? {
            guests: destination.routes.length,
            rooms: Math.ceil(destination.routes.length / 2),
            allocation: "equal-minor-units",
          }
        : null,
      checkedAt: destination.checkedAt,
      degraded: destination.degraded,
      finalizedAt: now,
    });
  }

  async explain(id: string, input: ExplainInput): Promise<ExplainResponse> {
    const view = await this.getTrip(id);
    if (input.type === "counterfactual")
      return ExplainResponseSchema.parse({
        source: "template",
        factsVersion: "explanation-facts-v1",
        text: "Попробуйте немного увеличить доступное время вместе.",
        facts: { type: "counterfactual", city: null, changes: [] },
      });
    const cityId = input.type === "why" ? input.cityId : input.cityA;
    const referenceId =
      input.type === "compare"
        ? input.cityB
        : view.destinations.find(({ city }) => city.id !== cityId)?.city.id;
    const city = view.destinations.find((item) => item.city.id === cityId)!;
    const reference = view.destinations.find(
      (item) => item.city.id === referenceId,
    );
    return ExplainResponseSchema.parse({
      source: "template",
      factsVersion: "explanation-facts-v1",
      text: `${city.city.name} даёт группе хороший баланс времени и дороги.`,
      facts: {
        type: input.type,
        city: city.city,
        reference: reference?.city ?? null,
        scoreDelta: city.score - (reference?.score ?? city.score),
        commonTimeDeltaMinutes:
          city.commonTimeMinutes -
          (reference?.commonTimeMinutes ?? city.commonTimeMinutes),
        groupCostDelta: { amount: 0, currency: "RUB" },
        travelTimeDeltaMinutes: 0,
        affectedParticipant: null,
        strongestComponent: "together",
      },
    });
  }

  async retryComputation(id: string): Promise<TripView> {
    const view = structuredClone(await this.getTrip(id)) as TripOrganizerDto;
    view.trip.revision += 1;
    view.trip.computeStatus = "running";
    this.#views.set(id, view);
    return TripOrganizerDtoSchema.parse(view);
  }

  async getInvite(id: string) {
    await this.getTrip(id);
    const inviteToken = "abcdefghijklmnopqrstuv";
    return {
      inviteToken,
      startAppUrl: `${window.location.origin}/join/${inviteToken}`,
    };
  }

  async createTrip(input: CreateTripInput) {
    const view = makeView(DEMO_TRIP_IDS.live, { ready: 1, destinations: [] });
    view.trip.title = input.title;
    this.#views.set(view.trip.id, view);
    return CreateTripResponseSchema.parse({
      trip: view.trip,
      inviteToken: "abcdefghijklmnopqrstuv",
    });
  }

  async joinTrip(_inviteToken: string): Promise<TripView> {
    return this.getTrip(DEMO_TRIP_IDS.live);
  }

  async updateMyPreferences(
    id: string,
    input: UpdatePreferencesInput,
  ): Promise<TripView> {
    const view = structuredClone(await this.getTrip(id)) as TripOrganizerDto;
    view.me = { ...view.me, ...input, updatedAt: new Date().toISOString() };
    this.#views.set(id, view);
    return TripOrganizerDtoSchema.parse(view);
  }

  async updateScoring(id: string, scoring: ScoringConfig): Promise<TripView> {
    const view = structuredClone(await this.getTrip(id)) as TripOrganizerDto;
    view.trip.scoringConfig = scoring;
    view.trip.rankingVersion += 1;
    view.destinations = view.destinations
      .map((item) => ({ ...item, score: weightedScore(item, scoring) }))
      .sort((left, right) => right.score - left.score)
      .map((item, index) => ({ ...item, rank: index + 1 }));
    this.#views.set(id, view);
    return TripOrganizerDtoSchema.parse(view);
  }

  async setReaction(id: string, input: SetReactionInput): Promise<TripView> {
    const view = structuredClone(await this.getTrip(id)) as TripOrganizerDto;
    const destination = view.destinations.find(
      ({ city }) => city.id === input.cityId,
    );
    if (destination) {
      const current = destination.reactions ?? {
        love: 0,
        ok: 0,
        dislike: 0,
        mine: null,
      };
      if (current.mine)
        current[current.mine] = Math.max(0, current[current.mine] - 1);
      current[input.value] += 1;
      current.mine = input.value;
      destination.reactions = current;
    }
    this.#views.set(id, view);
    return TripOrganizerDtoSchema.parse(view);
  }

  async setShortlist(
    id: string,
    cityIds: readonly string[],
  ): Promise<TripView> {
    const view = structuredClone(await this.getTrip(id)) as TripOrganizerDto;
    view.trip.status = "SHORTLIST";
    view.shortlist = {
      cityIds: [...cityIds],
      revision: view.trip.revision,
      stale: false,
    };
    view.destinations = view.destinations.filter(({ city }) =>
      cityIds.includes(city.id),
    );
    view.capabilities.canShortlist = false;
    view.capabilities.canFinalize = true;
    this.#views.set(id, view);
    return TripOrganizerDtoSchema.parse(view);
  }

  async finalize(
    id: string,
    destinationResultId: string,
  ): Promise<FinalTripDto> {
    const view = structuredClone(await this.getTrip(id)) as TripOrganizerDto;
    const selected = view.destinations.find(
      ({ resultId }) => resultId === destinationResultId,
    );
    if (selected) view.destinations = [selected];
    view.trip.status = "FINALIZED";
    view.capabilities.canFinalize = false;
    view.capabilities.canEditSettings = false;
    view.capabilities.canCancel = false;
    this.#views.set(id, view);
    return this.getFinal(id);
  }
}

function weightedScore(item: DestinationResultDto, scoring: ScoringConfig) {
  const total = Object.values(scoring).reduce((sum, value) => sum + value, 0);
  const score = Object.entries(scoring).reduce(
    (sum, [key, value]) =>
      sum + item.components[key as keyof typeof item.components] * value,
    0,
  );
  return Math.round((score / total) * 100) / 100;
}

function fixtureDelay(): Promise<void> {
  return new Promise((resolve) => setTimeout(resolve, 80));
}
