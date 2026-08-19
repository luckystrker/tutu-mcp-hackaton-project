import { createHmac } from "node:crypto";
import { describe, expect, it } from "vitest";
import { verifyTelegramInitData } from "./telegram.js";

const botToken = "123456:test-token";
const now = new Date("2026-08-19T12:00:00.000Z");

describe("Telegram initData verifier", () => {
  it("accepts an authentic fresh payload", () => {
    expect(
      verifyTelegramInitData({ initData: signedInitData(), botToken, now }),
    ).toMatchObject({
      telegramUserId: "123456789",
      displayName: "Анна Тестова",
      authDate: now,
    });
  });

  it("rejects signature tampering and a substituted user", () => {
    const tampered = new URLSearchParams(signedInitData());
    tampered.set("user", JSON.stringify({ id: 123456789, first_name: "Ева" }));
    expect(() =>
      verifyTelegramInitData({
        initData: tampered.toString(),
        botToken,
        now,
      }),
    ).toThrowError(/invalid/i);
  });

  it("rejects expired payloads", () => {
    expect(() =>
      verifyTelegramInitData({
        initData: signedInitData(Math.floor(now.getTime() / 1_000) - 601),
        botToken,
        now,
      }),
    ).toThrowError(/expired/i);
  });
});

function signedInitData(authDate = Math.floor(now.getTime() / 1_000)) {
  const params = new URLSearchParams({
    auth_date: String(authDate),
    query_id: "AAHdF6IQAAAAAN0XohDhrOrc",
    user: JSON.stringify({
      id: 123456789,
      first_name: "Анна",
      last_name: "Тестова",
      language_code: "ru",
    }),
  });
  const dataCheckString = [...params.entries()]
    .sort(([left], [right]) => left.localeCompare(right))
    .map(([key, value]) => `${key}=${value}`)
    .join("\n");
  const secret = createHmac("sha256", "WebAppData").update(botToken).digest();
  params.set(
    "hash",
    createHmac("sha256", secret).update(dataCheckString).digest("hex"),
  );
  return params.toString();
}
