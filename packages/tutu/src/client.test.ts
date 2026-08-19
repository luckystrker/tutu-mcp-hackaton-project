import { describe, expect, it, vi } from "vitest";
import { createTutuToolCaller, unwrapMcpToolResult } from "./client.js";

const { listToolsets, disconnect } = vi.hoisted(() => ({
  listToolsets: vi.fn(),
  disconnect: vi.fn(),
}));

vi.mock("@mastra/mcp", () => ({
  MCPClient: class {
    constructor() {
      return { listToolsets, disconnect };
    }
  },
}));

describe("MCP response envelope", () => {
  it("unwraps JSON text returned by Mastra", () => {
    expect(
      unwrapMcpToolResult(
        { content: [{ type: "text", text: '{"offers":[]}' }], isError: false },
        "search_rail",
      ),
    ).toEqual({ offers: [] });
  });

  it("rejects invalid and in-band error responses", () => {
    expect(() =>
      unwrapMcpToolResult(
        { content: [{ type: "text", text: "{" }] },
        "search_rail",
      ),
    ).toThrow("invalid JSON");
    expect(() => unwrapMcpToolResult({ isError: true }, "search_rail")).toThrow(
      "in-band",
    );
  });

  it("retries listToolsets after a transient connection failure", async () => {
    listToolsets.mockReset();
    disconnect.mockClear();
    const tool = { execute: vi.fn().mockResolvedValue({ offers: [] }) };
    listToolsets
      .mockRejectedValueOnce(new Error("connect ECONNREFUSED"))
      .mockResolvedValue({ tutu: { search_rail: tool } });
    const caller = createTutuToolCaller({
      url: new URL("https://tutu.example/mcp"),
    });
    const signal = new AbortController().signal;
    await expect(caller.call("search_rail", {}, signal)).rejects.toThrow(
      "ECONNREFUSED",
    );
    await expect(caller.call("search_rail", {}, signal)).resolves.toEqual({
      offers: [],
    });
    expect(listToolsets).toHaveBeenCalledTimes(2);
  });
});
