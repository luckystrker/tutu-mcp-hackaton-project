import { MCPClient } from "@mastra/mcp";
import { TutuProviderError } from "./errors.js";
import type { TutuToolCaller } from "./types.js";

export function createTutuToolCaller(options: {
  url: URL;
  timeoutMs?: number;
}): TutuToolCaller {
  const client = new MCPClient({
    id: `rendezvous-tutu-${crypto.randomUUID()}`,
    servers: {
      tutu: { url: options.url, timeout: options.timeoutMs ?? 10_000 },
    },
    timeout: options.timeoutMs ?? 10_000,
  });
  let toolsPromise: ReturnType<MCPClient["listToolsets"]> | undefined;

  return {
    async call(toolName, input, signal) {
      toolsPromise ??= client.listToolsets().catch((error) => {
        toolsPromise = undefined;
        throw error;
      });
      const tool = (await toolsPromise).tutu?.[toolName];
      if (!tool?.execute)
        throw new TutuProviderError({
          code: "UNSUPPORTED",
          tool: toolName,
          message: `Tutu tool is unavailable: ${toolName}`,
          retryable: false,
        });
      const result = await tool.execute(input, {
        abortSignal: signal,
      } as never);
      return unwrapMcpToolResult(result, toolName);
    },
    close: () => client.disconnect(),
  };
}

export function unwrapMcpToolResult(result: unknown, tool: string): unknown {
  if (isRecord(result) && result.error === true) {
    throw new TutuProviderError({
      code: "INVALID_RESPONSE",
      tool,
      message: "Tutu rejected adapter input",
      retryable: false,
    });
  }
  if (isRecord(result) && result.isError === true) {
    throw new TutuProviderError({
      code: "PROVIDER",
      tool,
      message: "Tutu returned an in-band tool error",
      retryable: true,
    });
  }
  if (isRecord(result) && Array.isArray(result.content)) {
    const text = result.content.find(
      (item) =>
        isRecord(item) && item.type === "text" && typeof item.text === "string",
    );
    if (!isRecord(text) || typeof text.text !== "string") {
      throw new TutuProviderError({
        code: "INVALID_RESPONSE",
        tool,
        message: "Tutu response has no JSON text content",
        retryable: false,
      });
    }
    try {
      return JSON.parse(text.text) as unknown;
    } catch (error) {
      throw new TutuProviderError({
        code: "INVALID_RESPONSE",
        tool,
        message: "Tutu response contains invalid JSON",
        retryable: false,
        cause: error,
      });
    }
  }
  return result;
}

function isRecord(value: unknown): value is Record<string, unknown> {
  return typeof value === "object" && value !== null;
}
