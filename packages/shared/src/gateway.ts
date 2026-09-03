export type GatewayEngineId = "datazone" | "trust-id" | "finprove";

export type GatewayPrivilege = "read" | "privileged";

export type GatewayUpstream = {
  id: GatewayEngineId;
  displayName: string;
  baseUrl: string;
  prefix: string;
  healthPath: string;
  bound: boolean;
};

export type GatewayUpstreamStatus = GatewayUpstream & {
  ok: boolean;
  latencyMs: number | null;
  message?: string;
};

export type DataZoneApiKey = {
  id: string;
  keyId: string;
  name: string;
  scopes: string[];
  status: "active" | "revoked";
  ownerTrustId: string;
  createdAt: string;
  revokedAt?: string;
  secretPreview?: string;
};

export type DataZoneWebhook = {
  id: string;
  name: string;
  url: string;
  platform: "meta" | "youtube" | "cdn" | "custom";
  events: string[];
  status: "active" | "paused";
  createdAt: string;
};

export type DataZoneProvenance = {
  id: string;
  assetId: string;
  originHash: string;
  trustIdSignature: string;
  mimeType: string;
  filename: string;
  distribution: string[];
  revoked: boolean;
  createdAt: string;
};

export type DataZoneTombstone = {
  id: string;
  assetId: string;
  event: "ASSET_REVOKED";
  platforms: string[];
  signedPayload: string;
  createdAt: string;
};

export type DataZoneAuditEvent = {
  id: string;
  action: string;
  actorTrustId: string;
  privilege: GatewayPrivilege;
  target: string;
  createdAt: string;
};
