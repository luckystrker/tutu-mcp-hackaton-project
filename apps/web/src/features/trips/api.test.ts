// @vitest-environment jsdom

import { afterEach, describe, expect, it, vi } from "vitest";
import { HttpRendezvousApi } from "./api.js";

afterEach(() => vi.unstubAllGlobals());

describe("HTTP rendezvous client", () => {
  it("does not send a JSON content type for a bodyless POST", async () => {
    const fetchMock = vi
      .fn<typeof fetch>()
      .mockResolvedValueOnce(
        Response.json({
          token: "a".repeat(43),
          expiresAt: "2099-01-01T00:00:00.000Z",
          user: {
            id: "10000000-0000-4000-8000-000000000099",
            displayName: "Local user",
          },
        }),
      )
      .mockResolvedValueOnce(
        Response.json({
          inviteToken: "abcdefghijklmnopqrstuv",
          startAppUrl: "http://localhost:5173/join/abcdefghijklmnopqrstuv",
        }),
      );
    vi.stubGlobal("fetch", fetchMock);
    const api = new HttpRendezvousApi("", {
      id: "10000000-0000-4000-8000-000000000099",
      name: "Local user",
    });

    await api.getInvite("10000000-0000-4000-8000-000000000001");

    const [, request] = fetchMock.mock.calls[1]!;
    const headers = new Headers(request?.headers);
    expect(request?.method).toBe("POST");
    expect(request?.body).toBeUndefined();
    expect(headers.has("content-type")).toBe(false);
    expect(headers.get("authorization")).toMatch(/^Bearer /);
  });
});
