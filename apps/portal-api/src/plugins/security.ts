import fp from "fastify-plugin";
import helmet from "@fastify/helmet";
import rateLimit from "@fastify/rate-limit";
import type { FastifyInstance } from "fastify";
import { env } from "../config/env.js";

function isSensitivePath(url: string) {
  return (
    url.startsWith("/api/v1/trust-id") ||
    url.includes("/trust-id") ||
    url === "/api/v1/finprove/disburse" ||
    url.startsWith("/api/v1/:engine") ||
    url.startsWith("/api/v1/gateway/:engine")
  );
}

/**
 * Global HTTP hardening. Encapsulated so every module inherits helmet
 * headers and a per-IP rate limit. Tests use a high ceiling so suites
 * do not trip 429. Sensitive Trust ID / Finprove disburse paths cap at
 * 100 req/min per IP.
 */
async function securityPlugin(app: FastifyInstance) {
  await app.register(helmet, {
    global: true,
    contentSecurityPolicy:
      env.nodeEnv === "production"
        ? {
            directives: {
              defaultSrc: ["'self'"],
              scriptSrc: ["'self'"],
              styleSrc: ["'self'", "'unsafe-inline'"],
              imgSrc: ["'self'", "data:", "https:"],
              connectSrc: ["'self'"],
              fontSrc: ["'self'"],
              objectSrc: ["'none'"],
              frameAncestors: ["'none'"],
              baseUri: ["'self'"],
              formAction: ["'self'"],
            },
          }
        : false,
    hsts:
      env.nodeEnv === "production"
        ? { maxAge: 31_536_000, includeSubDomains: true, preload: true }
        : false,
    frameguard: { action: "deny" },
    noSniff: true,
    referrerPolicy: { policy: "strict-origin-when-cross-origin" },
  });

  await app.register(rateLimit, {
    global: true,
    max: env.nodeEnv === "production" ? 120 : 10_000,
    timeWindow: "1 minute",
    addHeadersOnExceeding: { "x-ratelimit-limit": true },
    addHeaders: {
      "x-ratelimit-limit": true,
      "x-ratelimit-remaining": true,
      "x-ratelimit-reset": true,
    },
  });

  app.addHook("onRoute", (route) => {
    const url = route.url ?? "";
    if (!isSensitivePath(url)) {
      return;
    }
    route.config = {
      ...route.config,
      rateLimit: {
        max: 100,
        timeWindow: "1 minute",
      },
    };
  });
}

export default fp(securityPlugin, { name: "lifeos-security" });
