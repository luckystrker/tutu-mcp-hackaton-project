import {
  AuthSessionSchema,
  DevAuthInputSchema,
  TelegramAuthInputSchema,
} from "@rendezvous/contracts";
import type { FastifyPluginAsync } from "fastify";
import type { SessionService } from "../auth/session-service.js";
import { createRateLimiter } from "../rate-limit.js";

export const authRoutes: FastifyPluginAsync<{
  sessions: SessionService;
  allowDevAuth: boolean;
}> = async (app, options) => {
  const limiter = createRateLimiter({
    windowMs: 60_000,
    message: "Too many authentication attempts",
  });

  app.post("/api/auth/telegram", async (request) => {
    limiter.check(request.ip, 10);
    const { initData } = TelegramAuthInputSchema.parse(request.body);
    return AuthSessionSchema.parse(
      await options.sessions.authenticateTelegram(initData),
    );
  });

  if (options.allowDevAuth)
    app.post("/api/auth/dev", async (request) => {
      limiter.check(request.ip, 10);
      const input = DevAuthInputSchema.parse(request.body);
      return AuthSessionSchema.parse(
        await options.sessions.authenticateDev(input.userId, input.displayName),
      );
    });
};
