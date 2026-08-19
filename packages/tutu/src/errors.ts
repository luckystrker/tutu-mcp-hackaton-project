import type { ProviderFailure, ProviderFailureCode } from "./types.js";

export class TutuProviderError extends Error {
  readonly code: ProviderFailureCode;
  readonly tool: string;
  readonly retryable: boolean;
  readonly statusCode?: number;

  constructor(options: {
    code: ProviderFailureCode;
    tool: string;
    message: string;
    retryable: boolean;
    statusCode?: number;
    cause?: unknown;
  }) {
    super(options.message, { cause: options.cause });
    this.name = "TutuProviderError";
    this.code = options.code;
    this.tool = options.tool;
    this.retryable = options.retryable;
    if (options.statusCode !== undefined) this.statusCode = options.statusCode;
  }

  toFailure(): ProviderFailure {
    return {
      code: this.code,
      tool: this.tool,
      retryable: this.retryable,
      message: this.message,
    };
  }
}

export function classifyProviderError(
  error: unknown,
  tool: string,
): TutuProviderError {
  if (error instanceof TutuProviderError) return error;
  if (isAbortError(error))
    return new TutuProviderError({
      code: "ABORTED",
      tool,
      message: "Tutu request was aborted",
      retryable: false,
      cause: error,
    });
  const message = safeErrorMessage(error);
  const statusCode = extractStatusCode(error, message);
  if (/timed?\s*out|timeout/i.test(message)) {
    return new TutuProviderError({
      code: "TIMEOUT",
      tool,
      message: "Tutu request timed out",
      retryable: true,
      cause: error,
    });
  }
  if (statusCode === 429 || /rate.?limit|too many requests/i.test(message)) {
    return new TutuProviderError({
      code: "RATE_LIMIT",
      tool,
      message: "Tutu rate limit reached",
      retryable: true,
      ...(statusCode === undefined ? {} : { statusCode }),
      cause: error,
    });
  }
  return new TutuProviderError({
    code: "PROVIDER",
    tool,
    message: "Tutu provider request failed",
    retryable: statusCode === undefined || statusCode >= 500,
    ...(statusCode === undefined ? {} : { statusCode }),
    cause: error,
  });
}

function safeErrorMessage(error: unknown): string {
  if (error instanceof Error) return error.message.slice(0, 500);
  return String(error).slice(0, 500);
}

function extractStatusCode(
  error: unknown,
  message: string,
): number | undefined {
  if (
    typeof error === "object" &&
    error !== null &&
    "status" in error &&
    typeof error.status === "number"
  )
    return error.status;
  const match = /\b(4\d\d|5\d\d)\b/.exec(message);
  return match ? Number(match[1]) : undefined;
}

function isAbortError(error: unknown): boolean {
  return error instanceof DOMException
    ? error.name === "AbortError"
    : error instanceof Error && error.name === "AbortError";
}
