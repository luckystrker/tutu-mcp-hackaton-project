import { z } from "zod";

export const EntityIdSchema = z.uuid();
export const IsoDateTimeSchema = z.iso.datetime({ offset: true });
export const CurrencySchema = z.literal("RUB");
export const NonEmptyTextSchema = z.string().trim().min(1).max(200);

export const MoneySchema = z.strictObject({
  amount: z
    .number()
    .finite()
    .nonnegative()
    .refine((amount) => Math.round(amount * 100) / 100 === amount, {
      message: "Money amount must have no more than two decimal places",
    }),
  currency: CurrencySchema,
});

export const ApiErrorSchema = z.strictObject({
  error: z.strictObject({
    code: z.string().trim().min(1),
    message: z.string().trim().min(1),
    requestId: z.string().trim().min(1),
    details: z.unknown().optional(),
  }),
});

export const LivenessSchema = z.strictObject({ status: z.literal("ok") });
export const ReadinessSchema = z.discriminatedUnion("status", [
  z.strictObject({
    status: z.literal("ok"),
    dependencies: z.strictObject({ database: z.literal("ok") }),
  }),
  z.strictObject({
    status: z.literal("unavailable"),
    dependencies: z.strictObject({ database: z.literal("unavailable") }),
  }),
]);

export type EntityId = z.infer<typeof EntityIdSchema>;
export type IsoDateTime = z.infer<typeof IsoDateTimeSchema>;
export type Money = z.infer<typeof MoneySchema>;
export type ApiError = z.infer<typeof ApiErrorSchema>;
export type Liveness = z.infer<typeof LivenessSchema>;
export type Readiness = z.infer<typeof ReadinessSchema>;
