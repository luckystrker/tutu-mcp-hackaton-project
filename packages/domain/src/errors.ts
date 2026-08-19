export type DomainErrorCode =
  | "PARTICIPANT_NOT_READY"
  | "ORIGIN_REQUIRED"
  | "ORIGIN_NOT_FOUND"
  | "AVAILABLE_FROM_REQUIRED"
  | "MUST_RETURN_BY_REQUIRED"
  | "INVALID_WINDOW"
  | "BUDGET_REQUIRED"
  | "BUDGET_INVALID"
  | "DUPLICATE_FORBIDDEN_MODE"
  | "PARTICIPANT_TRIP_MISMATCH"
  | "INVALID_TRIP_PERIOD"
  | "TRIP_NOT_COMPUTABLE"
  | "PARTICIPANT_LIMIT"
  | "NOT_ENOUGH_READY_PARTICIPANTS"
  | "DUPLICATE_PARTICIPANT"
  | "DUPLICATE_USER";

export type DomainError = {
  code: DomainErrorCode;
  path: string;
  message: string;
};

export type Result<T> =
  { ok: true; value: T } | { ok: false; errors: readonly DomainError[] };

export function success<T>(value: T): Result<T> {
  return { ok: true, value };
}

export function failure<T>(errors: readonly DomainError[]): Result<T> {
  return { ok: false, errors };
}
