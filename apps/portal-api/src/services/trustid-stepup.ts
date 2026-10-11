import { createHash } from "node:crypto";
import type { FastifyReply, FastifyRequest } from "fastify";
import { config } from "../config.js";
import { UPSTREAM_TIMEOUTS_MS, fetchWithTimeout } from "../lib/http.js";
import { requirePlatformAdmin } from "../lib/auth.js";
import { hashSecret } from "../lib/crypto.js";
import { identitySubject, isTrustIdEnabled } from "../lib/local-auth.js";
import { TrustIdJwtRejected, trustIdIssuer, verifyTrustIdJwt } from "../lib/trustid-jwt.js";

export type BiometricAuthContext = {
  trustId: string;
  accessLevel: "standard" | "master";
  isMasterDevice: boolean;
  verifiedAt: string;
};

declare module "fastify" {
  interface FastifyRequest {
    biometricAuth?: BiometricAuthContext;
  }
}

function headerFlag(req: FastifyRequest, name: string) {
  const raw = req.headers[name.toLowerCase()];
  const value = Array.isArray(raw) ? raw[0] : raw;
  return (value ?? "").toLowerCase();
}

/** Production with TrustID off has no step-up ceremony at all; knowing a password must not stand in for one. */
function productionWithoutStepUp() {
  return config.nodeEnv === "production" && !isTrustIdEnabled();
}

function stepUpUnavailable(reply: FastifyReply) {
  reply.code(403).send({
    error: "step_up_unavailable",
    message: "This action needs a TrustID step-up. TrustID is not connected on this gateway, so it is refused.",
  });
  return false;
}

function isSafeMethod(req: FastifyRequest) {
  return req.method === "GET" || req.method === "HEAD";
}

/**
 * Trust ID 1:N biometric gate for administrative reads.
 * Mock: X-TrustID-Biometric: verified
 * Remote: POST /v1/trust-id/verify-biometric
 */
export async function validateBiometricIdentity(
  req: FastifyRequest,
  reply: FastifyReply,
): Promise<boolean> {
  if (!requirePlatformAdmin(req, reply)) return false;

  if (productionWithoutStepUp()) {
    if (!isSafeMethod(req)) return stepUpUnavailable(reply);
    req.biometricAuth = {
      trustId: identitySubject(req.portalUser!),
      accessLevel: "standard",
      isMasterDevice: false,
      verifiedAt: new Date().toISOString(),
    };
    return true;
  }

  if (!isTrustIdEnabled()) {
    req.biometricAuth = {
      trustId: identitySubject(req.portalUser!),
      accessLevel: "master",
      isMasterDevice: true,
      verifiedAt: new Date().toISOString(),
    };
    return true;
  }

  if (config.trustIdMode === "mock") {
    if (headerFlag(req, "x-trustid-biometric") !== "verified") {
      reply.code(401).send({
        error: "biometric_required",
        message: "Read-only analytics require validateBiometricIdentity().",
      });
      return false;
    }
    req.biometricAuth = {
      trustId: identitySubject(req.portalUser!),
      accessLevel: headerFlag(req, "x-trustid-master-device") === "bound" ? "master" : "standard",
      isMasterDevice: headerFlag(req, "x-trustid-master-device") === "bound",
      verifiedAt: new Date().toISOString(),
    };
    return true;
  }

  // Remote TrustID (canary/required). Reads keep the existing production policy: a platform-admin
  // session. Portal performs no biometric step-up: TrustID's authenticated biometric step-up fails
  // closed until presentation-attack detection is complete, and Portal has no capture surface. Every
  // write instead requires a Master Device approval bound to this session and this exact operation.
  if (isSafeMethod(req)) {
    req.biometricAuth = {
      trustId: identitySubject(req.portalUser!),
      accessLevel: "standard",
      isMasterDevice: false,
      verifiedAt: new Date().toISOString(),
    };
    return true;
  }
  return remoteMasterDeviceStepUp(req, reply);
}

/**
 * Master Device binding for high-privilege actions (key revoke, tombstones, disbursements).
 */
