import { z } from "zod";

const EmptyStringToUndefinedSchema = z.literal("").transform(() => undefined);
const OptionalTextSchema = z
  .union([z.string().trim().min(1), EmptyStringToUndefinedSchema])
  .optional();

const TrustProxySchema = OptionalTextSchema.transform((value) => {
  if (value === undefined) return undefined;
  if (value === "true") return true;
  if (value === "false") return false;
  const hops = Number(value);
  return Number.isInteger(hops) && hops >= 0 ? hops : value;
});

export const AppConfigSchema = z
  .object({
    NODE_ENV: z
      .enum(["development", "test", "production"])
      .default("development"),
    HOST: z.string().trim().min(1).default("0.0.0.0"),
    PORT: z.coerce.number().int().min(1).max(65_535).default(3000),
    TRUST_PROXY: TrustProxySchema,
    DATABASE_URL: z
      .url()
      .refine(
        (url) =>
          url.startsWith("postgresql://") || url.startsWith("postgres://"),
        "Expected a PostgreSQL URL",
      ),
    TELEGRAM_BOT_TOKEN: OptionalTextSchema,
    TELEGRAM_BOT_USERNAME: OptionalTextSchema,
    TELEGRAM_MINI_APP_SHORT_NAME: OptionalTextSchema,
    TUTU_MCP_URL: z.url().default("https://mcp.tutu.ru/mcp"),
    PUBLIC_MINI_APP_URL: z.url(),
    LLM_PROVIDER: OptionalTextSchema,
    LLM_MODEL: OptionalTextSchema,
    LLM_BASE_URL: z.union([z.url(), EmptyStringToUndefinedSchema]).optional(),
    LLM_API_KEY: OptionalTextSchema,
  })
  .superRefine((config, context) => {
    if (config.NODE_ENV === "production" && !config.TELEGRAM_BOT_TOKEN) {
      context.addIssue({
        code: "custom",
        path: ["TELEGRAM_BOT_TOKEN"],
        message: "Required in production",
      });
    }
    if (
      config.NODE_ENV === "production" &&
      (!config.TELEGRAM_BOT_USERNAME || !config.TELEGRAM_MINI_APP_SHORT_NAME)
    ) {
      context.addIssue({
        code: "custom",
        path: ["TELEGRAM_BOT_USERNAME"],
        message: "Telegram bot username and Mini App short name are required",
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
    if (Boolean(config.LLM_PROVIDER) !== Boolean(config.LLM_API_KEY)) {
      context.addIssue({
        code: "custom",
        path: ["LLM_API_KEY"],
        message: "LLM_API_KEY must be set when LLM_PROVIDER is set",
      });
    }
  });

export type AppConfig = z.infer<typeof AppConfigSchema>;

export function loadConfig(environment: NodeJS.ProcessEnv): AppConfig {
  return AppConfigSchema.parse(environment);
}
