import type {
  ExplainInput,
  ExplainResponse,
  ExplanationFacts,
  PublicCity,
} from "@rendezvous/contracts";
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
const OMITTED_SUFFIX = " Пропустили ещё несколько более сложных изменений.";
const CHANGE_BUDGET = MAX_TEXT_LENGTH - OMITTED_SUFFIX.length;

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
  ): Promise<ExplainResponse> {
    const context = await this.repository.getExplanationContext(
      actorId,
      tripId,
    );
    const facts = this.buildFacts(context, input);
    const template = renderExplanation(facts);
    const generated = this.generator
      ? await this.generator.generate(facts, template)
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

export function renderExplanation(facts: ExplanationFacts): string {
  if (facts.type === "counterfactual") {
    if (facts.changes.length === 0)
      return facts.city
        ? `Для ${facts.city.name} нет одного безопасного минимального изменения.`
        : "Нет одного безопасного минимального изменения, которое откроет новый город.";
    return renderChangesWithinBudget(facts.changes);
  }
  const component = componentLabel(facts.strongestComponent);
  if (!facts.reference)
    return `${facts.city.name} остаётся единственным подходящим вариантом. Его сильная сторона — ${component}.`;
  return `${facts.city.name}: разница с ${facts.reference.name} — ${signed(facts.scoreDelta)} балла, ${signedMinutes(facts.commonTimeDeltaMinutes)} вместе, ${signedMoney(facts.groupCostDelta.amount)} на группу и ${signedMinutes(facts.travelTimeDeltaMinutes)} в дороге. Сильная сторона — ${component}.`;
}

function renderChangesWithinBudget(
  changes: Extract<ExplanationFacts, { type: "counterfactual" }>["changes"],
): string {
  const sentences: string[] = [];
  let used = 0;
  for (const change of changes) {
    const sentence = renderChange(change);
    if (sentences.length > 0 && used + sentence.length + 1 > CHANGE_BUDGET)
      break;
    sentences.push(sentence);
    used += sentence.length + 1;
  }
  if (sentences.length < changes.length) sentences.push(OMITTED_SUFFIX.trim());
  return sentences.join(" ").slice(0, MAX_TEXT_LENGTH).trimEnd();
}

function renderChange(
  change: Extract<
    ExplanationFacts,
    { type: "counterfactual" }
  >["changes"][number],
): string {
  const cities = change.unlockedCities.map(({ name }) => name).join(", ");
  if (change.affectedParticipant === "private")
    return `Анонимному участнику нужно немного смягчить ${constraintLabel(change.constraint)} — это откроет: ${cities}.`;
  const owner = change.affectedParticipant === "self" ? "Вам" : "Группе";
  const delta = change.delta === undefined ? "" : ` на ${formatDelta(change)}`;
  const mode = change.mode ? ` (${change.mode})` : "";
  return `${owner} достаточно смягчить ${constraintLabel(change.constraint)}${delta}${mode} — это откроет: ${cities}.`;
}

function formatDelta(
  change: Extract<
    ExplanationFacts,
    { type: "counterfactual" }
  >["changes"][number],
) {
  return change.constraint === "budget"
    ? `${change.delta} ₽`
    : `${change.delta} мин`;
}

function signed(value: number) {
  return `${value > 0 ? "+" : ""}${value}`;
}
function signedMinutes(value: number) {
  return `${signed(value)} мин`;
}
function signedMoney(value: number) {
  return `${signed(value)} ₽`;
}
function round(value: number) {
  return Math.round(value * 100) / 100;
}
function componentLabel(value: keyof DestinationSolution["components"]) {
  return {
    together: "время вместе",
    cost: "стоимость",
    travel: "короткая дорога",
    synchronization: "синхронность",
    fairness: "справедливость",
  }[value];
}
function constraintLabel(value: string) {
  return (
    {
      budget: "бюджет",
      departure: "время выезда",
      return: "время возвращения",
      transport: "ограничение транспорта",
      minTogetherTime: "минимальное время вместе",
    }[value] ?? value
  );
}
