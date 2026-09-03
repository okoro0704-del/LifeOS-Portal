import type { FastifyInstance } from "fastify";
import { z } from "zod";
import { HttpError } from "../lib/http.js";
import type { PortalStore } from "../store.js";
import { checkMasterDeviceBinding, validateBiometricIdentity } from "../services/trustid-stepup.js";
import {
  mintDataZoneKey,
  recordProvenance,
  registerWebhook,
  revokeAsset,
  revokeDataZoneKey,
} from "../services/datazone-admin.js";

export async function registerDataZoneAdminRoutes(app: FastifyInstance, store: PortalStore) {
  app.get("/v1/admin/datazone/keys", async (req, reply) => {
    if (!(await validateBiometricIdentity(req, reply))) return;
    return {
      keys: store.listDataZoneKeys().map((key) => ({
        id: key.id,
        keyId: key.keyId,
        name: key.name,
        scopes: key.scopes,
        status: key.status,
        ownerTrustId: key.ownerTrustId,
        createdAt: key.createdAt,
        revokedAt: key.revokedAt,
      })),
    };
  });

  app.post("/v1/admin/datazone/keys", async (req, reply) => {
    if (!(await checkMasterDeviceBinding(req, reply))) return;
    const body = z
      .object({
        name: z.string().min(2),
        scopes: z.array(z.string()).optional(),
      })
      .parse(req.body);
    const minted = mintDataZoneKey(store, {
      name: body.name,
      scopes: body.scopes,
      ownerTrustId: req.portalUser!.trustId,
    });
    return reply.code(201).send(minted);
  });

  app.post("/v1/admin/datazone/keys/:id/revoke", async (req, reply) => {
    if (!(await checkMasterDeviceBinding(req, reply))) return;
    const { id } = req.params as { id: string };
    try {
      return { key: revokeDataZoneKey(store, id, req.portalUser!.trustId) };
    } catch (err) {
      return sendHttp(reply, err);
    }
  });

  app.get("/v1/admin/datazone/webhooks", async (req, reply) => {
    if (!(await validateBiometricIdentity(req, reply))) return;
    return { webhooks: store.listDataZoneWebhooks() };
  });

  app.post("/v1/admin/datazone/webhooks", async (req, reply) => {
    if (!(await validateBiometricIdentity(req, reply))) return;
    const body = z
      .object({
        name: z.string().min(2),
        url: z.string().url(),
        platform: z.enum(["meta", "youtube", "cdn", "custom"]),
        events: z.array(z.string()).optional(),
      })
      .parse(req.body);
    return reply.code(201).send({
      webhook: registerWebhook(store, { ...body, actorTrustId: req.portalUser!.trustId }),
    });
  });

  app.get("/v1/admin/datazone/provenance", async (req, reply) => {
    if (!(await validateBiometricIdentity(req, reply))) return;
    return { assets: store.listDataZoneProvenance(), audit: store.listDataZoneAudit() };
  });

  app.post("/v1/admin/datazone/provenance", async (req, reply) => {
    if (!(await validateBiometricIdentity(req, reply))) return;
    const body = z
      .object({
        assetId: z.string().optional(),
        originHash: z.string().min(16),
        trustIdSignature: z.string().min(8),
        mimeType: z.string().min(3),
        filename: z.string().min(1),
        distribution: z.array(z.string()).optional(),
      })
      .parse(req.body);
    return reply.code(201).send({
      asset: recordProvenance(store, { ...body, actorTrustId: req.portalUser!.trustId }),
    });
  });

  app.post("/v1/admin/datazone/assets/:assetId/revoke", async (req, reply) => {
    if (!(await checkMasterDeviceBinding(req, reply))) return;
    const { assetId } = req.params as { assetId: string };
    const body = z.object({ platforms: z.array(z.string()).optional() }).parse(req.body ?? {});
    try {
      return revokeAsset(store, {
        assetId,
        platforms: body.platforms,
        actorTrustId: req.portalUser!.trustId,
      });
    } catch (err) {
      return sendHttp(reply, err);
    }
  });

  app.get("/v1/admin/datazone/tombstones", async (req, reply) => {
    if (!(await validateBiometricIdentity(req, reply))) return;
    return { tombstones: store.listDataZoneTombstones() };
  });
}

function sendHttp(reply: { code: (n: number) => { send: (b: unknown) => unknown } }, err: unknown) {
  if (err instanceof HttpError) {
    return reply.code(err.statusCode).send({ error: err.code, message: err.message });
  }
  throw err;
}
