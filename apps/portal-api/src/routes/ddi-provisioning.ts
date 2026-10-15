import { createHash } from "node:crypto";
import type { FastifyInstance } from "fastify";
import { z } from "zod";
import type { PortalStore } from "../store.js";
import type { ServiceTokenVerifier } from "../lib/service-token.js";
import { ddiCaller } from "./ddi-ownership.js";
import type { ProvisioningClaimStore } from "../services/ddi-provisioning-claims.js";

export const DDI_PROVISIONING_CONTRACT = "ddi.portal.provisioning.v1";
const PATH = "/internal/ddi/provisioning";

const body = z.object({
  contractVersion: z.literal(DDI_PROVISIONING_CONTRACT),
  redemptionId: z.string().regex(/^redemption:[A-Za-z0-9-]{1,64}$/),
  licenseId: z.string().regex(/^license:[A-Za-z0-9-]{1,64}$/),
  entitlementId: z.string().regex(/^entitlement:[A-Za-z0-9-]{1,64}$/),
  productId: z.string().regex(/^[a-z0-9][a-z0-9._-]{0,63}$/),
  planId: z.string().regex(/^[a-z0-9][a-z0-9._-]{0,63}$/),
  ownerSubject: z.string().min(1).max(512),
  externalReference: z.string().regex(/^portal-install:[A-Za-z0-9:_-]{1,128}$/),
});

/**
 * POST /internal/ddi/provisioning — contract ddi.portal.provisioning.v1.
 *
 * Binds DDI's commercial authorization (a license) to an install the owner
 * already created through the Portal's own flow. It never creates an install,
 * so it cannot duplicate one, and it bypasses none of the domain, OS or
 * distributor checks that make an install READY. Status is truthful: PROVISIONED
 * only when the install is READY, otherwise ACCEPTED with the real install status.
 * A retry with the same Idempotency-Key and body returns the original reference.
 */
export async function registerDdiProvisioningRoutes(app: FastifyInstance, store: PortalStore, options: { verifier?: ServiceTokenVerifier; productMap: Record<string, string[]>; claims: ProvisioningClaimStore; leaseMs?: number }) {
  app.post(PATH, async (req, reply) => {
    // Without configured DDI service keys nobody is authorized; refuse without revealing configuration.
    if (!options.verifier) return reply.code(403).send({ error: "forbidden" });
    const auth = await ddiCaller(req, PATH, "provisioning:bind", options.verifier);
    if (auth === "unavailable") return reply.code(503).send({ error: "replay_protection_unavailable" });
    if (auth === "unauthenticated") return reply.code(401).send({ error: "unauthenticated" });
    if (auth === "forbidden") return reply.code(403).send({ error: "forbidden" });
    if (req.headers["x-ddi-contract"] !== DDI_PROVISIONING_CONTRACT) return reply.code(422).send({ error: "contract_version_unsupported" });
    const parsed = body.safeParse(req.body);
    if (!parsed.success) {
      const version = parsed.error.issues.some((issue) => issue.path[0] === "contractVersion");
      return reply.code(version ? 422 : 400).send({ error: version ? "contract_version_unsupported" : "invalid_request" });
    }
    const input = parsed.data;
    const key = String(req.headers["idempotency-key"] ?? "");
    // The key is bound to the redemption, so one redemption maps to one durable record.
    if (key !== `ddi-provision:${input.redemptionId}`) return reply.code(400).send({ error: "idempotency_key_invalid" });
    const fingerprint = createHash("sha256").update(JSON.stringify([input.redemptionId, input.licenseId, input.entitlementId, input.productId, input.planId, input.ownerSubject, input.externalReference])).digest("hex");
    const installId = input.externalReference.slice("portal-install:".length);
    const respond = (reference: string) => {
      const install = store.getInstall(installId);
      return {
        contractVersion: DDI_PROVISIONING_CONTRACT,
        status: install?.status === "ready" && !install.suspended ? "PROVISIONED" : "ACCEPTED",
        reference,
        installId,
        installStatus: install ? (install.suspended ? "suspended" : install.status) : "retired",
        redemptionId: input.redemptionId,
      };
    };

    // Same key and same request return the original outcome, whatever has changed since.
    const prior = await options.claims.peek(key, fingerprint);
    if (prior?.kind === "conflict") return reply.code(409).send({ error: "idempotency_conflict" });
    if (prior?.kind === "committed") return reply.code(200).send(respond(prior.reference));

    // Authoritative owner checks, the same ones DDI's ownership verification relies on.
    if (input.ownerSubject.startsWith("local:")) return reply.code(404).send({ error: "ownership_not_found" });
    const install = store.getInstall(installId);
    if (!install || install.ownerTrustId !== input.ownerSubject) return reply.code(404).send({ error: "ownership_not_found" });
    const owner = store.getUser(install.ownerUserId);
    if (!owner) return reply.code(404).send({ error: "ownership_not_found" });
    if (owner.suspended || install.suspended) return reply.code(423).send({ error: "install_locked" });
    if (install.status === "failed") return reply.code(422).send({ error: "install_failed" });
    const allowed = options.productMap[input.productId] ?? [];
    if (!allowed.includes(install.appId) && !allowed.includes(install.osId)) return reply.code(422).send({ error: "product_install_mismatch" });
    if (install.ddiLicense && install.ddiLicense.licenseId !== input.licenseId) return reply.code(409).send({ error: "install_already_licensed" });

    // D3C-C: one atomic claim per key, and per install, across every Portal instance.
    const claim = await options.claims.claim({ key, fingerprint, installId: install.id, licenseId: input.licenseId, leaseMs: options.leaseMs ?? 30_000 });
    if (claim.kind === "committed") return reply.code(200).send(respond(claim.reference));
    if (claim.kind === "conflict") return reply.code(409).send({ error: "idempotency_conflict" });
    if (claim.kind === "install_conflict") return reply.code(409).send({ error: "install_already_licensed" });
    // Another instance is mid-request: DDI retries the same key (503 is retryable for its adapter).
    if (claim.kind === "in_progress") return reply.code(503).header("retry-after", "2").send({ error: "provisioning_in_progress" });

    const reference = `portal-ddi:${install.id}:${input.licenseId}`;
    const boundAt = new Date().toISOString();
    store.updateInstall(install.id, { ddiLicense: { licenseId: input.licenseId, entitlementId: input.entitlementId, productId: input.productId, planId: input.planId, redemptionId: input.redemptionId, reference, boundAt } });
    store.ddiProvisioningPut({ id: key, fingerprint, installId: install.id, redemptionId: input.redemptionId, licenseId: input.licenseId, entitlementId: input.entitlementId, productId: input.productId, planId: input.planId, ownerSubject: input.ownerSubject, reference, createdAt: boundAt });
    // The binding must be durable before the claim is committed. A crash before commit leaves a
    // stale claim; a retry takes it over after the lease and redoes the same (idempotent) binding.
    await store.flush();
    await options.claims.commit(key, claim.leaseToken, reference);
    return reply.code(201).send(respond(reference));
  });
}
