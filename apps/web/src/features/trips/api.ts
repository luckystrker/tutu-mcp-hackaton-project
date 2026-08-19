import type {
  CreateTripInput,
  CreateTripResponse,
  ScoringConfig,
  TripGroupDto,
  TripOrganizerDto,
  UpdatePreferencesInput,
} from "@rendezvous/contracts";

export type TripView = TripGroupDto | TripOrganizerDto;

export interface RendezvousApi {
  getTrip(id: string): Promise<TripView>;
  createTrip(input: CreateTripInput): Promise<CreateTripResponse>;
  joinTrip(inviteToken: string): Promise<TripView>;
  updateMyPreferences(
    id: string,
    input: UpdatePreferencesInput,
  ): Promise<TripView>;
  updateScoring(id: string, input: ScoringConfig): Promise<TripView>;
}
