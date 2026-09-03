import type { FastifyInstance, FastifyReply, FastifyRequest } from "fastify";
import type { GatewayEngineId } from "@lifeos-portal/shared";
import { HttpError } from "../lib/http.js";
import { checkMasterDeviceBinding, validateBiometricIdentity } from "../services/trustid-stepup.js";
import {
  GATEWAY_UPSTREAMS,
  engineFromPath,
  probeUpstream,
  proxyToUpstream,
  rewriteGatewayPath,
  sanitizeProxyHeaders,
} from "../services/gateway.js";

function forwardedHeaders(req: FastifyRequest) {
  const headers: Record<string, string> = {};
  if (req.trustIdAccessToken) headers.Authorization = `Bearer ${req.trustIdAccessToken}`;
  const apiKey = req.headers["x-api-key"];
  if (typeof apiKey === "string") headers["X-Api-Key"] = apiKey;
  return sanitizeProxyHeaders(headers);
}

function isPrivilegedMutation(req: FastifyRequest) {
  const path = (req.url.split("?")[0] ?? req.url).toLowerCase();
  if (path.includes("/disburse") || path.includes("/revoke") || path.includes("/master-bind")) {
    return true;
  }
  return req.method !== "GET" && req.method !== "HEAD";
}

async function handleProxy(req: FastifyRequest, reply: FastifyReply) {
  const engine = engineFromPath(req.url) ?? (req.params as { engine?: GatewayEngineId }).engine;
  if (!engine || !["datazone", "trust-id", "finprove"].includes(engine)) {
    return reply.code(404).send({ error: "unknown_engine" });
  }
  const privileged = isPrivilegedMutation(req);
  const allowed = privileged
    ? await checkMasterDeviceBinding(req, reply)
    : await validateBiometricIdentity(req, reply);
  if (!allowed) return;
  const rewritten = rewriteGatewayPath(req.url);
  try {
    const proxied = await proxyToUpstream({
      engine,
      method: req.method,
      path: rewritten.rest,
      query: rewritten.query,
      headers: forwardedHeaders(req),
      body: req.body,
    });
    return reply.code(proxied.status).send(proxied.body);
  } catch (err) {
    if (err instanceof HttpError) {
      return reply.code(err.statusCode).send({ error: err.code, message: err.message });
    }
    throw err;
  }
}

export async function registerGatewayRoutes(app: FastifyInstance) {
  app.post("/api/v1/datazone/revoke", async (req, reply) => {
    if (!(await checkMasterDeviceBinding(req, reply))) return;
    const rewritten = rewriteGatewayPath(req.url);
    try {
      const proxied = await proxyToUpstream({
        engine: "datazone",
        method: "POST",
        path: rewritten.rest,
        headers: forwardedHeaders(req),
        body: req.body,
      });
      return reply.code(proxied.status).send(proxied.body);
    } catch (err) {
      if (err instanceof HttpError) {
        return reply.code(err.statusCode).send({ error: err.code, message: err.message });
      }
      throw err;
    }
  });

  app.post("/api/v1/trust-id/master-bind", async (req, reply) => {
    if (!(await checkMasterDeviceBinding(req, reply))) return;
    return {
      ok: true,
      bound: true,
      trustId: req.portalUser?.trustId,
    };
  });

  app.get("/api/v1/gateway/status", async (req, reply) => {
    if (!(await validateBiometricIdentity(req, reply))) return;
    const upstreams = await Promise.all(GATEWAY_UPSTREAMS.map(probeUpstream));
    return {
      service: "lifeos-gateway",
      upstreams,
    };
  });

  for (const url of [
    "/api/v1/gateway/:engine",
    "/api/v1/gateway/:engine/*",
    "/api/v1/:engine",
    "/api/v1/:engine/*",
  ]) {
    app.route({
      method: ["GET", "POST", "PUT", "PATCH", "DELETE"],
      url,
      handler: handleProxy,
    });
  }
}
