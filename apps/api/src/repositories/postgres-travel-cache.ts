import type { CacheEntry, TravelCache } from "@rendezvous/tutu";
import type { Database } from "../db.js";

export class PostgresTravelCache implements TravelCache {
  constructor(private readonly database: Database) {}

  async get<T>(key: string): Promise<CacheEntry<T> | null> {
    const result = await this.database.query<{
      payload: T;
      fetched_at: Date;
      expires_at: Date;
      stale_until: Date;
    }>(
      `SELECT payload,fetched_at,expires_at,stale_until FROM rendezvous.route_cache WHERE cache_key=$1`,
      [key],
    );
    const row = result.rows[0];
    return row
      ? {
          value: row.payload,
          fetchedAt: row.fetched_at.toISOString(),
          expiresAt: row.expires_at.getTime(),
          staleUntil: row.stale_until.getTime(),
        }
      : null;
  }

  async set<T>(key: string, entry: CacheEntry<T>): Promise<void> {
    await this.database.query(
      `INSERT INTO rendezvous.route_cache(cache_key,payload,fetched_at,expires_at,stale_until)
       VALUES($1,$2,$3,$4,$5) ON CONFLICT(cache_key) DO UPDATE SET payload=EXCLUDED.payload,
       fetched_at=EXCLUDED.fetched_at,expires_at=EXCLUDED.expires_at,stale_until=EXCLUDED.stale_until`,
      [
        key,
        JSON.stringify(entry.value),
        entry.fetchedAt,
        new Date(entry.expiresAt).toISOString(),
        new Date(entry.staleUntil).toISOString(),
      ],
    );
  }
}
