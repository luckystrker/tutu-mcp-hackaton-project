import { afterEach, describe, expect, it, vi } from "vitest";
import { createLlmClient, LlmError } from "./llm-client.js";

const fetchMock = vi.fn<typeof fetch>();
afterEach(() => {
  fetchMock.mockReset();
  vi.unstubAllGlobals();
});

function stubFetch(response: Response) {
  fetchMock.mockResolvedValue(response);
  vi.stubGlobal("fetch", fetchMock);
}

function okResponse(content: string | unknown[]) {
  return new Response(
    JSON.stringify({ choices: [{ message: { role: "assistant", content } }] }),
    { status: 200, headers: { "content-type": "application/json" } },
  );
}

function client(
  overrides: Partial<Parameters<typeof createLlmClient>[0]> = {},
) {
  return createLlmClient({
    baseUrl: new URL("https://llm.example/v1"),
    model: "test-model",
    apiKey: "super-secret-key",
    timeoutMs: 5_000,
    ...overrides,
  });
}

describe("LLM client", () => {
  it("sends the API key in the Authorization header", async () => {
    stubFetch(okResponse("hello"));
    const llm = client();
    await llm.complete([{ role: "user", content: "hi" }]);
    const [url, init] = fetchMock.mock.calls[0]!;
    expect(String(url)).toBe("https://llm.example/v1/chat/completions");
    expect(init?.method).toBe("POST");
    expect((init?.headers as Record<string, string>).authorization).toBe(
      "Bearer super-secret-key",
    );
  });

  it("posts the model and messages", async () => {
    stubFetch(okResponse("ok"));
    const llm = client();
    await llm.complete([
      { role: "system", content: "be brief" },
      { role: "user", content: "hi" },
    ]);
    const [, init] = fetchMock.mock.calls[0]!;
    expect(JSON.parse(init!.body as string)).toMatchObject({
      model: "test-model",
      messages: [
        { role: "system", content: "be brief" },
        { role: "user", content: "hi" },
      ],
    });
  });

  it("returns the assistant text", async () => {
    stubFetch(okResponse("Hello there"));
    const llm = client();
    await expect(llm.complete([{ role: "user", content: "hi" }])).resolves.toBe(
      "Hello there",
    );
  });

  it("requests JSON output when json is set", async () => {
    stubFetch(okResponse('{"ok":true}'));
    const llm = client();
    await llm.complete([{ role: "user", content: "hi" }], { json: true });
    const [, init] = fetchMock.mock.calls[0]!;
    expect(JSON.parse(init!.body as string)).toMatchObject({
      response_format: { type: "json_object" },
    });
  });

  it("classifies a 401 as a non-retryable auth failure", async () => {
    stubFetch(new Response("unauthorized", { status: 401 }));
    const llm = client();
    const error = await llm
      .complete([{ role: "user", content: "hi" }])
      .catch((e) => e);
    expect(error).toBeInstanceOf(LlmError);
    expect(error.code).toBe("AUTH");
    expect(error.retryable).toBe(false);
    expect(error.statusCode).toBe(401);
  });

  it("classifies 429 and 5xx as retryable provider failures", async () => {
    for (const status of [429, 502, 503]) {
      stubFetch(new Response("error", { status }));
      const llm = client();
      const error = await llm
        .complete([{ role: "user", content: "hi" }])
        .catch((e) => e);
      expect(error.code).toBe("PROVIDER");
      expect(error.retryable).toBe(true);
      expect(error.statusCode).toBe(status);
      fetchMock.mockReset();
    }
  });

  it("rejects malformed responses", async () => {
    stubFetch(okResponse(123 as never));
    const llm = client();
    const error = await llm
      .complete([{ role: "user", content: "hi" }])
      .catch((e) => e);
    expect(error).toBeInstanceOf(LlmError);
    expect(error.code).toBe("INVALID_RESPONSE");
    expect(error.retryable).toBe(false);
  });

  it("maps an internal timeout to a retryable timeout error", async () => {
    fetchMock.mockRejectedValue(
      Object.assign(new DOMException("timeout", "TimeoutError")),
    );
    vi.stubGlobal("fetch", fetchMock);
    const llm = client({ timeoutMs: 5 });
    const error = await llm
      .complete([{ role: "user", content: "hi" }])
      .catch((e) => e);
    expect(error).toBeInstanceOf(LlmError);
    expect(error.code).toBe("TIMEOUT");
    expect(error.retryable).toBe(true);
  });
});
