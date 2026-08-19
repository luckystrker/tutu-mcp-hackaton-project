import { createHash, randomBytes, randomUUID } from "node:crypto";
import type { AuthSession } from "@rendezvous/contracts";
import type { Actor } from "../application/actor.js";
import { ApplicationError } from "../application/errors.js";
import type { Database, Queryable } from "../db.js";
import { verifyTelegramInitData } from "./telegram.js";

export interface ActorAuthenticator {
  authenticate(headers: Readonly<Record<string, unknown>>): Promise<Actor>;
}

export class SessionService implements ActorAuthenticator {
  constructor(
    private readonly database: Database,
    private readonly botToken: string,
    private readonly now: () => Date = () => new Date(),
    private readonly sessionTtlMs = 30 * 60_000,
  ) {}

  async authenticateTelegram(initData: string): Promise<AuthSession> {
    const identity = verifyTelegramInitData({
      initData,
      botToken: this.botToken,
      now: this.now(),
    });
    return this.issue(
      identity.displayName,
      identity.telegramUserId,
      identity.authDate,
    );
  }

  async authenticateDev(
    userId: string,
    displayName: string,
  ): Promise<AuthSession> {
    return this.issue(displayName, null, null, userId);
  }

  async authenticate(
    headers: Readonly<Record<string, unknown>>,
  ): Promise<Actor> {
    const authorization = headers.authorization;
    const value = Array.isArray(authorization)
      ? authorization[0]
      : authorization;
    const match =
      typeof value === "string"
        ? /^Bearer ([A-Za-z0-9_-]{43})$/.exec(value)
        : null;
    if (!match) unauthorized();
    const result = await this.database.query<{
      user_id: string;
      display_name: string;
    }>(
      `SELECT s.user_id,u.display_name FROM rendezvous.sessions s
       JOIN rendezvous.users u ON u.id=s.user_id
       WHERE s.token_hash=$1 AND s.revoked_at IS NULL AND s.expires_at>now()`,
      [hashToken(match[1]!)],
    );
    const row = result.rows[0];
    if (!row) unauthorized();
    return { userId: row.user_id, displayName: row.display_name };
  }

  private async issue(
    displayName: string,
    telegramUserId: string | null,
    authDate: Date | null,
    requestedUserId?: string,
  ): Promise<AuthSession> {
    return this.database.transaction(async (client) => {
      await client.query(
        `DELETE FROM rendezvous.sessions
         WHERE expires_at<now() OR revoked_at<now()-interval '1 day'`,
      );
      const user = await upsertUser(
        client,
        displayName,
        telegramUserId,
        requestedUserId,
      );
      await client.query(
        `UPDATE rendezvous.sessions SET revoked_at=now()
         WHERE user_id=$1 AND revoked_at IS NULL`,
        [user.id],
      );
      const token = randomBytes(32).toString("base64url");
      const expiresAt = new Date(this.now().getTime() + this.sessionTtlMs);
      await client.query(
        `INSERT INTO rendezvous.sessions(id,token_hash,user_id,telegram_auth_date,expires_at)
         VALUES($1,$2,$3,$4,$5)`,
        [randomUUID(), hashToken(token), user.id, authDate, expiresAt],
      );
      return {
        token,
        expiresAt: expiresAt.toISOString(),
        user: { id: user.id, displayName: user.display_name },
      };
    });
  }
}

async function upsertUser(
  client: Queryable,
  displayName: string,
  telegramUserId: string | null,
  requestedUserId?: string,
) {
  if (telegramUserId) {
    const result = await client.query<{ id: string; display_name: string }>(
      `INSERT INTO rendezvous.users(id,telegram_user_id,display_name)
       VALUES($1,$2,$3)
       ON CONFLICT(telegram_user_id) DO UPDATE SET display_name=EXCLUDED.display_name
       RETURNING id,display_name`,
      [randomUUID(), telegramUserId, displayName],
    );
    return result.rows[0]!;
  }
  const result = await client.query<{ id: string; display_name: string }>(
    `INSERT INTO rendezvous.users(id,display_name) VALUES($1,$2)
     ON CONFLICT(id) DO UPDATE SET display_name=EXCLUDED.display_name
     RETURNING id,display_name`,
    [requestedUserId ?? randomUUID(), displayName],
  );
  return result.rows[0]!;
}

function hashToken(token: string): string {
  return createHash("sha256").update(token).digest("hex");
}

function unauthorized(): never {
  throw new ApplicationError("UNAUTHORIZED", 401, "Authentication required");
}
