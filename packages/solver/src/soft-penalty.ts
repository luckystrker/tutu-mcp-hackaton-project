import type { RouteOption, SoftPreferences } from "@rendezvous/contracts";
import type { SoftPenaltyBreakdown } from "./model.js";
import { clamp, mean } from "./numeric.js";

export const SOFT_PENALTY_WEIGHTS = {
  nightTravel: 1,
  transfers: 1,
  arrivalWindow: 1,
  maxTravelHours: 1,
} as const;

export function calculatePenaltyBreakdown(
  outbound: RouteOption,
  returning: RouteOption,
  originTimeZone: string,
  destinationTimeZone: string,
  preferredMaxHours?: number,
): SoftPenaltyBreakdown {
  const totalTravelHours =
    (outbound.durationMinutes + returning.durationMinutes) / 60;
  return {
    nightTravel: mean([
      nightInstantPenalty(outbound.departureAt, originTimeZone),
      nightInstantPenalty(returning.departureAt, destinationTimeZone),
    ]),
    transfers: clamp(
      ((outbound.transfers ?? 0) + (returning.transfers ?? 0)) / 4,
    ),
    arrivalWindow: morningArrivalPenalty(
      outbound.arrivalAt,
      destinationTimeZone,
    ),
    maxTravelHours:
      preferredMaxHours === undefined
        ? 0
        : clamp((totalTravelHours - preferredMaxHours) / preferredMaxHours),
  };
}

export function aggregateSoftPenalty(
  penalties: SoftPenaltyBreakdown,
  preferences: SoftPreferences,
  totalTravelMinutes?: number,
): number {
  const active: Array<{ value: number; weight: number }> = [];
  if (preferences.avoidNightTravel)
    active.push({
      value: penalties.nightTravel,
      weight: SOFT_PENALTY_WEIGHTS.nightTravel,
    });
  if (preferences.preferDirect)
    active.push({
      value: penalties.transfers,
      weight: SOFT_PENALTY_WEIGHTS.transfers,
    });
  if (preferences.preferMorningArrival)
    active.push({
      value: penalties.arrivalWindow,
      weight: SOFT_PENALTY_WEIGHTS.arrivalWindow,
    });
  if (preferences.maxTravelHoursPreferred !== undefined) {
    active.push({
      value:
        totalTravelMinutes === undefined
          ? penalties.maxTravelHours
          : clamp(
              (totalTravelMinutes / 60 - preferences.maxTravelHoursPreferred) /
                preferences.maxTravelHoursPreferred,
            ),
      weight: SOFT_PENALTY_WEIGHTS.maxTravelHours,
    });
  }
  if (active.length === 0) return 0;
  const totalWeight = active.reduce((sum, { weight }) => sum + weight, 0);
  return clamp(
    active.reduce((sum, { value, weight }) => sum + value * weight, 0) /
      totalWeight,
  );
}

function nightInstantPenalty(instant: string, timeZone: string): number {
  const hour = localHour(instant, timeZone);
  return hour >= 23 || hour < 6 ? 1 : 0;
}

function morningArrivalPenalty(instant: string, timeZone: string): number {
  const hour = localHour(instant, timeZone);
  if (hour >= 6 && hour <= 12) return 0;
  const distance = hour < 6 ? 6 - hour : hour - 12;
  return clamp(distance / 6);
}

function localHour(instant: string, timeZone: string): number {
  const hour = new Intl.DateTimeFormat("en-US", {
    timeZone,
    hour: "2-digit",
    hourCycle: "h23",
  })
    .formatToParts(new Date(instant))
    .find(({ type }) => type === "hour")?.value;
  if (hour === undefined)
    throw new TypeError(`Cannot resolve local hour for ${timeZone}`);
  return Number(hour);
}
