import { describe, expect, it, vi } from "vitest";
import { createShutdown } from "./lifecycle.js";

describe("process lifecycle", () => {
  it("closes HTTP before PostgreSQL and is idempotent", async () => {
    const calls: string[] = [];
    const closeServer = vi.fn(async () => {
      calls.push("server");
    });
    const closeDatabase = vi.fn(async () => {
      calls.push("database");
    });
    const shutdown = createShutdown({ closeServer, closeDatabase });

    await Promise.all([shutdown(), shutdown()]);

    expect(calls).toEqual(["server", "database"]);
    expect(closeServer).toHaveBeenCalledOnce();
    expect(closeDatabase).toHaveBeenCalledOnce();
  });
});
