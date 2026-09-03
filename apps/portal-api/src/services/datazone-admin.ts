import { createHash, randomBytes } from "node:crypto";
import type { PortalStore } from "../store.js";
import { HttpError } from "../lib/http.js";
import { newId } from "../lib/crypto.js";

function signTombstone(assetId: string) {
  return createHash("sha256").update(`ASSET_REVOKED:${assetId}:${Date.now()}`).digest("hex");
}

export function mintDataZoneKey(
  store: PortalStore,
  input: { name: string; scopes?: string[]; ownerTrustId: string },
) {
  const keyId = `dz_live_${randomBytes(8).toString("hex")}`;
  const secret = `dz_sec_${randomBytes(16).toString("hex")}`;
  const row = store.createDataZoneKey({
    keyId,
    name: input.name,
    scopes: input.scopes?.length ? input.scopes : ["assets:read", "assets:write", "license", "distribute"],
    status: "active",
    ownerTrustId: input.ownerTrustId,
    secretPreview: `${secret.slice(0, 10)}…`,
  });
  store.appendDataZoneAudit({
    action: "key.minted",
    actorTrustId: input.ownerTrustId,
    privilege: "privileged",
    target: keyId,
  });
  return {
    key: row,
    secret,
    apiKey: `${keyId}.${secret}`,
    warning: "Store the secret now — it will not be shown again.",
  };
}

export function revokeDataZoneKey(store: PortalStore, id: string, actorTrustId: string) {
  const existing = store.getDataZoneKey(id);
  if (!existing) throw new HttpError("API key not found", 404, "not_found");
  if (existing.status === "revoked") throw new HttpError("Key already revoked", 409, "already_revoked");
  const updated = store.updateDataZoneKey(id, { status: "revoked", revokedAt: new Date().toISOString() })!;
  store.appendDataZoneAudit({
    action: "key.revoked",
    actorTrustId,
    privilege: "privileged",
    target: existing.keyId,
  });
  return updated;
}

export function registerWebhook(
  store: PortalStore,
  input: { name: string; url: string; platform: "meta" | "youtube" | "cdn" | "custom"; events?: string[]; actorTrustId: string },
) {
  const row = store.createDataZoneWebhook({
    name: input.name,
    url: input.url,
    platform: input.platform,
    events: input.events?.length ? input.events : ["asset.revoked", "ASSET_REVOKED"],
    status: "active",
  });
  store.appendDataZoneAudit({
    action: "webhook.registered",
    actorTrustId: input.actorTrustId,
    privilege: "read",
    target: row.id,
  });
  return row;
}

export function recordProvenance(
  store: PortalStore,
  input: {
    assetId?: string;
    originHash: string;
    trustIdSignature: string;
    mimeType: string;
    filename: string;
    distribution?: string[];
    actorTrustId: string;
  },
) {
  const row = store.createDataZoneProvenance({
    assetId: input.assetId ?? newId("ast"),
    originHash: input.originHash,
    trustIdSignature: input.trustIdSignature,
    mimeType: input.mimeType,
    filename: input.filename,
    distribution: input.distribution ?? [],
    revoked: false,
  });
  store.appendDataZoneAudit({
    action: "provenance.recorded",
    actorTrustId: input.actorTrustId,
    privilege: "read",
    target: row.assetId,
  });
  return row;
}

export function revokeAsset(
  store: PortalStore,
  input: { assetId: string; platforms?: string[]; actorTrustId: string },
) {
  const provenance = store.getDataZoneProvenanceByAsset(input.assetId);
  if (!provenance) throw new HttpError("Asset provenance not found", 404, "not_found");
  if (provenance.revoked) throw new HttpError("Asset already revoked", 409, "already_revoked");
  store.updateDataZoneProvenance(provenance.id, { revoked: true });
  const platforms = input.platforms?.length
    ? input.platforms
    : ["facebook", "youtube", "cdn", ...store.listDataZoneWebhooks().map((hook) => hook.platform)];
  const tombstone = store.createDataZoneTombstone({
    assetId: input.assetId,
    event: "ASSET_REVOKED",
    platforms: [...new Set(platforms)],
    signedPayload: signTombstone(input.assetId),
  });
  store.appendDataZoneAudit({
    action: "asset.revoked",
    actorTrustId: input.actorTrustId,
    privilege: "privileged",
    target: input.assetId,
  });
  return { tombstone, provenance: { ...provenance, revoked: true } };
}
