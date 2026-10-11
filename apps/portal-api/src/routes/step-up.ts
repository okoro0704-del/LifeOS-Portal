import type { FastifyInstance, FastifyReply, FastifyRequest } from "fastify";
import { z } from "zod";
import { requireSession } from "../lib/auth.js";
import { UPSTREAM_TIMEOUTS_MS, fetchWithTimeout } from "../lib/http.js";
import { trustIdIssuer } from "../lib/trustid-jwt.js";
import { isTrustIdEnabled } from "../lib/local-auth.js";
import { config } from "../config.js";
import { operationDigest, sessionBindingFor, stepUpAction } from "../services/trustid-stepup.js";

/**
 * Browser-facing step-up (TrustID contract v1 §4). Portal creates and tracks a Master Device challenge
 * with the session's own TrustID token; the browser never talks to TrustID's step-up API and never
 * holds an approval. The protected request is then retried with `X-TrustID-Step-Up: <challenge_id>`
 * and the guard consumes the approval server-side.
 */
const operationSchema = z.object({
  operation: z.object({
    method: z.enum(["POST", "PUT", "PATCH", "DELETE"]),
    path: z.string().regex(/^\/[^\s?#]*$/).max(512),
    body: z.unknown().optional(),
  }),
});
const challengeIdSchema = z.object({ id: z.string().regex(/^[A-Za-z0-9_-]{20,128}$/) });

function ready(req: FastifyRequest, reply: FastifyReply) {
  if (!requireSession(req, reply)) return false;
  if (!isTrustIdEnabled() || config.trustIdMode !== "remote") {
    reply.code(409).send({ error: "step_up_unavailable", message: "TrustID step-up is not active on this gateway." });
    return false;
  }
  if (!req.trustIdAccessToken || !req.trustIdClientId || !req.portalUser?.trustId || !req.portalSessionToken) {
    reply.code(403).send({ error: "step_up_requires_trustid", message: "Sign in with TrustID to approve actions on your Master Device." });
    return false;
  }
  return true;
}

async function trustId(req: FastifyRequest, reply: FastifyReply, path: string, init: { method: string; body?: unknown }) {
  let res: Response;
  try {
    res = await fetchWithTimeout(`${trustIdIssuer()}${path}`, {
      method: init.method,
      timeoutMs: UPSTREAM_TIMEOUTS_MS.default,
      dependency: "TrustID",
      headers: {
        authorization: `Bearer ${req.trustIdAccessToken}`,
        ...(init.body !== undefined ? { "content-type": "application/json" } : {}),
      },
      body: init.body !== undefined ? JSON.stringify(init.body) : undefined,
    });
  } catch {
    return reply.code(503).send({ error: "trustid_unavailable", message: "TrustID is temporarily unavailable." });
  }
  const body = (await res.json().catch(() => ({}))) as Record<string, unknown>;
  const status = res.status >= 500 ? 503 : res.status;
  // Only the fields Portal's UI needs; nothing TrustID-internal is relayed.
  const allowed = ["challenge_id", "status", "method", "action", "operation_digest", "expires_at", "error"];
  return reply.code(status).send(Object.fromEntries(Object.entries(body).filter(([k]) => allowed.includes(k))));
}

export async function registerStepUpRoutes(app: FastifyInstance) {
  app.post("/v1/step-up/challenges", async (req, reply) => {
    if (!ready(req, reply)) return reply;
    const { operation } = operationSchema.parse(req.body ?? {});
    const op = { method: operation.method, path: operation.path, body: operation.body ?? {} };
    return trustId(req, reply, "/v1/step-up/challenges", {
      method: "POST",
      body: {
        method: "master_device",
        action: stepUpAction(op),
        operation_digest: operationDigest(op),
        session_binding: sessionBindingFor(req.portalSessionToken!),
      },
    });
  });

  app.get("/v1/step-up/challenges/:id", async (req, reply) => {
    if (!ready(req, reply)) return reply;
    const { id } = challengeIdSchema.parse(req.params);
    return trustId(req, reply, `/v1/step-up/challenges/${id}`, { method: "GET" });
  });

  app.post("/v1/step-up/challenges/:id/cancel", async (req, reply) => {
    if (!ready(req, reply)) return reply;
    const { id } = challengeIdSchema.parse(req.params);
    return trustId(req, reply, `/v1/step-up/challenges/${id}/cancel`, { method: "POST", body: {} });
  });
}
