import type { FastifyInstance } from "fastify";
import { z } from "zod";
import { requirePlatformAdmin, toPublicUser } from "../lib/auth.js";
import { rolesForAccount } from "../lib/local-auth.js";
import type { PortalStore } from "../store.js";

export async function registerUserAdminRoutes(app: FastifyInstance, store: PortalStore) {
  app.get("/v1/admin/users", async (req, reply) => {
    if (!requirePlatformAdmin(req, reply)) return;
    return { users: store.listUsers().map(toPublicUser) };
  });

  app.post("/v1/admin/users/:id/suspend", async (req, reply) => {
    if (!requirePlatformAdmin(req, reply)) return;
    const { id } = req.params as { id: string };
    const body = z.object({ suspended: z.boolean().default(true) }).parse(req.body ?? {});
    if (id === req.portalUser!.id) {
      return reply.code(400).send({ error: "invalid", message: "You cannot suspend your own account." });
    }
    const updated = store.updateUser(id, { suspended: body.suspended });
    if (!updated) return reply.code(404).send({ error: "not_found", message: "User not found" });
    return { ok: true, user: toPublicUser(updated) };
  });

  app.post("/v1/admin/users/:id/role", async (req, reply) => {
    if (!requirePlatformAdmin(req, reply)) return;
    const { id } = req.params as { id: string };
    const body = z.object({ role: z.enum(["USER", "ADMIN"]) }).parse(req.body);
    const updated = store.updateUser(id, { role: body.role, roles: rolesForAccount(body.role) });
    if (!updated) return reply.code(404).send({ error: "not_found", message: "User not found" });
    return { ok: true, user: toPublicUser(updated) };
  });
}
