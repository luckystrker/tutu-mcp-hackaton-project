import type {
  ExplainInput,
  ExplainResponse,
  ExplanationFacts,
  PublicCity,
} from "@rendezvous/contracts";
import { localizePublicCity } from "@rendezvous/domain";
import type { SupportedLocale } from "@rendezvous/i18n";
import {
  compareDestinations,
  type DestinationSolution,
} from "@rendezvous/solver";
import type { ExplanationGenerator } from "../llm/explanation-generator.js";
import type {
  ExplanationContext,
  TripRepository,
} from "../repositories/trip-repository.js";
import { ApplicationError } from "./errors.js";

const FACTS_VERSION = "explanation-facts-v1" as const;
const MAX_TEXT_LENGTH = 2_000;
const OMITTED_SUFFIX = {
  en: "Several more complex changes were omitted.",
  ru: "Пропустили ещё несколько более сложных изменений.",
} as const;

export class ExplanationService {
  constructor(
    private readonly repository: TripRepository,
    private readonly cities: ReadonlyMap<string, PublicCity>,
    private readonly generator?: ExplanationGenerator,
  ) {}

  async explain(
    actorId: string,
    tripId: string,
    input: ExplainInput,
    locale: SupportedLocale = "ru",
  ): Promise<ExplainResponse> {
    const context = await this.repository.getExplanationContext(
      actorId,
      tripId,
    );
    const facts = localizeFacts(this.buildFacts(context, input), locale);
    const template = renderExplanation(facts, locale);
    const generated = this.generator
      ? await this.generator.generate(facts, template, locale)
      : { source: "template" as const, text: template };
    return { ...generated, factsVersion: FACTS_VERSION, facts };
  }

  private buildFacts(
    context: ExplanationContext,
    input: ExplainInput,
  ): ExplanationFacts {
    if (input.type === "counterfactual")
      return this.counterfactualFacts(context, input.cityId);
    const ranked = context.solverOutput.ranked;
    const city = requireRanked(
      ranked,
      input.type === "why" ? input.cityId : input.cityA,
    );
    const reference =
      input.type === "compare"
        ? requireRanked(ranked, input.cityB)
        : (ranked.find(({ cityId }) => cityId !== city.cityId) ?? null);
    const comparison = reference
      ? compareDestinations(city, reference)
      : {
          scoreDifference: 0,
          commonTimeDifference: 0,
          costDifference: 0,
          travelTimeDifference: 0,
          mostAffectedParticipantIdInternal: null,
        };
    return {
      type: input.type,
      city: this.requireCity(city.cityId),
      reference: reference ? this.requireCity(reference.cityId) : null,
      scoreDelta: round(comparison.scoreDifference),
      commonTimeDeltaMinutes: comparison.commonTimeDifference,
      groupCostDelta: {
        amount: comparison.costDifference,
        currency: "RUB",
      },
      travelTimeDeltaMinutes: comparison.travelTimeDifference,
      affectedParticipant:
        comparison.mostAffectedParticipantIdInternal === null
          ? null
          : comparison.mostAffectedParticipantIdInternal ===
              context.actorParticipantId
            ? "self"
            : "private",
      strongestComponent: strongestComponent(city),
    };
  }

  private counterfactualFacts(
    context: ExplanationContext,
    cityId: string | undefined,
  ): ExplanationFacts {
    if (cityId && !currentSolverCityIds(context).has(cityId))
      throw new ApplicationError(
        "RESULT_NOT_FOUND",
        404,
        "City is absent from the current result",
      );
    const relaxations = context.solverOutput.relaxations.filter(
      ({ unlockedCities }) => !cityId || unlockedCities.includes(cityId),
    );
    return {
      type: "counterfactual",
      city: cityId ? this.requireCity(cityId) : null,
      changes: relaxations.map((relaxation) => {
        const affectedParticipant =
          relaxation.participantId === null
            ? ("group" as const)
            : relaxation.participantId === context.actorParticipantId
              ? ("self" as const)
              : ("private" as const);
        return {
          constraint: relaxation.type,
          affectedParticipant,
          ...(affectedParticipant === "private" ||
          relaxation.delta === undefined
            ? {}
            : { delta: relaxation.delta }),
          ...(affectedParticipant === "private" || relaxation.mode === undefined
            ? {}
            : { mode: relaxation.mode }),
          unlockedCities: relaxation.unlockedCities.map((id) =>
            this.requireCity(id),
          ),
        };
      }),
    };
  }

