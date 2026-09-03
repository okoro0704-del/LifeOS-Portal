import type { FastifyReply, FastifyRequest } from "fastify";
import { config } from "../config.js";
import { HttpError, httpJson } from "../lib/http.js";
import { requirePlatformAdmin } from "../lib/auth.js";

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

  if (config.trustIdMode === "mock") {
    if (headerFlag(req, "x-trustid-biometric") !== "verified") {
      reply.code(401).send({
        error: "biometric_required",
        message: "Read-only analytics require validateBiometricIdentity().",
      });
      return false;
    }
    req.biometricAuth = {
      trustId: req.portalUser!.trustId,
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
    req.biometricAuth = {
      trustId: result.trustId ?? req.portalUser!.trustId,
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
  if (!(await validateBiometricIdentity(req, reply))) return false;

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
    if (!result.ok && !result.bound) {
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