export async function checkMasterDeviceBinding(
  req: FastifyRequest,
  reply: FastifyReply,
): Promise<boolean> {
  if (!req.portalUser) {
    reply.code(403).send({
      error: "master_device_required",
      message: "This action requires checkMasterDeviceBinding() on the bound Master Device.",
    });
    return false;
  }
  if (productionWithoutStepUp()) {
    if (!requirePlatformAdmin(req, reply)) return false;
    return stepUpUnavailable(reply);
  }
  if (isTrustIdEnabled() && config.trustIdMode === "remote") {
    // v1: Master Device step-up stands alone (no biometric prerequisite while PAD is incomplete).
    if (!requirePlatformAdmin(req, reply)) return false;
    return remoteMasterDeviceStepUp(req, reply);
  }
  if (!(await validateBiometricIdentity(req, reply))) return false;
  if (!isTrustIdEnabled()) return true;

  if (config.trustIdMode === "mock") {
    if (headerFlag(req, "x-trustid-master-device") !== "bound" || !req.biometricAuth?.isMasterDevice) {
      reply.code(403).send({
        error: "master_device_required",
        message: "This action requires checkMasterDeviceBinding() on the bound Master Device.",
        trustId: req.portalUser?.trustId,
      });
      return false;
    }
    return true;
  }

  return true;
}

/* ---------------------------------------------------------------------------------------------
 * TrustID authenticated step-up, v1 (TrustID docs/PORTAL_PROVIDER_CONTRACT_V1.md §4).
 * Portal creates a challenge bound to this Portal session and the exact operation, the subject
 * approves on their registered Master Device inside TrustID, and Portal consumes the approval itself
 * (never accepting an approval token from the browser) before executing that operation.
 * ------------------------------------------------------------------------------------------- */

export const STEP_UP_HEADER = "x-trustid-step-up";

export type StepUpOperation = { method: string; path: string; body: unknown };

function sha256b64url(value: string) {
  return createHash("sha256").update(value, "utf8").digest("base64url");
}

/** Deterministic JSON: object keys sorted at every level, undefined members dropped. */
export function canonicalJson(value: unknown): string {
  if (Array.isArray(value)) return `[${value.map(canonicalJson).join(",")}]`;
  if (value && typeof value === "object") {
    const record = value as Record<string, unknown>;
    const entries = Object.keys(record)
      .sort()
      .filter((k) => record[k] !== undefined)
      .map((k) => `${JSON.stringify(k)}:${canonicalJson(record[k])}`);
    return `{${entries.join(",")}}`;
  }
  return JSON.stringify(value ?? null);
}

export function stepUpOperationOf(req: FastifyRequest): StepUpOperation {
  const body = req.body && typeof req.body === "object" ? req.body : {};
  return { method: req.method.toUpperCase(), path: req.url.split("?")[0] ?? "/", body };
}

export function operationDigest(op: StepUpOperation) {
  return sha256b64url(canonicalJson({ method: op.method.toUpperCase(), path: op.path, body: op.body ?? {} }));
}

/** Human-readable action shown on the Master Device, derived from the exact request. */
export function stepUpAction(op: StepUpOperation) {
  const slug = `${op.method}.${op.path}`.toLowerCase().replace(/[^a-z0-9]+/g, ".").replace(/^\.+|\.+$/g, "");
  return `portal.${slug}`.slice(0, 100);
}

/** Opaque to TrustID: binds the challenge to this Portal session (contract §4 recommendation). */
export function sessionBindingFor(rawSessionToken: string) {
  return sha256b64url(`portal-session:${hashSecret(rawSessionToken)}`);
}

const usedApprovalIds = new Map<string, number>();
function rememberApproval(jti: string, exp: number) {
  const now = Math.floor(Date.now() / 1000);
  for (const [id, until] of usedApprovalIds) if (until < now) usedApprovalIds.delete(id);
  if (usedApprovalIds.has(jti)) return false;
  usedApprovalIds.set(jti, exp);
  return true;
}

function refuse(reply: FastifyReply, status: number, error: string, message: string, extra: Record<string, unknown> = {}) {
  reply.code(status).send({ error, message, ...extra });
  return false;
}

