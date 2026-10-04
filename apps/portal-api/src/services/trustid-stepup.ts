import type { FastifyReply, FastifyRequest } from "fastify";
import { config } from "../config.js";
import { HttpError, httpJson } from "../lib/http.js";
import { requirePlatformAdmin } from "../lib/auth.js";
import { identitySubject, isTrustIdEnabled } from "../lib/local-auth.js";

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

  const body = (req.body ?? {}) as { biometric?: unknown };
  try {
    const result = await httpJson<{
      matched?: boolean;
      trustId?: string;
      accessLevel?: string;
      isMasterDevice?: boolean;
    }>(config.trustIdApi, "/v1/trust-id/verify-biometric", {
      method: "POST",
      headers: req.trustIdAccessToken ? { Authorization: `Bearer ${req.trustIdAccessToken}` } : {},
      body: JSON.stringify({ biometric: body.biometric }),
    });
    if (!result.matched) {
      reply.code(401).send({
        error: "biometric_no_match",
        message: "No Trust ID identity matched this biometric.",
      });
      return false;
    }
    const signedIn = req.portalUser!.trustId;
    if (signedIn && result.trustId && result.trustId !== signedIn) {
      reply.code(403).send({
        error: "biometric_identity_mismatch",
        message: "The biometric belongs to a different Trust ID than the signed-in account.",
      });
      return false;
    }
    req.biometricAuth = {
      trustId: result.trustId ?? identitySubject(req.portalUser!),
      accessLevel: result.accessLevel === "master" ? "master" : "standard",
      isMasterDevice: Boolean(result.isMasterDevice),
      verifiedAt: new Date().toISOString(),
    };
    return true;
  } catch (err) {
    const mapped = err instanceof HttpError ? err : new HttpError("Biometric gateway failed", 503, "trustid_unavailable");
    reply.code(mapped.statusCode).send({ error: mapped.code, message: mapped.message });
    return false;
  }
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

  const body = (req.body ?? {}) as { deviceProof?: unknown };
  try {
    const result = await httpJson<{ ok?: boolean; bound?: boolean }>(
      config.trustIdApi,
      "/v1/trust-id/master-device/verify",
      {
        method: "POST",
        headers: req.trustIdAccessToken ? { Authorization: `Bearer ${req.trustIdAccessToken}` } : {},
        body: JSON.stringify({ deviceProof: body.deviceProof }),
      },
    );
    if (result.bound === false || (!result.ok && !result.bound)) {
      reply.code(403).send({
        error: "master_device_required",
        message: "Operation requires the bound Master Device.",
        trustId: req.biometricAuth?.trustId,
      });
      return false;
    }
    if (req.biometricAuth) {
      req.biometricAuth = { ...req.biometricAuth, accessLevel: "master", isMasterDevice: true };
    }
    return true;
  } catch (err) {
    const mapped = err instanceof HttpError ? err : new HttpError("Master Device gateway failed", 503, "trustid_unavailable");
    reply.code(mapped.statusCode).send({ error: mapped.code, message: mapped.message });
    return false;
  }
}
