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
import { buildApp } from "./app.js";
import { loadConfig } from "./config.js";
import { createDatabase } from "./db.js";
import { createShutdown } from "./lifecycle.js";
import { buildLoggerOptions } from "./logging.js";
import { PostgresTravelCache } from "./repositories/postgres-travel-cache.js";
import { TripRepository } from "./repositories/trip-repository.js";
import {
  createMastraRecomputeWorkflow,
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
const publicCities = new Map(
  CITY_CATALOG.map(({ id, name, country }) => [id, { id, name, country }]),
);
const tripService = new TripService(repository, publicCities);
const app = buildApp({
  readinessCheck: () => database.checkReadiness(),
  tripService,
  logger: buildLoggerOptions(config.NODE_ENV),
});
const metrics = new InMemoryTutuMetrics();
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
worker.start();

const shutdown = createShutdown({
  closeServer: async () => {
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
  await database.close();
  process.exitCode = 1;
}
