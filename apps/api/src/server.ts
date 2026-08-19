import { resolve } from "node:path";
import {
  CITY_CATALOG,
  CITY_CATALOG_VERSION,
  createCandidateGenerator,
} from "@rendezvous/domain";
import {
  createCachedTutuAdapter,
  createTutuToolCaller,
  createTutuTransportAdapter,
  InMemoryTutuMetrics,
} from "@rendezvous/tutu";
import { config as loadDotenv } from "dotenv";
import { TripService } from "./application/trip-service.js";
import { SessionService } from "./auth/session-service.js";
import { buildApp } from "./app.js";
import { loadConfig } from "./config.js";
import { createDatabase } from "./db.js";
import { createShutdown } from "./lifecycle.js";
import { buildLoggerOptions } from "./logging.js";
import { PostgresTravelCache } from "./repositories/postgres-travel-cache.js";
import { TripRepository } from "./repositories/trip-repository.js";
import {
  createMastraRecomputeWorkflow,
  InMemoryRecomputeMetrics,
  RecomputeRunner,
} from "./workflow/recompute.js";
import { RecomputeWorker } from "./workflow/worker.js";

loadDotenv({
  path: [
    resolve(import.meta.dirname, "../../../.env"),
    resolve(process.cwd(), ".env"),
  ],
});

const config = loadConfig(process.env);
const database = createDatabase(config.DATABASE_URL);
const repository = new TripRepository(database);
await repository.syncCityCatalog(CITY_CATALOG, CITY_CATALOG_VERSION);
await repository.pruneEventOutbox();
const publicCities = new Map(
  CITY_CATALOG.map(({ id, name, country }) => [id, { id, name, country }]),
);
const tripService = new TripService(repository, publicCities);
const sessions = new SessionService(
  database,
  config.TELEGRAM_BOT_TOKEN ?? "development-only-token",
);
const metrics = new InMemoryTutuMetrics();
const recomputeMetrics = new InMemoryRecomputeMetrics();
const app = buildApp({
  readinessCheck: () => database.checkReadiness(),
  tripService,
  logger: buildLoggerOptions(config.NODE_ENV),
  metricsSnapshot: () => ({
    tutu: metrics.snapshot(),
    recomputeLatencyReadyToPublishedP95Ms:
      recomputeMetrics.p95ReadyToPublished(),
    recomputeLatencyReadyToPublishedTargetMs: 60_000,
  }),
  authenticator: sessions,
  sessions,
  allowDevAuth: config.NODE_ENV !== "production",
  allowedOrigin: new URL(config.PUBLIC_MINI_APP_URL).origin,
  trustProxy: config.TRUST_PROXY,
  inviteUrl: (token) =>
    config.TELEGRAM_BOT_USERNAME && config.TELEGRAM_MINI_APP_SHORT_NAME
      ? `https://t.me/${config.TELEGRAM_BOT_USERNAME.replace(/^@/, "")}/${config.TELEGRAM_MINI_APP_SHORT_NAME}?startapp=${token}`
      : `${config.PUBLIC_MINI_APP_URL.replace(/\/$/, "")}/join/${token}`,
});
const outboxRetentionTimer = setInterval(
  () =>
    void repository.pruneEventOutbox().catch((error: unknown) => {
      app.log.error({ err: error }, "failed to prune event outbox");
    }),
  60 * 60_000,
);
outboxRetentionTimer.unref();
const tutuCaller = createTutuToolCaller({
  url: new URL(config.TUTU_MCP_URL),
  timeoutMs: 10_000,
});
const liveAdapter = createTutuTransportAdapter({
  caller: tutuCaller,
  timeoutMs: 8_000,
  metrics,
});
const tutuAdapter = createCachedTutuAdapter({
  adapter: liveAdapter,
  cache: new PostgresTravelCache(database),
  metrics,
});
const runner = new RecomputeRunner(
  repository,
  createCandidateGenerator(CITY_CATALOG),
  tutuAdapter,
  CITY_CATALOG,
  app.log,
  60_000,
  recomputeMetrics,
);
const worker = new RecomputeWorker(
  repository,
  createMastraRecomputeWorkflow(runner),
  (error) => {
    app.log.error({ err: error }, "recompute worker failed");
  },
);
const requeued = await repository.requeueOrphanedJobs();
if (requeued > 0)
  app.log.warn({ requeued }, "requeued orphaned recompute jobs after restart");

const shutdown = createShutdown({
  closeServer: async () => {
    clearInterval(outboxRetentionTimer);
    await worker.close();
    await tutuCaller.close();
    await app.close();
  },
  closeDatabase: () => database.close(),
});

for (const signal of ["SIGINT", "SIGTERM"] as const) {
  process.once(signal, () => {
    app.log.info({ signal }, "shutting down");
    void shutdown()
      .then(() => {
        process.exitCode = 0;
      })
      .catch((error: unknown) => {
        app.log.error({ err: error }, "shutdown failed");
        process.exitCode = 1;
      });
  });
}

try {
  await app.listen({ host: config.HOST, port: config.PORT });
} catch (error) {
  app.log.fatal({ err: error }, "server failed to start");
  await shutdown().catch((cleanupError: unknown) => {
    app.log.error({ err: cleanupError }, "startup cleanup failed");
  });
  process.exit(1);
}
worker.start();
