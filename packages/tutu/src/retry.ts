import { classifyProviderError, TutuProviderError } from "./errors.js";

export async function callWithRetry<T>(options: {
  tool: string;
  signal: AbortSignal;
  timeoutMs: number;
  retries?: number;
  operation: (signal: AbortSignal) => Promise<T>;
}): Promise<T> {
  const startedAt = Date.now();
  const retries = options.retries ?? 1;
  let lastError: TutuProviderError | undefined;

  for (let attempt = 0; attempt <= retries; attempt += 1) {
    options.signal.throwIfAborted();
    const remainingMs = options.timeoutMs - (Date.now() - startedAt);
    if (remainingMs <= 0) throw timeoutError(options.tool, lastError);
    try {
      return await runWithDeadline(
        options.operation,
        options.signal,
        remainingMs,
        options.tool,
      );
    } catch (error) {
      if (options.signal.aborted) throw options.signal.reason ?? error;
      lastError = classifyProviderError(error, options.tool);
      if (!lastError.retryable || attempt === retries) throw lastError;
    }
  }
  throw lastError ?? timeoutError(options.tool);
}

async function runWithDeadline<T>(
  operation: (signal: AbortSignal) => Promise<T>,
  parentSignal: AbortSignal,
  timeoutMs: number,
  tool: string,
): Promise<T> {
  const timeout = new AbortController();
  const timer = setTimeout(() => timeout.abort(timeoutError(tool)), timeoutMs);
  const signal = AbortSignal.any([parentSignal, timeout.signal]);
  try {
    return await operation(signal);
  } catch (error) {
    if (timeout.signal.aborted && !parentSignal.aborted)
      throw timeoutError(tool, error);
    throw error;
  } finally {
    clearTimeout(timer);
  }
}

function timeoutError(tool: string, cause?: unknown): TutuProviderError {
  return new TutuProviderError({
    code: "TIMEOUT",
    tool,
    message: "Tutu request timed out",
    retryable: true,
    ...(cause === undefined ? {} : { cause }),
  });
}
