import Fastify, { type FastifyInstance } from "fastify";
import helmet from "@fastify/helmet";
import rateLimit from "@fastify/rate-limit";
import { z } from "zod";
import { defaultFinproveEngine } from "@lifeos-portal/finprove";

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

export async function buildFinproveApp(): Promise<FastifyInstance> {
  const app = Fastify({
    trustProxy: true,
    logger: process.env.NODE_ENV !== "test",
  });

  await app.register(helmet, {
    global: true,
    contentSecurityPolicy: process.env.NODE_ENV === "production",
    hsts:
      process.env.NODE_ENV === "production"
        ? { maxAge: 31_536_000, includeSubDomains: true, preload: true }
        : false,
    frameguard: { action: "deny" },
  });
  await app.register(rateLimit, {
    global: true,
    max: process.env.NODE_ENV === "production" ? 100 : 10_000,
    timeWindow: "1 minute",
  });

  app.get("/health", async () => ({
    ok: true,
    service: "finprove",
    engine: "finprove",
  }));

  app.post("/intents", async (req, reply) => {
    const body = intentBody.parse(req.body);
    const intent = await defaultFinproveEngine.createIntent(body);
    return reply.code(201).send({ intent });
  });

  app.post(
    "/disburse",
    {
      config: { rateLimit: { max: 100, timeWindow: "1 minute" } },
    },
    async (req, reply) => {
      const body = disburseBody.parse(req.body);
      const disbursement = await defaultFinproveEngine.disburse(body);
      return reply.code(201).send({ disbursement });
    },
  );

  app.get("/balances/:trustId", async (req) => {
    const { trustId } = req.params as { trustId: string };
    const currency = typeof req.query === "object" && req.query && "currency" in req.query
      ? String((req.query as { currency?: string }).currency ?? "NGN")
      : "NGN";
    return { balance: defaultFinproveEngine.getBalance(trustId, currency) };
  });

  return app;
}
