import { createHash, timingSafeEqual } from "node:crypto";
import type { FastifyInstance } from "fastify";
import { z } from "zod";
import type { PortalStore } from "../store.js";

const requestBody = z.object({
  ownerSubject: z.string().min(1).max(512),
  externalSystem: z.literal("lifeos"),
  externalReference: z.string().regex(/^portal-install:[A-Za-z0-9:_-]+$/),
  type: z.enum(["PERSONAL_BRAND", "BUSINESS", "SPACE", "APPLICATION"]),
  /**
   * activate (default, D3A behaviour): the install must be READY.
   * bootstrap (D3B): the same owner check, but an in-flight install is
   * reported as pending so DDI can hold the property without privileges
   * while provisioning that READY may depend on proceeds.
   */
  purpose: z.enum(["activate", "bootstrap"]).default("activate"),
});

const IN_FLIGHT = new Set(["bootstrapping", "awaiting_domain", "provisioning"]);

function sameSecret(actual: string | undefined, expected: string | undefined) {
  if (!actual || !expected) return false;
  const left = Buffer.from(actual);
  const right = Buffer.from(expected);
  return left.length === right.length && timingSafeEqual(left, right);
}

/**
 * Internal authenticated authority lookup. It intentionally accepts no Portal
 * browser session or caller-provided evidence: only DDI's service credential
 * may ask whether a canonical TrustID subject owns an authoritative install.
 */
export async function registerDdiOwnershipRoutes(app: FastifyInstance, store: PortalStore, sharedSecret?: string) {
  app.post("/internal/ddi/ownership/verify", async (req, reply) => {
    if (!sameSecret(req.headers["x-ddi-ownership-secret"] as string | undefined, sharedSecret)) {
      return reply.code(403).send({ error: "forbidden" });
    }
    const parsed = requestBody.safeParse(req.body);
    if (!parsed.success) return reply.code(400).send({ error: "invalid_request" });
    const installId = parsed.data.externalReference.slice("portal-install:".length);
    const install = store.getInstall(installId);
    // A Portal-local fallback subject (local:<userId>) is not a canonical TrustID subject and never proves ownership.
    if (parsed.data.ownerSubject.startsWith("local:")) return reply.code(404).send({ error: "ownership_not_found" });
    if (!install || install.ownerTrustId !== parsed.data.ownerSubject) return reply.code(404).send({ error: "ownership_not_found" });
    // The owning account must still exist and be in good standing, not only the install.
    const owner = store.getUser(install.ownerUserId);
    if (!owner || owner.suspended) return reply.code(404).send({ error: "ownership_not_found" });
    if (install.suspended) return reply.code(409).send({ error: "ownership_pending" });
    const ready = install.status === "ready";
    // A failed install, or a non-ready install outside bootstrap, never verifies.
    if (!ready && (parsed.data.purpose !== "bootstrap" || !IN_FLIGHT.has(install.status))) return reply.code(409).send({ error: "ownership_pending" });
    const verifiedAt = new Date().toISOString();
    const expiresAt = new Date(Date.now() + 5 * 60_000).toISOString();
    // The receipt identifies the exact authoritative record version. It is not
    // a bearer assertion and cannot be used without a new authenticated lookup.
    const evidenceId = createHash("sha256").update(`${install.id}|${install.ownerTrustId}|${install.updatedAt}`).digest("hex");
    return {
      verified: true,
      issuer: "lifeos-portal",
      evidenceId,
      verifiedAt,
      expiresAt,
      ownerSubject: parsed.data.ownerSubject,
      externalSystem: parsed.data.externalSystem,
      externalReference: parsed.data.externalReference,
      readiness: ready ? "ready" : "pending",
    };
  });
}
