import { describe, expect, it } from "vitest";
import { createDatabase } from "./db.js";

const describeDatabase = process.env.DATABASE_URL ? describe : describe.skip;

describeDatabase("PostgreSQL readiness", () => {
  it("connects to the configured test database", async () => {
    const database = createDatabase(process.env.DATABASE_URL!);
    await expect(database.checkReadiness()).resolves.toBeUndefined();
    await database.close();
  });
});
