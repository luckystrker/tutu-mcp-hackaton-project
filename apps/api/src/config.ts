import { z } from "zod";

const EmptyStringToUndefinedSchema = z.literal("").transform(() => undefined);
const OptionalTextSchema = z
  .union([z.string().trim().min(1), EmptyStringToUndefinedSchema])
  .optional();

export const AppConfigSchema = z
  .object({
    NODE_ENV: z
      .enum(["development", "test", "production"])
      .default("development"),
    HOST: z.string().trim().min(1).default("0.0.0.0"),
    PORT: z.coerce.number().int().min(1).max(65_535).default(3000),
    DATABASE_URL: z
      .url()
      .refine(
        (url) =>
          url.startsWith("postgresql://") || url.startsWith("postgres://"),
        "Expected a PostgreSQL URL",
      ),
    TELEGRAM_BOT_TOKEN: OptionalTextSchema,
    TUTU_MCP_URL: z.url().default("https://mcp.tutu.ru/mcp"),
    PUBLIC_MINI_APP_URL: z.url(),
    LLM_PROVIDER: OptionalTextSchema,
    LLM_MODEL: OptionalTextSchema,
    LLM_BASE_URL: z.union([z.url(), EmptyStringToUndefinedSchema]).optional(),
  })
  .superRefine((config, context) => {
    if (config.NODE_ENV === "production" && !config.TELEGRAM_BOT_TOKEN) {
      context.addIssue({
        code: "custom",
        path: ["TELEGRAM_BOT_TOKEN"],
        message: "Required in production",
      });
    }
    if (Boolean(config.LLM_PROVIDER) !== Boolean(config.LLM_MODEL)) {
      context.addIssue({
        code: "custom",
        path: ["LLM_MODEL"],
        message: "LLM_PROVIDER and LLM_MODEL must be set together",
      });
    }
    if (Boolean(config.LLM_PROVIDER) !== Boolean(config.LLM_BASE_URL)) {
      context.addIssue({
        code: "custom",
        path: ["LLM_BASE_URL"],
        message: "LLM_BASE_URL must be set when LLM_PROVIDER is set",
      });
    }
  });

export type AppConfig = z.infer<typeof AppConfigSchema>;

export function loadConfig(environment: NodeJS.ProcessEnv): AppConfig {
  return AppConfigSchema.parse(environment);
}
