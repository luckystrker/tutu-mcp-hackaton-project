import { ApiErrorSchema } from "@rendezvous/contracts";
import Fastify, { type FastifyError, type FastifyServerOptions } from "fastify";
import { healthRoutes } from "./routes/health.js";

export type AppDependencies = {
  readinessCheck: () => Promise<void>;
  logger?: FastifyServerOptions["logger"];
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
  });

  app.setErrorHandler((error: FastifyError, request, reply) => {
    const statusCode = toClientStatusCode(error.statusCode) ?? 500;
    const isClientError = statusCode < 500;
    request.log[isClientError ? "warn" : "error"](
      { err: error, requestId: request.id },
      "request failed",
    );
    const body = ApiErrorSchema.parse({
      error: {
        code: isClientError
          ? (CODE_BY_STATUS[statusCode] ?? "REQUEST_FAILED")
          : "INTERNAL_ERROR",
        message: isClientError ? error.message : "Internal server error",
        requestId: request.id,
      },
    });
    return reply.status(statusCode).send(body);
  });

  app.setNotFoundHandler((request, reply) => {
    const body = ApiErrorSchema.parse({
      error: {
        code: "NOT_FOUND",
        message: `Route ${request.method} ${request.url} not found`,
        requestId: request.id,
      },
    });
    return reply.status(404).send(body);
  });

  void app.register(healthRoutes, {
    readinessCheck: dependencies.readinessCheck,
  });
  return app;
}