  private requireCity(cityId: string): PublicCity {
    const city = this.cities.get(cityId);
    if (!city)
      throw new ApplicationError(
        "RESULT_NOT_FOUND",
        404,
        "Unknown result city",
      );
    return { id: city.id, name: city.name, country: city.country };
  }
}

function requireRanked(
  ranked: readonly DestinationSolution[],
  cityId: string,
): DestinationSolution {
  const city = ranked.find((candidate) => candidate.cityId === cityId);
  if (!city)
    throw new ApplicationError(
      "RESULT_NOT_FOUND",
      404,
      "City is absent from the current ranking",
    );
  return city;
}

function currentSolverCityIds(context: ExplanationContext): Set<string> {
  return new Set([
    ...context.solverOutput.ranked.map(({ cityId }) => cityId),
    ...context.solverOutput.rejected.map(({ cityId }) => cityId),
  ]);
}

function strongestComponent(
  destination: DestinationSolution,
): keyof DestinationSolution["components"] {
  return (
    Object.entries(destination.components) as [
      keyof DestinationSolution["components"],
      number,
    ][]
  ).sort(
    ([leftKey, left], [rightKey, right]) =>
      right - left || leftKey.localeCompare(rightKey),
  )[0]![0];
}

export function renderExplanation(
  facts: ExplanationFacts,
  locale: SupportedLocale = "ru",
): string {
  if (facts.type === "counterfactual") {
    if (facts.changes.length === 0)
      return locale === "ru"
        ? facts.city
          ? `Для ${facts.city.name} нет одного безопасного минимального изменения.`
          : "Нет одного безопасного минимального изменения, которое откроет новый город."
        : facts.city
          ? `There is no single safe minimal change for ${facts.city.name}.`
          : "There is no single safe minimal change that unlocks a new city.";
    return renderChangesWithinBudget(facts.changes, locale);
  }
  const component = componentLabel(facts.strongestComponent, locale);
  if (!facts.reference)
    return locale === "ru"
      ? `${facts.city.name} остаётся единственным подходящим вариантом. Его сильная сторона — ${component}.`
      : `${facts.city.name} remains the only suitable option. Its strongest point is ${component}.`;
  return locale === "ru"
    ? `${facts.city.name}: разница с ${facts.reference.name} — ${signed(facts.scoreDelta)} балла, ${signedMinutes(facts.commonTimeDeltaMinutes, locale)} вместе, ${signedMoney(facts.groupCostDelta.amount)} на группу и ${signedMinutes(facts.travelTimeDeltaMinutes, locale)} в дороге. Сильная сторона — ${component}.`
    : `${facts.city.name}: compared with ${facts.reference.name}, the difference is ${signed(facts.scoreDelta)} points, ${signedMinutes(facts.commonTimeDeltaMinutes, locale)} together, ${signedMoney(facts.groupCostDelta.amount)} for the group and ${signedMinutes(facts.travelTimeDeltaMinutes, locale)} in travel. Its strongest point is ${component}.`;
}

function renderChangesWithinBudget(
  changes: Extract<ExplanationFacts, { type: "counterfactual" }>["changes"],
  locale: SupportedLocale,
): string {
  const sentences: string[] = [];
  let used = 0;
  const suffix = OMITTED_SUFFIX[locale];
  const budget = MAX_TEXT_LENGTH - suffix.length - 1;
  for (const change of changes) {
    const sentence = renderChange(change, locale);
    if (sentences.length > 0 && used + sentence.length + 1 > budget) break;
    sentences.push(sentence);
    used += sentence.length + 1;
  }
  if (sentences.length < changes.length) sentences.push(suffix);
  return sentences.join(" ").slice(0, MAX_TEXT_LENGTH).trimEnd();
}

