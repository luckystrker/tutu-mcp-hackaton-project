import type { City, ParticipantPrivate, Trip } from "@rendezvous/contracts";
import { failure, success, type DomainError, type Result } from "../errors.js";
import { validateParticipant } from "../participant/invariants.js";
import type { ComputableTrip } from "./entities.js";

export function validateTripForComputation(
  trip: Trip,
  participants: readonly ParticipantPrivate[],
  cityCatalog: readonly City[],
): Result<ComputableTrip> {
  const errors: DomainError[] = [];
  if (trip.status === "FINALIZED" || trip.status === "CANCELLED") {
    errors.push({
      code: "TRIP_NOT_COMPUTABLE",
      path: "status",
      message: `Trip in ${trip.status} state cannot be recomputed`,
    });
  }
  if (
    trip.periodFrom !== null &&
    trip.periodTo !== null &&
    Date.parse(trip.periodFrom) >= Date.parse(trip.periodTo)
  ) {
    errors.push({
      code: "INVALID_TRIP_PERIOD",
      path: "periodTo",
      message: "Trip period end must be later than its start",
    });
  }
  if (
    participants.length > trip.expectedParticipants ||
    participants.length > 4
  ) {
    errors.push({
      code: "PARTICIPANT_LIMIT",
      path: "participants",
      message: "Trip participant limit exceeded",
    });
  }
  if (new Set(participants.map(({ id }) => id)).size !== participants.length) {
    errors.push({
      code: "DUPLICATE_PARTICIPANT",
      path: "participants",
      message: "Participant ids must be unique",
    });
  }
  if (
    new Set(participants.map(({ userId }) => userId)).size !==
    participants.length
  ) {
    errors.push({
      code: "DUPLICATE_USER",
      path: "participants",
      message: "A user can join a trip only once",
    });
  }

  const ready = participants.filter((participant) => participant.ready);
  if (ready.length < 2) {
    errors.push({
      code: "NOT_ENOUGH_READY_PARTICIPANTS",
      path: "participants",
      message: "At least two ready participants are required",
    });
  }
  const validated = ready.map((participant) =>
    validateParticipant(participant, trip, cityCatalog),
  );
  for (const result of validated) if (!result.ok) errors.push(...result.errors);

  if (errors.length > 0) return failure(errors);
  return success({
    trip,
    participants: validated.flatMap((result) =>
      result.ok ? [result.value] : [],
    ),
  });
}
