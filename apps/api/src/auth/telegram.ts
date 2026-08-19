import { createHmac, timingSafeEqual } from "node:crypto";
import { z } from "zod";
import { ApplicationError } from "../application/errors.js";

const TelegramUserSchema = z.strictObject({
  id: z.number().int().positive().safe(),
  first_name: z.string().trim().min(1).max(200),
  last_name: z.string().trim().max(200).optional(),
  username: z.string().trim().max(64).optional(),
  language_code: z.string().trim().max(16).optional(),
  is_premium: z.boolean().optional(),
  allows_write_to_pm: z.boolean().optional(),
  photo_url: z.url().optional(),
});

export type VerifiedTelegramIdentity = {
  telegramUserId: string;
  displayName: string;
  authDate: Date;
};

export function verifyTelegramInitData(options: {
  initData: string;
  botToken: string;
  now?: Date;
  maxAgeSeconds?: number;
  futureSkewSeconds?: number;
}): VerifiedTelegramIdentity {
  const params = new URLSearchParams(options.initData);
  const hash = params.get("hash");
  if (!hash || !/^[a-f0-9]{64}$/i.test(hash)) invalid();
  const entries = [...params.entries()].filter(([key]) => key !== "hash");
  if (new Set(entries.map(([key]) => key)).size !== entries.length) invalid();
  const dataCheckString = entries
    .sort(([left], [right]) => left.localeCompare(right))
    .map(([key, value]) => `${key}=${value}`)
    .join("\n");
  const secret = createHmac("sha256", "WebAppData")
    .update(options.botToken)
    .digest();
  const expected = createHmac("sha256", secret)
    .update(dataCheckString)
    .digest();
  const supplied = Buffer.from(hash, "hex");
  if (
    supplied.length !== expected.length ||
    !timingSafeEqual(supplied, expected)
  )
    invalid();

  const authDateSeconds = Number(params.get("auth_date"));
  if (!Number.isSafeInteger(authDateSeconds)) invalid();
  const nowSeconds = Math.floor((options.now ?? new Date()).getTime() / 1_000);
  if (authDateSeconds > nowSeconds + (options.futureSkewSeconds ?? 30))
    invalid();
  if (nowSeconds - authDateSeconds > (options.maxAgeSeconds ?? 600))
    throw new ApplicationError(
      "TELEGRAM_AUTH_EXPIRED",
      401,
      "Telegram auth data expired",
    );
  let rawUser: unknown;
  try {
    rawUser = JSON.parse(params.get("user") ?? "null");
  } catch {
    invalid();
  }
  const user = TelegramUserSchema.safeParse(rawUser);
  if (!user.success) invalid();
  return {
    telegramUserId: String(user.data.id),
    displayName: [user.data.first_name, user.data.last_name]
      .filter(Boolean)
      .join(" ")
      .slice(0, 200),
    authDate: new Date(authDateSeconds * 1_000),
  };
}

function invalid(): never {
  throw new ApplicationError(
    "INVALID_TELEGRAM_AUTH",
    401,
    "Telegram auth data is invalid",
  );
}
