import { resolve } from "node:path";
import { config as loadDotenv } from "dotenv";
import { buildApp } from "./app.js";
import { loadConfig } from "./config.js";
import { createDatabase } from "./db.js";
import { createShutdown } from "./lifecycle.js";
import { buildLoggerOptions } from "./logging.js";

loadDotenv({
  path: [
    resolve(import.meta.dirname, "../../../.env"),
    resolve(process.cwd(), ".env"),
  ],
});

const config = loadConfig(process.env);
const database = createDatabase(config.DATABASE_URL);
const app = buildApp({
  readinessCheck: () => database.checkReadiness(),
  logger: buildLoggerOptions(config.NODE_ENV),
});

const shutdown = createShutdown({
  closeServer: () => app.close(),
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
