import type {
  CreateTripInput,
  CreateTripResponse,
  ScoringConfig,
  SetReactionInput,
  TripGroupDto,
  TripOrganizerDto,
  TripPublic,
  UpdatePreferencesInput,
  UpdateTripSettingsInput,
} from "@rendezvous/contracts";
import { rescore, type SolverOutput } from "@rendezvous/solver";
import type { Actor } from "./actor.js";
import { ApplicationError } from "./errors.js";
import { projectAggregate, projectSolverOutput } from "./projection.js";
import type { TripRepository } from "../repositories/trip-repository.js";

export class TripService {
  constructor(
    private readonly repository: TripRepository,
    private readonly publicCities: ReadonlyMap<
      string,
      { id: string; name: string; country: string }
    >,
  ) {}

  async createTrip(
    actor: Actor,
    input: CreateTripInput,
  ): Promise<CreateTripResponse> {
    const created = await this.repository.createTrip(actor, input);
    const { organizerUserId: _, ...trip } = created.trip;
    return { trip, inviteToken: created.inviteToken };
  }

  async joinTrip(
    actor: Actor,
    tripId: string,
    inviteToken: string,
  ): Promise<TripGroupDto | TripOrganizerDto> {
    await this.repository.joinTrip(actor, tripId, inviteToken);
    return this.getTrip(actor, tripId);
  }

  async joinByInvite(
    actor: Actor,
    inviteToken: string,
  ): Promise<TripGroupDto | TripOrganizerDto> {
    const tripId = await this.repository.resolveInvite(inviteToken);
    return this.joinTrip(actor, tripId, inviteToken);
  }

  async getTrip(
    actor: Actor,
    tripId: string,
  ): Promise<TripGroupDto | TripOrganizerDto> {
    return projectAggregate(
      await this.repository.getAggregate(actor.userId, tripId),
    );
  }

  async listTrips(actor: Actor): Promise<readonly TripPublic[]> {
    return (await this.repository.listTrips(actor.userId)).map(
      ({ organizerUserId: _, ...trip }) => trip,
    );
  }

  async rotateInviteToken(actor: Actor, tripId: string): Promise<string> {
    return this.repository.rotateInviteToken(actor.userId, tripId);
  }

  async updatePreferences(
    actor: Actor,
    tripId: string,
    input: UpdatePreferencesInput,
  ): Promise<TripGroupDto | TripOrganizerDto> {
    this.requireKnownCities([input.originCityId]);
    await this.repository.updatePreferences(actor.userId, tripId, input);
    return this.getTrip(actor, tripId);
  }

  async updateSettings(
    actor: Actor,
    tripId: string,
    input: UpdateTripSettingsInput,
  ): Promise<TripGroupDto | TripOrganizerDto> {
    await this.repository.updateSettings(actor.userId, tripId, input);
    return this.getTrip(actor, tripId);
  }

  async updateScoring(
    actor: Actor,
    tripId: string,
    scoring: ScoringConfig,
  ): Promise<TripGroupDto | TripOrganizerDto> {
    const updated = await this.repository.updateScoring(
      actor.userId,
      tripId,
      scoring,
    );
    if (updated.solverOutput) {
      const ready = await this.readyParticipants(tripId);
      if (coversParticipants(updated.solverOutput, ready)) {
        const output = rescore(updated.solverOutput, ready, scoring);
        const destinations = projectSolverOutput(output, this.publicCities);
        await this.repository.persistRescore(
          tripId,
          updated.trip.revision,
          updated.trip.rankingVersion,
          output,
          destinations,
        );
      }
    }
    return this.getTrip(actor, tripId);
  }

  async setReaction(
    actor: Actor,
    tripId: string,
    input: SetReactionInput,
  ): Promise<void> {
    this.requireKnownCities([input.cityId]);
    await this.repository.setReaction(actor.userId, tripId, input);
  }

  async deleteReaction(
    actor: Actor,
    tripId: string,
    cityId: string,
  ): Promise<void> {
    await this.repository.deleteReaction(actor.userId, tripId, cityId);
  }

  async setShortlist(
    actor: Actor,
    tripId: string,
    cityIds: readonly string[],
  ): Promise<void> {
    this.requireKnownCities(cityIds);
    await this.repository.setShortlist(actor.userId, tripId, cityIds);
  }

  async transition(
    actor: Actor,
    tripId: string,
    action: "reopen" | "cancel",
  ): Promise<void> {
    await this.repository.transition(actor.userId, tripId, action);
  }

  async leave(actor: Actor, tripId: string): Promise<void> {
    await this.repository.leave(actor.userId, tripId);
  }

  async finalize(actor: Actor, tripId: string, destinationResultId: string) {
    return this.repository.finalize(actor.userId, tripId, destinationResultId);
  }

  async listEventsAfter(actor: Actor, tripId: string, afterId: number) {
    return this.repository.listEventsAfter(actor.userId, tripId, afterId);
  }

  private requireKnownCities(cityIds: readonly string[]): void {
    for (const cityId of cityIds) {
      if (!this.publicCities.has(cityId))
        throw new ApplicationError(
          "UNKNOWN_CITY",
          422,
          `Unknown city: ${cityId}`,
        );
    }
  }

  private async readyParticipants(
    tripId: string,
  ): Promise<Parameters<typeof rescore>[1]> {
    const privateTrip = await this.repository.getPrivateTrip(tripId);
    return privateTrip.participants.filter(
      (participant) => participant.ready,
    ) as Parameters<typeof rescore>[1];
  }
}

function coversParticipants(
  solverOutput: SolverOutput,
  participants: readonly { id: string }[],
): boolean {
  const participantIds = new Set(participants.map(({ id }) => id));
  return solverOutput.allFeasible
    .flatMap((destination) => destination.groupFrontier)
    .flatMap((solution) => solution.bundles)
    .every(({ participantId }) => participantIds.has(participantId));
}
