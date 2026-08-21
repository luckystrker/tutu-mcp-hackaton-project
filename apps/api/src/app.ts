import { ApiErrorSchema, type BuildInfo } from "@rendezvous/contracts";
import Fastify, { type FastifyError, type FastifyServerOptions } from "fastify";
import { ZodError } from "zod";
import { ApplicationError } from "./application/errors.js";
import type { TripService } from "./application/trip-service.js";
import { headerAuthenticator } from "./application/actor.js";
import type {
  ActorAuthenticator,
  SessionService,
} from "./auth/session-service.js";
import { authRoutes } from "./routes/auth.js";
import { healthRoutes } from "./routes/health.js";
import { tripRoutes } from "./routes/trips.js";
import type { InMemoryCollaborationMetrics } from "./observability/collaboration-metrics.js";
import { localizedErrorMessage, requestLocale } from "./localization.js";

export type AppDependencies = {
  readinessCheck: () => Promise<void>;
  tripService?: TripService;
  logger?: FastifyServerOptions["logger"];
  metricsSnapshot?: () => Readonly<Record<string, unknown>>;
  buildInfo?: BuildInfo;
  authenticator?: ActorAuthenticator;
  sessions?: SessionService;
  allowDevAuth?: boolean;
  allowedOrigin?: string;
  inviteUrl?: (token: string) => string;
  trustProxy?: boolean | number | string | undefined;
  collaborationMetrics?: InMemoryCollaborationMetrics;
};

const CODE_BY_STATUS: Record<number, string> = {
  400: "BAD_REQUEST",
  401: "UNAUTHORIZED",
  403: "FORBIDDEN",
  404: "NOT_FOUND",
  405: "METHOD_NOT_ALLOWED",
  409: "CONFLICT",
  422: "VALIDATION_FAILED",
  429: "RATE_LIMITED",
};

function toClientStatusCode(statusCode: unknown): number | undefined {
  return typeof statusCode === "number" &&
    Number.isInteger(statusCode) &&
    statusCode >= 400 &&
    statusCode <= 599
    ? statusCode
    : undefined;
}

export function buildApp(dependencies: AppDependencies) {
  const app = Fastify({
    logger: dependencies.logger ?? false,
    genReqId: (request) =>
      request.headers["x-request-id"]?.toString() ?? crypto.randomUUID(),
    ...(dependencies.trustProxy === undefined
      ? {}
      : {
          trustProxy: dependencies.trustProxy as NonNullable<
            FastifyServerOptions["trustProxy"]
          >,
        }),
  });

  if (dependencies.allowedOrigin) {
    app.addHook("onRequest", async (request, reply) => {
      const origin = request.headers.origin;
      if (origin === dependencies.allowedOrigin) {
        reply.header("access-control-allow-origin", origin);
        reply.header("vary", "Origin, Accept-Language");
        reply.header(
          "access-control-allow-headers",
          "authorization,content-type,last-event-id,accept-language",
        );
        reply.header(
          "access-control-allow-methods",
          "GET,POST,PUT,DELETE,OPTIONS",
        );
      }
      if (request.method === "OPTIONS") return reply.status(204).send();
    });
  }
  app.addHook("onSend", async (_request, reply, payload) => {
    if (!reply.hasHeader("vary")) reply.header("vary", "Accept-Language");
    reply.header("x-content-type-options", "nosniff");
    reply.header("referrer-policy", "no-referrer");
    reply.header(
      "content-security-policy",
      "default-src 'none'; frame-ancestors https://web.telegram.org https://*.telegram.org",
    );
    return payload;
  });

  app.setErrorHandler((error: FastifyError, request, reply) => {
    const statusCode =
      error instanceof ApplicationError
        ? error.statusCode
        : error instanceof ZodError
          ? 422
          : (toClientStatusCode(error.statusCode) ?? 500);
    const isClientError = statusCode < 500;
    request.log[isClientError ? "warn" : "error"](
      { err: error, requestId: request.id },
      "request failed",
    );
    const body = ApiErrorSchema.parse({
      error: {
        code: isClientError
          ? error instanceof ApplicationError
            ? error.code
            : (CODE_BY_STATUS[statusCode] ?? "REQUEST_FAILED")
          : "INTERNAL_ERROR",
        message: localizedErrorMessage(
          isClientError
            ? error instanceof ApplicationError
              ? error.code
              : (CODE_BY_STATUS[statusCode] ?? "REQUEST_FAILED")
            : "INTERNAL_ERROR",
          requestLocale(request.headers),
        ),
        requestId: request.id,
      },
    });
    return reply.status(statusCode).send(body);
  });

  app.setNotFoundHandler((request, reply) => {
    const body = ApiErrorSchema.parse({
      error: {
        code: "NOT_FOUND",
        message: localizedErrorMessage(
          "NOT_FOUND",
          requestLocale(request.headers),
        ),
        requestId: request.id,
      },
    });
    return reply.status(404).send(body);
  });

  void app.register(healthRoutes, {
    readinessCheck: dependencies.readinessCheck,
    ...(dependencies.metricsSnapshot
      ? { metricsSnapshot: dependencies.metricsSnapshot }
      : {}),
    ...(dependencies.buildInfo ? { buildInfo: dependencies.buildInfo } : {}),
  });
  if (dependencies.tripService)
    void app.register(tripRoutes, {
      service: dependencies.tripService,
      authenticator: dependencies.authenticator ?? headerAuthenticator,
      inviteUrl:
        dependencies.inviteUrl ??
        ((token) => `http://localhost:5173/join/${token}`),
      ...(dependencies.collaborationMetrics
        ? { collaborationMetrics: dependencies.collaborationMetrics }
        : {}),
    });
  if (dependencies.sessions)
    void app.register(authRoutes, {
      sessions: dependencies.sessions,
      allowDevAuth: dependencies.allowDevAuth ?? false,
    });
  return app;
}
