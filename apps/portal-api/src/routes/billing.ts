import type { FastifyInstance } from "fastify";
import { z } from "zod";
import { requireSession } from "../lib/auth.js";
import { HttpError } from "../lib/http.js";
import type { PortalStore } from "../store.js";
import { checkoutVerticalLicense, toPublicBilling } from "../services/billing.js";

export async function registerBillingRoutes(app: FastifyInstance, store: PortalStore) {
  app.post("/billing/checkout", async (req, reply) => {
    if (!requireSession(req, reply)) return;
    const body = z
      .object({
        osId: z.string().min(1),
        verticalId: z.string().min(1),
      })
      .parse(req.body);
    try {
      const charge = await checkoutVerticalLicense({
        store,
        user: req.portalUser!,
        osId: body.osId,
        verticalId: body.verticalId,
      });
      return reply.code(201).send({
        ok: true,
        billing: toPublicBilling(charge),
        message: "Finprove collected the vertical license. You can install now.",
      });
    } catch (err) {
      if (err instanceof HttpError) {
        return reply.code(err.statusCode).send({ error: err.code, message: err.message });
      }
      throw err;
    }
  });
}
