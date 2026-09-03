import type { FastifyInstance } from "fastify";
import { z } from "zod";
import { defaultFinproveEngine, FINPROVE_UNBOUND } from "@lifeos-portal/finprove";
import { config } from "../config.js";
import { HttpError, httpJson } from "../lib/http.js";
import { requireSession } from "../lib/auth.js";
import { checkMasterDeviceBinding, validateBiometricIdentity } from "../services/trustid-stepup.js";

const intentBody = z.object({
  trustId: z.string().min(2),
  amount: z.number().positive(),
  currency: z.string().min(3),
  reference: z.string().min(2),
  purpose: z.string().min(2),
});

const disburseBody = intentBody.extend({
  destination: z.string().min(2),
});

function unbound() {
  return new HttpError(FINPROVE_UNBOUND.message, 503, FINPROVE_UNBOUND.error);
}

async function callFinprove<T>(path: string, init?: { method?: string; body?: unknown }): Promise<T> {
  if (!config.finproveBound) throw unbound();
  if (config.gatewayMode === "local") {
    if (path === "/intents") {
      return { intent: await defaultFinproveEngine.createIntent(init?.body as never) } as T;
    }
    if (path === "/disburse") {
      return { disbursement: await defaultFinproveEngine.disburse(init?.body as never) } as T;
    }
    if (path.startsWith("/balances/")) {
      const trustId = path.slice("/balances/".length);
      return { balance: defaultFinproveEngine.getBalance(trustId) } as T;
    }
  }
  try {
    return await httpJson<T>(config.finproveApi, path, {
      method: init?.method ?? "GET",
      body: init?.body ? JSON.stringify(init.body) : undefined,
      timeoutMs: config.proxyTimeoutMs,
    });
  } catch {
    throw unbound();
  }
}

function sendHttp(reply: { code: (n: number) => { send: (b: unknown) => unknown } }, err: unknown) {
  if (err instanceof HttpError) {
    return reply.code(err.statusCode).send({ error: err.code, message: err.message });
  }
  throw err;
}

export async function registerFinproveRoutes(app: FastifyInstance) {
  app.post("/api/v1/finprove/intents", async (req, reply) => {
    if (!(await validateBiometricIdentity(req, reply))) return;
    const body = intentBody.parse(req.body);
    try {
      const result = await callFinprove<{ intent: unknown }>("/intents", { method: "POST", body });
      return reply.code(201).send(result);
    } catch (err) {
      return sendHttp(reply, err);
    }
  });

  app.post("/api/v1/finprove/disburse", {
    config: { rateLimit: { max: 100, timeWindow: "1 minute" } },
  }, async (req, reply) => {
    if (!(await checkMasterDeviceBinding(req, reply))) return;
    const body = disburseBody.parse(req.body);
    try {
      const result = await callFinprove<{ disbursement: unknown }>("/disburse", { method: "POST", body });
      return reply.code(201).send(result);
    } catch (err) {
      return sendHttp(reply, err);
    }
  });

  app.get("/api/v1/finprove/balances/:trustId", async (req, reply) => {
    if (!requireSession(req, reply)) return;
    if (!(await validateBiometricIdentity(req, reply))) return;
    const { trustId } = req.params as { trustId: string };
    try {
      return await callFinprove(`/balances/${encodeURIComponent(trustId)}`);
    } catch (err) {
      return sendHttp(reply, err);
    }
  });

  app.get("/api/v1/gateway/finprove/health", async (req, reply) => {
    if (!(await validateBiometricIdentity(req, reply))) return;
    if (!config.finproveBound) {
      return reply.code(503).send(FINPROVE_UNBOUND);
    }
    return { ok: true, service: "finprove", bound: true };
  });
}
