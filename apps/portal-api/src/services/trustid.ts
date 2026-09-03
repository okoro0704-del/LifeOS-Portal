import { config } from "../config.js";
import { HttpError } from "../lib/http.js";
import type { TrustIdRole } from "@lifeos-portal/shared";

export type TrustIdUserInfo = {
  sub: string;
  trustId: string;
  status?: string;
  identityStatus?: string;
  trustLevel?: { tier?: number };
  roles?: TrustIdRole[];
};

export class TrustIdError extends Error {
  constructor(
    message: string,
    readonly code: "trustid_unavailable" | "invalid_token" | "authorization_revoked",
  ) {
    super(message);
    this.name = "TrustIdError";
  }
}

export async function checkTrustIdAvailable(): Promise<boolean> {
  if (config.trustIdMode === "mock") return true;
  try {
    const res = await fetch(`${config.trustIdApi}/health`, {
      signal: AbortSignal.timeout(3000),
    });
    return res.ok;
  } catch {
    return false;
  }
}

function rolesForTrustId(trustId: string, claimed?: TrustIdRole[]): TrustIdRole[] {
  const roles = new Set<TrustIdRole>(claimed?.length ? claimed : ["tenant"]);
  if (config.platformAdminTrustIds.includes(trustId)) roles.add("platform_admin");
  return [...roles];
}

/**
 * Validate a TrustID access token. Portal never stores passwords.
 * Mock tokens:
 *   `mock:<trustId>` — tenant
 *   `mock:admin:<trustId>` — platform operator
 */
export async function fetchTrustIdUserInfo(accessToken: string): Promise<TrustIdUserInfo> {
  if (config.nodeEnv === "production" || config.trustIdMode !== "mock") {
    if (accessToken.startsWith("mock:")) {
      throw new TrustIdError("Authorization was denied or revoked.", "authorization_revoked");
    }
  }
  if (config.trustIdMode === "mock") {
    if (accessToken.startsWith("mock:admin:")) {
      const trustId = accessToken.slice("mock:admin:".length).trim() || "TD-PLATFORM";
      return {
        sub: trustId,
        trustId,
        identityStatus: "verified",
        trustLevel: { tier: 3 },
        roles: rolesForTrustId(trustId, ["tenant", "platform_admin"]),
      };
    }
    if (accessToken.startsWith("mock:")) {
      const trustId = accessToken.slice(5).trim() || "TD-DEV";
      return {
        sub: trustId,
        trustId,
        identityStatus: "verified",
        trustLevel: { tier: 1 },
        roles: rolesForTrustId(trustId),
      };
    }
    throw new TrustIdError("Authorization was denied or revoked.", "authorization_revoked");
  }

  let res: Response;
  try {
    res = await fetch(`${config.trustIdApi}/oauth/userinfo`, {
      headers: { Authorization: `Bearer ${accessToken}` },
      signal: AbortSignal.timeout(8000),
    });
  } catch {
    throw new TrustIdError("TrustID is temporarily unavailable.", "trustid_unavailable");
  }

  const data = (await res.json().catch(() => ({}))) as TrustIdUserInfo & { error?: string };

  if (res.status === 401 || res.status === 403) {
    throw new TrustIdError("Authorization was denied or revoked.", "authorization_revoked");
  }
  if (!res.ok) {
    throw new TrustIdError(data.error || "Token validation failed", "invalid_token");
  }
  if (!data.trustId && !data.sub) {
    throw new TrustIdError("Identity subject missing from userinfo", "invalid_token");
  }

  const trustId = data.trustId || data.sub;
  return {
    ...data,
    trustId,
    sub: data.sub || data.trustId,
    roles: rolesForTrustId(trustId, data.roles),
  };
}

export function mapTrustIdError(err: unknown): HttpError {
  if (err instanceof TrustIdError) {
    const status = err.code === "trustid_unavailable" ? 503 : 401;
    return new HttpError(err.message, status, err.code);
  }
  return new HttpError("Gateway validation failed", 401, "invalid_token");
}
