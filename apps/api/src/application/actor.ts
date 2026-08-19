import { z } from "zod";
import { ApplicationError } from "./errors.js";
import type { ActorAuthenticator } from "../auth/session-service.js";

const ActorIdSchema = z.uuid();

export type Actor = { userId: string; displayName: string };

export function actorFromHeaders(
  headers: Record<string, string | string[] | undefined>,
): Actor {
  const parsed = ActorIdSchema.safeParse(headers["x-user-id"]);
  if (!parsed.success)
    throw new ApplicationError(
      "UNAUTHORIZED",
      401,
      "Temporary test identity is required",
    );
  const rawName = headers["x-user-name"];
  const encodedName = (Array.isArray(rawName) ? rawName[0] : rawName)?.trim();
  const displayName = decodeDisplayName(encodedName) || "Test user";
  return { userId: parsed.data, displayName: displayName.slice(0, 200) };
}

export const headerAuthenticator: ActorAuthenticator = {
  async authenticate(headers) {
    return actorFromHeaders(
      headers as Record<string, string | string[] | undefined>,
    );
  },
};

function decodeDisplayName(value: string | undefined): string {
  if (!value) return "";
  try {
    return decodeURIComponent(value);
  } catch {
    return value;
  }
}
