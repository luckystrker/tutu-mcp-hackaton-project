import type { RouteOption, SoftPreferences } from "@rendezvous/contracts";
import type { SoftPenaltyBreakdown } from "./model.js";
import { clamp, mean } from "./numeric.js";

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
  const active: number[] = [];
  if (preferences.avoidNightTravel) active.push(penalties.nightTravel);
  if (preferences.preferDirect) active.push(penalties.transfers);
  if (preferences.preferMorningArrival) active.push(penalties.arrivalWindow);
  if (preferences.maxTravelHoursPreferred !== undefined) {
    active.push(
      totalTravelMinutes === undefined
        ? penalties.maxTravelHours
        : clamp(
            (totalTravelMinutes / 60 - preferences.maxTravelHoursPreferred) /
              preferences.maxTravelHoursPreferred,
          ),
    );
  }
  return active.length === 0 ? 0 : clamp(mean(active));
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
