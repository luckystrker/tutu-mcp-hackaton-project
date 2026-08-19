export const EPSILON = 1e-9;

export class SolverError extends Error {
  constructor(
    readonly code: "INVALID_NUMBER" | "INVALID_INPUT" | "UNSUPPORTED_VERSION",
    message: string,
  ) {
    super(message);
    this.name = "SolverError";
  }
}

export function clamp(value: number, minimum = 0, maximum = 1): number {
  assertFinite(value, "clamp value");
  return Math.min(maximum, Math.max(minimum, value));
}

export function mean(values: readonly number[]): number {
  if (values.length === 0)
    throw new SolverError(
      "INVALID_INPUT",
      "Cannot calculate mean of an empty set",
    );
  const result = values.reduce((sum, value) => sum + value, 0) / values.length;
  assertFinite(result, "mean");
  return result;
}

export function toMinorUnits(amount: number): number {
  assertFinite(amount, "money");
  const minor = Math.round(amount * 100);
  if (
    amount < 0 ||
    !Number.isSafeInteger(minor) ||
    Math.abs(minor / 100 - amount) > 1e-7
  ) {
    throw new SolverError(
      "INVALID_NUMBER",
      "Money must be non-negative with at most two decimal places",
    );
  }
  return minor;
}

export function fromMinorUnits(amount: number): number {
  if (!Number.isSafeInteger(amount))
    throw new SolverError("INVALID_NUMBER", "Invalid minor money units");
  return amount / 100;
}

export function minutesBetween(start: string, end: string): number {
  const startAt = Date.parse(start);
  const endAt = Date.parse(end);
  if (!Number.isFinite(startAt) || !Number.isFinite(endAt))
    throw new SolverError("INVALID_INPUT", "Invalid datetime");
  return (endAt - startAt) / 60_000;
}

export function requiredMinutesBetween(start: string, end: string): number {
  return Math.max(0, Math.ceil(minutesBetween(start, end)));
}

export function assertFinite(value: number, label: string): void {
  if (!Number.isFinite(value))
    throw new SolverError("INVALID_NUMBER", `${label} must be finite`);
}

export function compareNumber(left: number, right: number): number {
  return Math.abs(left - right) <= EPSILON ? 0 : left < right ? -1 : 1;
}
