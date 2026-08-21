import type { SoftPreferences } from "@rendezvous/contracts";
import type { SupportedLocale } from "@rendezvous/i18n";

export function parseNaturalPreference(
  text: string,
  locale: SupportedLocale = "ru",
): SoftPreferences {
  const value = text.toLocaleLowerCase(locale);
  const hours =
    locale === "ru"
      ? /(?:до|не больше)\s*(\d{1,3})\s*(?:ч|час)/.exec(value)
      : /(?:up to|no more than|maximum|max)\s*(\d{1,3})\s*(?:h|hr|hour)/.exec(
          value,
        );
  const tags = new Set<
    NonNullable<SoftPreferences["destinationTags"]>[number]
  >();
  if (/природ|вод|море|озер|парк|nature|water|sea|lake|park/.test(value))
    tags.add("nature");
  if (/истори|музе|архитектур|histor|museum|architectur/.test(value))
    tags.add("history");
  if (/ед|кухн|ресторан|food|cuisine|restaurant/.test(value)) tags.add("food");
  if (/тих|спокой|quiet|calm/.test(value)) tags.add("quiet");
  return {
    ...(/без пересад|прям|direct|no transfer/.test(value)
      ? { preferDirect: true }
      : {}),
    ...(/без ноч|не ночью|no night|avoid night/.test(value)
      ? { avoidNightTravel: true }
      : {}),
    ...(/утром|утрен|morning/.test(value)
      ? { preferMorningArrival: true }
      : {}),
    ...(hours
      ? { maxTravelHoursPreferred: Math.min(168, Number(hours[1])) }
      : {}),
    ...(tags.size ? { destinationTags: [...tags] } : {}),
  };
}

export function classifyNaturalQuestion(
  text: string,
  locale: SupportedLocale,
): "why" | "compare" | "counterfactual" {
  const value = text.toLocaleLowerCase(locale);
  if (/сравн|compar/.test(value)) return "compare";
  if (/измен|если|chang|what if/.test(value)) return "counterfactual";
  return "why";
}
