import { z } from "zod";

const EmptyStringToUndefinedSchema = z.literal("").transform(() => undefined);
const OptionalTextSchema = z
  .union([z.string().trim().min(1), EmptyStringToUndefinedSchema])
  .optional();

/** Environment booleans arrive as strings; "false" must stay false. */
const EnvBooleanSchema = z
  .union([z.boolean(), z.enum(["true", "false"]).default("false")])
  .transform((value) => value === true || value === "true");

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
    DEMO_BOTS: EnvBooleanSchema,
    DEMO_BOTS_INTERVAL_MS: z.coerce.number().int().min(1_000).default(15_000),
  })
  .superRefine((config, context) => {
    if (config.NODE_ENV === "production" && !config.TELEGRAM_BOT_TOKEN) {
      context.addIssue({
        code: "custom",
        path: ["TELEGRAM_BOT_TOKEN"],
        message: "Required in production",
      });
    }
    if (config.NODE_ENV === "production" && config.DEMO_BOTS) {
      context.addIssue({
        code: "custom",
        path: ["DEMO_BOTS"],
        message: "Demo bots are only allowed outside production",
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
  });

export type AppConfig = z.infer<typeof AppConfigSchema>;

export function loadConfig(environment: NodeJS.ProcessEnv): AppConfig {
  return AppConfigSchema.parse(environment);
}

const LLM_KEYS = [
  "LLM_PROVIDER",
  "LLM_MODEL",
  "LLM_BASE_URL",
  "LLM_API_KEY",
] as const;

export function resolveLlmConfig(config: AppConfig):
  | {
      enabled: true;
      provider: string;
      model: string;
      baseUrl: URL;
      apiKey: string;
      missing: readonly [];
    }
  | {
      enabled: false;
      requested: boolean;
      missing: readonly (typeof LLM_KEYS)[number][];
    } {
  const missing = LLM_KEYS.filter((key) => !config[key]);
  if (missing.length > 0)
    return {
      enabled: false,
      requested: missing.length < LLM_KEYS.length,
      missing,
    };
  return {
    enabled: true,
    provider: config.LLM_PROVIDER!,
    model: config.LLM_MODEL!,
    baseUrl: new URL(config.LLM_BASE_URL!),
    apiKey: config.LLM_API_KEY!,
    missing: [],
  };
}
