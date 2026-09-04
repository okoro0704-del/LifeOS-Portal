import type { FastifyInstance } from "fastify";
import { z } from "zod";
import { requireSession } from "../lib/auth.js";
import { notifyElfCom, registerPushToken } from "../services/elfcom.js";
import type { PortalStore } from "../store.js";

export async function registerPushRoutes(app: FastifyInstance, store: PortalStore) {
  app.post("/v1/push/register", async (req, reply) => {
    if (!requireSession(req, reply)) return;
    const body = z.object({ pushToken: z.string().min(8) }).parse(req.body);
    const row = registerPushToken(req.portalUser!.id, body.pushToken);
    store.upsertPushToken(row);
    let forwarded = false;
    try {
      forwarded = (await notifyElfCom(row.userId, row.pushToken)).forwarded;
    } catch {
      forwarded = false;
    }
    return { ok: true, appId: row.appId, userId: row.userId, forwarded };
  });
}
