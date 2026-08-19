import type { SoftPreferences } from "@rendezvous/contracts";

export function parseNaturalPreference(text: string): SoftPreferences {
  const value = text.toLocaleLowerCase("ru-RU");
  const hours = /(?:до|не больше)\s*(\d{1,3})\s*(?:ч|час)/.exec(value);
  const tags = new Set<
    NonNullable<SoftPreferences["destinationTags"]>[number]
  >();
  if (/природ|вод|море|озер|парк/.test(value)) tags.add("nature");
  if (/истори|музе|архитектур/.test(value)) tags.add("history");
  if (/ед|кухн|ресторан/.test(value)) tags.add("food");
  if (/тих|спокой/.test(value)) tags.add("quiet");
  return {
    ...(/без пересад|прям/.test(value) ? { preferDirect: true } : {}),
    ...(/без ноч|не ночью/.test(value) ? { avoidNightTravel: true } : {}),
    ...(/утром|утрен/.test(value) ? { preferMorningArrival: true } : {}),
    ...(hours
      ? { maxTravelHoursPreferred: Math.min(168, Number(hours[1])) }
      : {}),
    ...(tags.size ? { destinationTags: [...tags] } : {}),
  };
}
