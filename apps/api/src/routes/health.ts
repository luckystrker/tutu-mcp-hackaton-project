import {
  BuildInfoSchema,
  LivenessSchema,
  ReadinessSchema,
  type BuildInfo,
} from "@rendezvous/contracts";
import type { FastifyPluginAsync } from "fastify";

export type HealthDependencies = {
  readinessCheck: () => Promise<void>;
  metricsSnapshot?: () => Readonly<Record<string, unknown>>;
  buildInfo?: BuildInfo;
};

export const healthRoutes: FastifyPluginAsync<HealthDependencies> = async (
  app,
  options,
) => {
  app.get("/health/live", async () => LivenessSchema.parse({ status: "ok" }));

  app.get("/health/build", async () =>
    BuildInfoSchema.parse(
      options.buildInfo ?? {
        service: "rendezvous-api",
        version: "development",
        commitSha: "development",
        builtAt: null,
        environment: "development",
      },
    ),
  );

  app.get("/metrics", async () => options.metricsSnapshot?.() ?? {});

  app.get("/health/ready", async (_request, reply) => {
    try {
      await options.readinessCheck();
      return ReadinessSchema.parse({
        status: "ok",
        dependencies: { database: "ok" },
      });
    } catch {
      return reply.status(503).send(
        ReadinessSchema.parse({
          status: "unavailable",
          dependencies: { database: "unavailable" },
        }),
      );
    }
  });
};
