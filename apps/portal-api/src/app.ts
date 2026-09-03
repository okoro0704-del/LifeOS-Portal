import Fastify, { type FastifyInstance } from "fastify";
import cookie from "@fastify/cookie";
import path from "node:path";
import { fileURLToPath } from "node:url";
import { env } from "./config/env.js";
import securityPlugin from "./plugins/security.js";
import corsPlugin from "./plugins/cors.js";
import errorHandlerPlugin from "./plugins/error-handler.js";
import { registerHealthModule } from "./modules/health/health.route.js";
import { attachSession } from "./lib/auth.js";
import { createStore, type PortalStore } from "./store.js";
import { openStore } from "./store/open.js";
import { createDistributorClient, type DistributorClient } from "./services/distributor.js";
import { createHospitalityOsClient, type HosClient } from "./services/hospitalityos.js";
import { createEcommerceOsClient, type EcoClient } from "./services/ecommerceos.js";
import { createTransportationOsClient, type TosClient } from "./services/transportationos.js";
import { registerAuthRoutes } from "./routes/auth.js";
import { registerCatalogRoutes } from "./routes/catalog.js";
import { registerBillingRoutes } from "./routes/billing.js";
import { registerInstallRoutes } from "./routes/installs.js";
import { registerOrganizationRoutes } from "./routes/organizations.js";
import { registerTenantRoutes } from "./routes/tenant.js";
import { registerPlatformAdminRoutes } from "./routes/platform-admin.js";
import { registerGatewayRoutes } from "./routes/gateway.js";
import { registerFinproveRoutes } from "./routes/finprove.js";
import { registerDataZoneAdminRoutes } from "./routes/datazone-admin.js";

export type BuildAppOptions = {
  store?: PortalStore;
  distributor?: DistributorClient;
  hos?: HosClient;
  eco?: EcoClient;
  tos?: TosClient;
};

const defaultPersist = path.resolve(
  path.dirname(fileURLToPath(import.meta.url)),
  "../data/portal-store.json",
);

export async function buildApp(opts: BuildAppOptions = {}): Promise<FastifyInstance> {
  const persistPath =
    env.nodeEnv === "test" || env.databaseUrl
      ? undefined
      : env.persistPath || defaultPersist;
  const store =
    opts.store ??
    (env.nodeEnv === "test"
      ? createStore()
      : await openStore({
          persistPath,
          databaseUrl: env.databaseUrl || undefined,
        }));
  const distributor = opts.distributor ?? createDistributorClient();
  const hos = opts.hos ?? createHospitalityOsClient();
  const eco = opts.eco ?? createEcommerceOsClient();
  const tos = opts.tos ?? createTransportationOsClient();

  const app = Fastify({
    trustProxy: true,
    logger:
      env.nodeEnv === "test"
        ? false
        : {
            level: env.nodeEnv === "production" ? "info" : "debug",
            redact: {
              paths: [
                "req.headers.authorization",
                "req.headers.cookie",
                "req.headers[\"x-portal-session\"]",
              ],
              remove: true,
            },
          },
  });

  app.addHook("onClose", async () => {
    await store.flush();
    await store.close();
  });

  await app.register(securityPlugin);
  await app.register(corsPlugin);
  await app.register(errorHandlerPlugin);
  await app.register(cookie, { secret: env.cookieSecret });

  app.addHook("preHandler", async (req) => {
    await attachSession(req, store);
  });

  await registerHealthModule(app);
  await registerAuthRoutes(app, store);
  await registerCatalogRoutes(app);
  await registerBillingRoutes(app, store);
  await registerInstallRoutes(app, store, distributor, hos, eco, tos);
  await registerOrganizationRoutes(app, store);
  await registerTenantRoutes(app, store, distributor);
  await registerPlatformAdminRoutes(app, store, distributor);
  await registerFinproveRoutes(app);
  await registerGatewayRoutes(app);
  await registerDataZoneAdminRoutes(app, store);

  return app;
}