function renderChange(
  change: Extract<
    ExplanationFacts,
    { type: "counterfactual" }
  >["changes"][number],
  locale: SupportedLocale,
): string {
  const cities = change.unlockedCities.map(({ name }) => name).join(", ");
  if (change.affectedParticipant === "private")
    return locale === "ru"
      ? `Анонимному участнику нужно немного смягчить ${constraintLabel(change.constraint, locale)} — это откроет: ${cities}.`
      : `An anonymous participant needs to relax ${constraintLabel(change.constraint, locale)} slightly, unlocking: ${cities}.`;
  const owner =
    locale === "ru"
      ? change.affectedParticipant === "self"
        ? "Вам"
        : "Группе"
      : change.affectedParticipant === "self"
        ? "You"
        : "The group";
  const delta =
    change.delta === undefined
      ? ""
      : locale === "ru"
        ? ` на ${formatDelta(change, locale)}`
        : ` by ${formatDelta(change, locale)}`;
  const mode = change.mode ? ` (${change.mode})` : "";
  return locale === "ru"
    ? `${owner} достаточно смягчить ${constraintLabel(change.constraint, locale)}${delta}${mode} — это откроет: ${cities}.`
    : `${owner} can relax ${constraintLabel(change.constraint, locale)}${delta}${mode}, unlocking: ${cities}.`;
}

function formatDelta(
  change: Extract<
    ExplanationFacts,
    { type: "counterfactual" }
  >["changes"][number],
  locale: SupportedLocale,
) {
  return change.constraint === "budget"
    ? `${change.delta} ₽`
    : `${change.delta} ${locale === "ru" ? "мин" : "min"}`;
}

function signed(value: number) {
  return `${value > 0 ? "+" : ""}${value}`;
}
function signedMinutes(value: number, locale: SupportedLocale) {
  return `${signed(value)} ${locale === "ru" ? "мин" : "min"}`;
}
function signedMoney(value: number) {
  return `${signed(value)} ₽`;
}
function round(value: number) {
  return Math.round(value * 100) / 100;
}
function componentLabel(
  value: keyof DestinationSolution["components"],
  locale: SupportedLocale,
) {
  const labels = {
    en: {
      together: "time together",
      cost: "cost",
      travel: "shorter travel",
      synchronization: "synchronization",
      fairness: "fairness",
    },
    ru: {
      together: "время вместе",
      cost: "стоимость",
      travel: "короткая дорога",
      synchronization: "синхронность",
      fairness: "справедливость",
    },
  } as const;
  return labels[locale][value];
}
function constraintLabel(value: string, locale: SupportedLocale) {
  return (
    (locale === "ru"
      ? {
          budget: "бюджет",
          departure: "время выезда",
          return: "время возвращения",
          transport: "ограничение транспорта",
          minTogetherTime: "минимальное время вместе",
        }
      : {
          budget: "the budget",
          departure: "the departure time",
          return: "the return time",
          transport: "the transport restriction",
          minTogetherTime: "the minimum time together",
        })[value] ?? value
  );
}

function localizeFacts(
  facts: ExplanationFacts,
  locale: SupportedLocale,
): ExplanationFacts {
  if (facts.type === "counterfactual")
    return {
      ...facts,
      city: facts.city ? localizePublicCity(facts.city, locale) : null,
      changes: facts.changes.map((change) => ({
        ...change,
        unlockedCities: change.unlockedCities.map((city) =>
          localizePublicCity(city, locale),
        ),
      })),
    };
  return {
    ...facts,
    city: localizePublicCity(facts.city, locale),
    reference: facts.reference
      ? localizePublicCity(facts.reference, locale)
      : null,
  };
}
