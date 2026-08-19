import { describe, expect, it, vi } from "vitest";
import { getReadiness } from "./health.js";

describe("health API client", () => {
  it("validates the readiness response from API", async () => {
    const fetcher = vi.fn().mockResolvedValue({
      json: vi.fn().mockResolvedValue({
        status: "ok",
        dependencies: { database: "ok" },
      }),
    });
    await expect(getReadiness(fetcher)).resolves.toEqual({
      status: "ok",
      dependencies: { database: "ok" },
    });
    expect(fetcher).toHaveBeenCalledWith("/health/ready", {
      headers: { accept: "application/json" },
    });
  });

  it("rejects an incompatible response", async () => {
    const fetcher = vi.fn().mockResolvedValue({
      json: vi.fn().mockResolvedValue({ status: "maybe" }),
    });
    await expect(getReadiness(fetcher)).rejects.toThrow();
  });
});
