import { Pool } from "pg";

export interface Database {
  checkReadiness(): Promise<void>;
  close(): Promise<void>;
}

export function createDatabase(connectionString: string): Database {
  const pool = new Pool({
    connectionString,
    max: 10,
    idleTimeoutMillis: 30_000,
    connectionTimeoutMillis: 3_000,
  });
  return {
    async checkReadiness() {
      await pool.query("SELECT 1");
    },
    async close() {
      await pool.end();
    },
  };
}
