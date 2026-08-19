import {
  Pool,
  type PoolClient,
  type QueryResult,
  type QueryResultRow,
} from "pg";

export interface Queryable {
  query<R extends QueryResultRow = QueryResultRow>(
    text: string,
    values?: unknown[],
  ): Promise<QueryResult<R>>;
}

export interface Database extends Queryable {
  checkReadiness(): Promise<void>;
  transaction<T>(operation: (client: Queryable) => Promise<T>): Promise<T>;
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
    query: <R extends QueryResultRow = QueryResultRow>(
      text: string,
      values?: unknown[],
    ) => pool.query<R>(text, values),
    async checkReadiness() {
      await pool.query("SELECT 1");
    },
    async transaction<T>(
      operation: (client: Queryable) => Promise<T>,
    ): Promise<T> {
      const client: PoolClient = await pool.connect();
      let discardClient = false;
      try {
        await client.query("BEGIN");
        const result = await operation(client);
        await client.query("COMMIT");
        return result;
      } catch (error) {
        try {
          await client.query("ROLLBACK");
        } catch {
          discardClient = true;
        }
        throw error;
      } finally {
        client.release(
          discardClient ? new Error("transaction rollback failed") : undefined,
        );
      }
    },
    async close() {
      await pool.end();
    },
  };
}
