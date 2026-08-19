import type { City, ParticipantPrivate, Trip } from "@rendezvous/contracts";
import { failure, success, type DomainError, type Result } from "../errors.js";
import type { ReadyParticipant } from "./entities.js";

export function validateParticipant(
  participant: ParticipantPrivate,
  trip: Trip,
  cityCatalog: readonly City[],
): Result<ReadyParticipant> {
  const errors: DomainError[] = [];

  if (participant.tripId !== trip.id)
    errors.push(
      error(
        "PARTICIPANT_TRIP_MISMATCH",
        "tripId",
        "Participant belongs to another trip",
      ),
    );
  if (!participant.ready)
    errors.push(
      error(
        "PARTICIPANT_NOT_READY",
        "ready",
        "Participant has not confirmed the profile",
      ),
    );
  if (!participant.originCityId)
    errors.push(
      error("ORIGIN_REQUIRED", "originCityId", "Origin city is required"),
    );
  else if (!cityCatalog.some((city) => city.id === participant.originCityId)) {
    errors.push(
      error(
        "ORIGIN_NOT_FOUND",
        "originCityId",
        "Origin city is absent from the catalog",
      ),
    );
  }
  if (!participant.availableFrom)
    errors.push(
      error(
        "AVAILABLE_FROM_REQUIRED",
        "availableFrom",
        "Departure time is required",
      ),
    );
  if (!participant.mustReturnBy)
    errors.push(
      error(
        "MUST_RETURN_BY_REQUIRED",
        "mustReturnBy",
        "Return deadline is required",
      ),
    );
  if (
    participant.availableFrom &&
    participant.mustReturnBy &&
    Date.parse(participant.availableFrom) >=
      Date.parse(participant.mustReturnBy)
  ) {
    errors.push(
      error(
        "INVALID_WINDOW",
        "mustReturnBy",
        "Return deadline must be later than departure availability",
      ),
    );
  }
  if (!participant.maxBudget)
    errors.push(error("BUDGET_REQUIRED", "maxBudget", "Budget is required"));
  else if (participant.maxBudget.amount <= 0)
    errors.push(
      error("BUDGET_INVALID", "maxBudget.amount", "Budget must be positive"),
    );
  if (
    new Set(participant.forbiddenModes).size !==
    participant.forbiddenModes.length
  ) {
    errors.push(
      error(
        "DUPLICATE_FORBIDDEN_MODE",
        "forbiddenModes",
        "Forbidden transport modes must be unique",
      ),
    );
  }

  if (errors.length > 0) return failure(errors);
  return success(participant as ReadyParticipant);
}

function error(
  code: DomainError["code"],
  path: string,
  message: string,
): DomainError {
  return { code, path, message };
}
