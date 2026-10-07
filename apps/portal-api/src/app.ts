import Fastify, { type FastifyInstance } from "fastify";
import cookie from "@fastify/cookie";
import path from "node:path";
import { fileURLToPath } from "node:url";
import { env } from "./config/env.js";
import securityPlugin from "./plugins/security.js";
import corsPlugin from "./plugins/cors.js";
import errorHandlerPlugin from "./plugins/error-handler.js";
import emptyBodyPlugin from "./plugins/empty-body.js";
import { registerHealthModule } from "./modules/health/health.route.js";
import { attachSession, enforceCookieCsrf, trustIdTokenVault } from "./lib/auth.js";
import { createStore, type PortalStore } from "./store.js";
import { openStore } from "./store/open.js";
import { runInWriteScope, settleScopeWrites } from "./store/write-scope.js";
import { createDistributorClient, type DistributorClient } from "./services/distributor.js";
import { createHospitalityOsClient, type HosClient } from "./services/hospitalityos.js";
import { createEcommerceOsClient, type EcoClient } from "./services/ecommerceos.js";
import { createTransportationOsClient, type TosClient } from "./services/transportationos.js";
import { createServiceOsClient, type SosClient } from "./services/serviceos.js";
import { purgeAllFailedInstalls } from "./services/subdomain-claim.js";
import { resetUnprovenLegacyCustomDomains } from "./services/legacy-domains.js";
import { reconcileMybrandOsCanonicalUrls } from "./services/reconcile-mybrandos-urls.js";
import { registerAuthRoutes } from "./routes/auth.js";
import { registerCatalogRoutes } from "./routes/catalog.js";
import { registerBillingRoutes } from "./routes/billing.js";
import { registerInstallRoutes } from "./routes/installs.js";
import { registerOrganizationRoutes } from "./routes/organizations.js";
import { registerTenantRoutes } from "./routes/tenant.js";
import { registerTenantAppRoutes } from "./routes/tenant-apps.js";
import { registerPlatformAdminRoutes } from "./routes/platform-admin.js";
import { registerGatewayRoutes } from "./routes/gateway.js";
import { registerFinproveRoutes } from "./routes/finprove.js";
import { registerDataZoneAdminRoutes } from "./routes/datazone-admin.js";
import { registerDirectoryRoutes } from "./routes/directory.js";
import { registerExperienceRoutes } from "./routes/experience.js";
import type { LifeOsExperienceReader } from "./services/lifeos-experience.js";
import { registerEcommerceOsInternalRoutes } from "./routes/ecommerceos-internal.js";
import { registerUserAdminRoutes } from "./routes/users.js";
import { registerPushRoutes } from "./routes/push.js";
import { enforceProductionAuthority, seedLocalAdmin } from "./lib/seed-admin.js";
import { registerDomainInfrastructureRoutes } from "./routes/domain-infrastructure.js";
import { createDomainInfrastructure, type DomainInfraOptions } from "./domains/index.js";

