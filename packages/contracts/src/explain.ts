import { z } from "zod";
import { EntityIdSchema } from "./common.js";
import { PublicCitySchema } from "./city.js";
import { TransportModeSchema } from "./participant.js";

export const ExplainInputSchema = z.discriminatedUnion("type", [
  z.strictObject({ type: z.literal("why"), cityId: EntityIdSchema }),
  z.strictObject({
    type: z.literal("compare"),
    cityA: EntityIdSchema,
    cityB: EntityIdSchema,
  }),
  z.strictObject({
    type: z.literal("counterfactual"),
    cityId: EntityIdSchema.optional(),
  }),
]);

const ComparisonExplanationFactsSchema = z.strictObject({
  type: z.enum(["why", "compare"]),
  city: PublicCitySchema,
  reference: PublicCitySchema.nullable(),
  scoreDelta: z.number(),
  commonTimeDeltaMinutes: z.number().int(),
  groupCostDelta: z.strictObject({
    amount: z.number().finite(),
    currency: z.literal("RUB"),
  }),
  travelTimeDeltaMinutes: z.number().int(),
  affectedParticipant: z.enum(["self", "private"]).nullable(),
  strongestComponent: z.enum([
    "together",
    "cost",
    "travel",
    "synchronization",
    "fairness",
  ]),
});

const CounterfactualChangeSchema = z.strictObject({
  constraint: z.enum([
    "budget",
    "departure",
    "return",
    "transport",
    "minTogetherTime",
  ]),
  affectedParticipant: z.enum(["self", "private", "group"]),
  delta: z.number().positive().optional(),
  mode: TransportModeSchema.optional(),
  unlockedCities: z.array(PublicCitySchema),
});

const CounterfactualExplanationFactsSchema = z.strictObject({
  type: z.literal("counterfactual"),
  city: PublicCitySchema.nullable(),
  changes: z.array(CounterfactualChangeSchema),
});

export const ExplanationFactsSchema = z.union([
  ComparisonExplanationFactsSchema,
  CounterfactualExplanationFactsSchema,
]);

export const ExplainResponseSchema = z.strictObject({
  source: z.enum(["template", "llm"]),
  factsVersion: z.literal("explanation-facts-v1"),
  text: z.string().trim().min(1).max(2_000),
  facts: ExplanationFactsSchema,
});

export type ExplainInput = z.infer<typeof ExplainInputSchema>;
export type ExplanationFacts = z.infer<typeof ExplanationFactsSchema>;
export type ExplainResponse = z.infer<typeof ExplainResponseSchema>;
