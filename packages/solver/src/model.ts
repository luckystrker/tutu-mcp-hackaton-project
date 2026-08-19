import type {
  HotelOption,
  ParticipantPrivate,
  RouteOption,
  ScoringConfig,
  SoftPreferences,
  TransportMode,
  Trip,
} from "@rendezvous/contracts";

export type ReadySolverParticipant = ParticipantPrivate & {
  originCityId: string;
  availableFrom: string;
  mustReturnBy: string;
  maxBudget: NonNullable<ParticipantPrivate["maxBudget"]>;
  ready: true;
};

export type ComputableSolverTrip = {
  trip: Trip;
  participants: readonly ReadySolverParticipant[];
};

export type ParticipantTravelFacts = {
  participantId: string;
  originTimeZone: string;
  outbound: readonly RouteOption[];
  returns: readonly RouteOption[];
};

export type CandidateTravelFacts = {
  cityId: string;
  destinationTimeZone: string;
  participants: readonly ParticipantTravelFacts[];
  hotels?: readonly HotelOption[];
  fetchedAt: string;
};

export type SoftPenaltyBreakdown = {
  nightTravel: number;
  transfers: number;
  arrivalWindow: number;
  maxTravelHours: number;
};

export type RequiredRelaxations = {
  budgetMinor: number;
  departureMinutes: number;
  returnMinutes: number;
  forbiddenModes: readonly TransportMode[];
};

export type RouteBundle = {
  id: string;
  participantId: string;
  cityId: string;
  outbound: RouteOption;
  returning: RouteOption;
  transportCostMinor: number;
  hotelShareMinor: number;
  estimatedTripCostMinor: number;
  totalTravelMinutes: number;
  presenceStart: string;
  presenceEnd: string;
  penalties: SoftPenaltyBreakdown;
  requiredRelaxations: RequiredRelaxations;
};

export type ParticipantBurden = {
  participantId: string;
  budgetBurden: number;
  timeBurden: number;
  softPenalty: number;
  individualBurden: number;
};

export type ComponentScores = {
  together: number;
  cost: number;
  travel: number;
  synchronization: number;
  fairness: number;
};

export type GroupSolution = {
  cityId: string;
  bundles: readonly RouteBundle[];
  burdens: readonly ParticipantBurden[];
  commonStart: string;
  commonEnd: string;
  commonTimeMinutes: number;
  totalCostMinor: number;
  totalTravelMinutes: number;
  components: ComponentScores;
  score: number;
};

export type DestinationSolution = GroupSolution & {
  rank: number;
  fetchedAt: string;
  hotels: readonly HotelOption[];
  degraded: boolean;
  groupFrontier: readonly GroupSolution[];
};

export type RejectionReasonCode =
  | "NO_PARTICIPANT_FACTS"
  | "NO_ROUTE_PAIR"
  | "DEPARTURE_WINDOW"
  | "RETURN_WINDOW"
  | "FORBIDDEN_MODE"
  | "BUDGET"
  | "MIN_TOGETHER_TIME"
  | "NO_HOTEL_AVAILABILITY"
  | "DOMINATED";

export type RejectedDestination = {
  cityId: string;
  reasons: readonly RejectionReasonCode[];
  affectedParticipantIds: readonly string[];
  maxCommonTimeMinutes: number;
};

export type ConstraintRelaxation = {
  type: "budget" | "departure" | "return" | "transport" | "minTogetherTime";
  participantId: string | null;
  delta?: number;
  mode?: TransportMode;
  unlockedCities: readonly string[];
};

export type ComparisonFacts = {
  cityId: string;
  comparedWithCityId: string;
  travelTimeDifference: number;
  commonTimeDifference: number;
  costDifference: number;
  scoreDifference: number;
  mostAffectedParticipant: "private";
  mostAffectedParticipantIdInternal: string | null;
};

export type SolverInput = {
  trip: ComputableSolverTrip;
  candidates: readonly CandidateTravelFacts[];
  scoring: ScoringConfig;
  algorithmVersion: string;
  scoringAlgorithmVersion?: string;
};

export type SolverOutput = {
  algorithmVersion: string;
  scoringAlgorithmVersion: string;
  scoring: ScoringConfig;
  ranked: readonly DestinationSolution[];
  allFeasible: readonly DestinationSolution[];
  rejected: readonly RejectedDestination[];
  relaxations: readonly ConstraintRelaxation[];
};

export type ScoringPreset = "balanced" | "cheapest" | "fairest" | "more-time";

export type SoftPreferencesByParticipant = ReadonlyMap<string, SoftPreferences>;