export type BuildAppOptions = {
  store?: PortalStore;
  distributor?: DistributorClient;
  hos?: HosClient;
  eco?: EcoClient;
  tos?: TosClient;
  sos?: SosClient;
  /** Test boundary only. Production uses the public-contract reader. */
  lifeOsExperienceReader?: LifeOsExperienceReader;
  /** Test boundary for registrar/hosting/DNS/HTTPS transports. */
  domainInfra?: DomainInfraOptions;
  /** Test boundary: observe every registered route (security audits). */
  onRoute?: (route: { method: string | string[]; url: string }) => void;
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
  // Fail boot on a malformed TRUSTID_TOKEN_KEYS rather than on the first TrustID sign-in.
  trustIdTokenVault();
  await seedLocalAdmin(store);
  const authority = await enforceProductionAuthority(store);
  if (authority.demoted || authority.sessionsRevoked) {
    console.info(
      `[portal] production authority reset: ${authority.demoted} admin grant(s) removed, ${authority.sessionsRevoked} session(s) revoked`,
    );
  }
  const legacyReset = resetUnprovenLegacyCustomDomains(store);
  if (legacyReset) console.info(`[portal] ${legacyReset} unproven legacy custom domain(s) set back to PENDING`);
  if (env.nodeEnv !== "test") {
    const purged = purgeAllFailedInstalls(store);
    if (purged.count) {
      // Failed installs must not reserve subdomains; drop them on boot.
      console.info(`[portal] purged ${purged.count} failed install(s)`);
    }
    const reconciled = reconcileMybrandOsCanonicalUrls(store);
    if (reconciled.repaired) {
      console.info(
        `[portal] reconciled ${reconciled.repaired}/${reconciled.scanned} mybrandOS URL(s) to canonical contract`,
      );
    }
  }
  // Boot repairs above are row writes: refuse to serve until they are durable.
  await store.flush();
  const distributor = opts.distributor ?? createDistributorClient();
  const hos = opts.hos ?? createHospitalityOsClient();
  const eco = opts.eco ?? createEcommerceOsClient();
  const tos = opts.tos ?? createTransportationOsClient();
  const sos = opts.sos ?? createServiceOsClient();

  const app = Fastify({
    trustProxy: true,
    bodyLimit: 8_000_000,
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

  // Housekeeping only: expired sessions are already refused on every read.
  const sessionSweep =
    env.sessionSweepMs > 0
      ? setInterval(() => {
          store.deleteExpiredSessions().catch((err) => app.log.warn({ err: (err as Error).message }, "session_sweep_failed"));
        }, env.sessionSweepMs)
      : undefined;
  sessionSweep?.unref();

  app.addHook("onClose", async () => {
    if (sessionSweep) clearInterval(sessionSweep);
    await store.flush();
    await store.close();
  });

  // Every row write a handler causes must be durable before the payload it returns is sent; a failed
  // write becomes that request's error instead of a silently diverged cache. This wraps handlers rather
  // than using an async onSend hook: routes here reply with `reply.send(); return;`, which an async
  // onSend would turn into a double send. Writes made before a handler calls reply.send() itself are
  // still awaited (and failures logged and re-read) but cannot change that already-sent response.
  app.addHook("onRequest", (_req, _reply, done) => {
    runInWriteScope(done);
  });
  app.addHook("onRoute", (route) => {
    const handler = route.handler;
    route.handler = async function durableHandler(this: FastifyInstance, req, reply) {
      const result = await handler.call(this, req, reply);
      await settleScopeWrites();
      return result;
    };
  });

  if (opts.onRoute) {
    const observe = opts.onRoute;
    app.addHook("onRoute", (route) => observe({ method: route.method, url: route.url }));
  }
  await app.register(securityPlugin);
  await app.register(corsPlugin, { store });
  await app.register(errorHandlerPlugin);
  await app.register(emptyBodyPlugin);
  await app.register(cookie, { secret: env.cookieSecret });

  app.addHook("preHandler", async (req, reply) => {
    await attachSession(req, store);
    if (!enforceCookieCsrf(req, reply)) return reply;
  });

  await registerHealthModule(app);
  await registerAuthRoutes(app, store);
  await registerCatalogRoutes(app);
  await registerBillingRoutes(app, store);
  await registerInstallRoutes(app, store, distributor, hos, eco, tos, sos);
  await registerEcommerceOsInternalRoutes(app, store);
  await registerOrganizationRoutes(app, store);
  await registerTenantRoutes(app, store, distributor);
  await registerTenantAppRoutes(app, store, distributor);
  await registerPlatformAdminRoutes(app, store, distributor);
  await registerUserAdminRoutes(app, store);
  await registerPushRoutes(app, store);
  await registerFinproveRoutes(app);
  await registerGatewayRoutes(app);
  await registerDataZoneAdminRoutes(app, store);
  await registerDirectoryRoutes(app, store);
  await registerExperienceRoutes(app, store, opts.lifeOsExperienceReader);

  const domainInfra = createDomainInfrastructure(store, opts.domainInfra);
  const recovered = domainInfra.service.recoverInterruptedIntents();
  if (env.nodeEnv !== "test") {
    console.info(domainInfra.summary);
    if (recovered) console.info(`[domains] ${recovered} interrupted purchase intent(s) marked for reconciliation`);
  }
  await registerDomainInfrastructureRoutes(app, domainInfra.service);

  return app;
}