const CONSUME_ERRORS: Record<string, [number, string]> = {
  challenge_not_approved: [403, "step_up_not_approved"],
  challenge_already_consumed: [403, "step_up_already_used"],
  challenge_not_found: [403, "step_up_not_found"],
  session_binding_mismatch: [403, "step_up_session_mismatch"],
  operation_mismatch: [403, "step_up_operation_mismatch"],
};

async function remoteMasterDeviceStepUp(req: FastifyRequest, reply: FastifyReply): Promise<boolean> {
  const user = req.portalUser!;
  if (!req.trustIdAccessToken || !req.trustIdClientId || !user.trustId || !req.portalSessionToken) {
    return refuse(reply, 403, "step_up_requires_trustid", "Sign in with TrustID to approve this action on your Master Device.");
  }
  const op = stepUpOperationOf(req);
  const digest = operationDigest(op);
  const action = stepUpAction(op);
  const binding = sessionBindingFor(req.portalSessionToken);
  const raw = req.headers[STEP_UP_HEADER];
  const challengeId = (Array.isArray(raw) ? raw[0] : raw)?.trim();
  if (!challengeId) {
    return refuse(reply, 403, "step_up_required", "Approve this action on your Master Device.", {
      method: "master_device",
      action,
      operation_digest: digest,
    });
  }
  if (!/^[A-Za-z0-9_-]{20,128}$/.test(challengeId)) return refuse(reply, 400, "invalid_step_up", "Malformed step-up reference.");

  let res: Response;
  try {
    res = await fetchWithTimeout(`${trustIdIssuer()}/v1/step-up/challenges/${challengeId}/consume`, {
      method: "POST",
      timeoutMs: UPSTREAM_TIMEOUTS_MS.default,
      dependency: "TrustID",
      headers: { "content-type": "application/json", authorization: `Bearer ${req.trustIdAccessToken}` },
      body: JSON.stringify({ session_binding: binding, operation_digest: digest }),
    });
  } catch {
    return refuse(reply, 503, "trustid_unavailable", "TrustID is temporarily unavailable.");
  }
  const body = (await res.json().catch(() => ({}))) as { error?: string; approval?: string };
  if (!res.ok) {
    const [status, error] = CONSUME_ERRORS[body.error ?? ""] ?? (res.status >= 500 ? [503, "trustid_unavailable"] : [403, "step_up_rejected"]);
    return refuse(reply, status, error, "The Master Device approval could not be used for this action.");
  }
  if (typeof body.approval !== "string") return refuse(reply, 403, "step_up_rejected", "TrustID returned no approval.");

  let claims: Record<string, unknown>;
  try {
    claims = await verifyTrustIdJwt(body.approval, { audience: req.trustIdClientId, typ: "trustid-step-up+jwt" });
  } catch (err) {
    if (err instanceof TrustIdJwtRejected && err.reason === "jwks_unavailable") {
      return refuse(reply, 503, "trustid_unavailable", "TrustID is temporarily unavailable.");
    }
    return refuse(reply, 403, "step_up_invalid", "The Master Device approval failed verification.", {
      reason: err instanceof TrustIdJwtRejected ? err.reason : "invalid",
    });
  }
  // Every binding is re-checked against what Portal itself computed for this request.
  const mismatch =
    claims.sub !== user.trustId
      ? "subject"
      : claims.method !== "master_device"
        ? "method"
        : claims.action !== action
          ? "action"
          : claims.operation_digest !== digest
            ? "operation"
            : claims.session_binding !== binding
              ? "session"
              : typeof claims.jti !== "string" || !rememberApproval(claims.jti, Number(claims.exp))
                ? "replay"
                : null;
  if (mismatch) return refuse(reply, 403, "step_up_invalid", "The Master Device approval does not match this action.", { reason: mismatch });

  req.biometricAuth = {
    trustId: user.trustId,
    accessLevel: "master",
    isMasterDevice: true,
    verifiedAt: new Date().toISOString(),
  };
  return true;
}
