import fp from "fastify-plugin";
import cors from "@fastify/cors";
import type { FastifyInstance } from "fastify";
import { env } from "../config/env.js";
import { isFirstPartyOrigin } from "../lib/origins.js";
import { findInstallByHost } from "../services/tenant-site.js";
import type { PortalStore } from "../store.js";

export type CorsDecision = "first_party" | "tenant" | "denied";

/**
 * Production CORS is explicit authorization, never "any host with a dot":
 * - first-party Portal origins (PORTAL_DOMAIN / CORS_ORIGINS / admin / business), and
 * - https origins of a registered tenant: `{subdomain}.getlifeos.app` for an existing install, or a
 *   custom host bound through verified Domain Infrastructure.
 * Everything else (unknown hosts, malformed values, the literal `null` origin, localhost unless
 * configured in CORS_ORIGINS) is denied. Credentials are only ever allowed for authorized origins, and
 * tenant origins still never get the Portal session cookie honoured (see lib/auth cookieSessionAllowed).
 */
export function corsDecision(origin: string, store: PortalStore): CorsDecision {
  if (isFirstPartyOrigin(origin)) return "first_party";
  let url: URL;
  try {
    url = new URL(origin);
  } catch {
    return "denied";
  }
  if (url.protocol !== "https:" || url.origin.toLowerCase() !== origin.toLowerCase()) return "denied";
  const install = findInstallByHost(store, url.hostname);
  return install && !install.suspended ? "tenant" : "denied";
}

async function corsPlugin(app: FastifyInstance, opts: { store: PortalStore }) {
  const production = env.nodeEnv === "production";

  // Refuse the request outright, before any handler runs, so an unauthorized browser origin cannot
  // trigger side effects even with a CORS-"simple" request.
  app.addHook("onRequest", async (req, reply) => {
    const origin = req.headers.origin;
    if (!production || !origin) return;
    if (corsDecision(origin, opts.store) === "denied") {
      return reply.code(403).send({ error: "origin_not_allowed", message: "CORS origin not allowed" });
    }
  });

  await app.register(cors, {
    origin: (origin, callback) => {
      if (!origin) {
        callback(null, true);
        return;
      }
      callback(null, !production || corsDecision(origin, opts.store) !== "denied");
    },
    credentials: true,
    allowedHeaders: [
      "Content-Type",
      "Authorization",
      "X-Portal-Session",
      "X-TrustID-Biometric",
      "X-TrustID-Master-Device",
      "X-Api-Key",
      "X-Hotel-Staff",
    ],
  });
}

export default fp(corsPlugin, { name: "lifeos-cors" });
