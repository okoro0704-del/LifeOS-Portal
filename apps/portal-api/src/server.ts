import { env } from "./config/env.js";
import { buildApp } from "./app.js";
import { runSchemaMigrations } from "./store/migrate.js";

/**
 * Process entry. Tests import `buildApp` and never listen.
 * SIGINT / SIGTERM close the Fastify instance before exit.
 */
export async function start() {
  if (env.databaseUrl) {
    await runSchemaMigrations(env.databaseUrl);
    console.log("portal + finprove schemas verified");
  }
  const app = await buildApp();

  const shutdown = async (signal: string) => {
    app.log.info({ signal }, "graceful_shutdown");
    try {
      await app.close();
      process.exit(0);
    } catch (err) {
      app.log.error({ err }, "graceful_shutdown_failed");
      process.exit(1);
    }
  };

  process.once("SIGINT", () => void shutdown("SIGINT"));
  process.once("SIGTERM", () => void shutdown("SIGTERM"));

  await app.listen({ port: env.port, host: env.host });
  app.log.info(`LifeOS Portal API on http://localhost:${env.port}`);
  return app;
}

if (process.argv[1] && /server\.(ts|js)$/.test(process.argv[1])) {
  await start();
}
