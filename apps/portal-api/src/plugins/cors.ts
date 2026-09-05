import fp from "fastify-plugin";
import cors from "@fastify/cors";
import type { FastifyInstance } from "fastify";
import { env } from "../config/env.js";

/**
 * Production CORS is an explicit allowlist (PORTAL_DOMAIN / CORS_ORIGINS).
 * Wildcard * is rejected at env parse time and again here.
 */
async function corsPlugin(app: FastifyInstance) {
  await app.register(cors, {
    origin: (origin, callback) => {
      if (!origin) {
        callback(null, true);
        return;
      }
      if (origin === "*") {
        callback(new Error("CORS origin not allowed"), false);
        return;
      }
      let tenantHost = false;
      try {
        const host = new URL(origin).hostname;
        tenantHost = host.endsWith(".getlifeos.app") && host !== "admin.getlifeos.app" && host !== "www.getlifeos.app";
      } catch {
        tenantHost = false;
      }
      if (env.nodeEnv === "production" && !env.corsOrigins.includes(origin) && !tenantHost) {
        callback(new Error("CORS origin not allowed"), false);
        return;
      }
      callback(null, env.corsOrigins.includes(origin) || tenantHost || env.nodeEnv !== "production");
    },
    credentials: true,
    allowedHeaders: [
      "Content-Type",
      "Authorization",
      "X-Portal-Session",
      "X-TrustID-Biometric",
      "X-TrustID-Master-Device",
      "X-Api-Key",
    ],
  });
}

export default fp(corsPlugin, { name: "lifeos-cors" });
