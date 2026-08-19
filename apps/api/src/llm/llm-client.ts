import { z } from "zod";

export type LlmMessage =
  | { role: "system"; content: string }
  | { role: "user"; content: string }
  | { role: "assistant"; content: string };

export type LlmCompletionOptions = {
  json?: boolean;
  signal?: AbortSignal;
};

export interface LlmClient {
  complete(
    messages: readonly LlmMessage[],
    options?: LlmCompletionOptions,
  ): Promise<string>;
}

export class LlmError extends Error {
  readonly code:
    | "ABORTED"
    | "TIMEOUT"
    | "RATE_LIMIT"
    | "AUTH"
    | "PROVIDER"
    | "INVALID_RESPONSE";
  readonly retryable: boolean;
  readonly statusCode?: number;

  constructor(options: {
    code: LlmError["code"];
    message: string;
    retryable: boolean;
    statusCode?: number;
    cause?: unknown;
  }) {
    super(options.message, { cause: options.cause });
    this.name = "LlmError";
    this.code = options.code;
    this.retryable = options.retryable;
    if (options.statusCode !== undefined) this.statusCode = options.statusCode;
  }
}

const ChatCompletionSchema = z.object({
  choices: z
    .array(
      z.object({
        message: z.object({
          content: z.union([z.string(), z.array(z.unknown())]),
        }),
      }),
    )
    .min(1),
});

export function createLlmClient(options: {
  baseUrl: URL;
  model: string;
  apiKey: string;
  timeoutMs?: number;
}): LlmClient {
  const timeoutMs = options.timeoutMs ?? 30_000;
  const endpoint = new URL(
    `${options.baseUrl.pathname.replace(/\/$/, "")}/chat/completions`,
    options.baseUrl,
  );

  return {
    async complete(messages, { json, signal } = {}) {
      const timeoutSignal = AbortSignal.timeout(timeoutMs);
      const combined = signal
        ? AbortSignal.any([signal, timeoutSignal])
        : timeoutSignal;
      let response: Response;
      try {
        response = await fetch(endpoint, {
          method: "POST",
          headers: {
            "content-type": "application/json",
            authorization: `Bearer ${options.apiKey}`,
          },
          body: JSON.stringify({
            model: options.model,
            messages: messages as unknown[],
            temperature: 0,
            ...(json ? { response_format: { type: "json_object" } } : {}),
          }),
          signal: combined,
        });
      } catch (error) {
        throw classifyFetchError(error, options.apiKey);
      }
      if (!response.ok) {
        throw new LlmError({
          code:
            response.status === 401 || response.status === 403
              ? "AUTH"
              : "PROVIDER",
          message:
            response.status === 401 || response.status === 403
              ? "LLM rejected the API key"
              : "LLM provider request failed",
          retryable: response.status === 429 || response.status >= 500,
          statusCode: response.status,
        });
      }
      const parsed = ChatCompletionSchema.safeParse(await response.json());
      if (!parsed.success) {
        throw new LlmError({
          code: "INVALID_RESPONSE",
          message: "LLM response does not match the expected schema",
          retryable: false,
        });
      }
      return stringifyContent(parsed.data.choices[0]!.message.content);
    },
  };
}

function stringifyContent(content: string | unknown[]): string {
  if (typeof content === "string") return content;
  return content
    .map((part) => {
      if (typeof part === "string") return part;
      if (
        typeof part === "object" &&
        part !== null &&
        "text" in part &&
        typeof (part as { text: unknown }).text === "string"
      )
        return (part as { text: string }).text;
      return "";
    })
    .join("");
}

function classifyFetchError(error: unknown, apiKey: string): LlmError {
  if (error instanceof LlmError) return error;
  if (error instanceof DOMException && error.name === "TimeoutError")
    return new LlmError({
      code: "TIMEOUT",
      message: "LLM request timed out",
      retryable: true,
      cause: error,
    });
  if (error instanceof DOMException && error.name === "AbortError")
    return new LlmError({
      code: "ABORTED",
      message: "LLM request was aborted",
      retryable: false,
      cause: error,
    });
  if (error instanceof Error && error.name === "TimeoutError")
    return new LlmError({
      code: "TIMEOUT",
      message: "LLM request timed out",
      retryable: true,
      cause: error,
    });
  const message = error instanceof Error ? error.message : String(error);
  const statusCode = /\b(4\d\d|5\d\d)\b/.exec(message);
  if (statusCode) {
    const code = Number(statusCode[1]!);
    if (code === 401 || code === 403)
      return new LlmError({
        code: "AUTH",
        message: "LLM rejected the API key",
        retryable: false,
        statusCode: code,
        cause: error,
      });
  }
  if (/timed?\s*out|timeout/i.test(message))
    return new LlmError({
      code: "TIMEOUT",
      message: "LLM request timed out",
      retryable: true,
      cause: error,
    });
  void apiKey;
  const status = statusCode ? Number(statusCode[1]!) : undefined;
  return new LlmError({
    code: "PROVIDER",
    message: "LLM provider request failed",
    retryable: true,
    ...(status === undefined ? {} : { statusCode: status }),
    cause: error,
  });
}
