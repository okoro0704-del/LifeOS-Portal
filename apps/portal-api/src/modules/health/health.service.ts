import { LIFEOS_PRIMITIVE_IDS } from "@lifeos-portal/shared";
import { env } from "../../config/env.js";
import { GATEWAY_UPSTREAMS, probeUpstream } from "../../services/gateway.js";
import type { LivenessResponse, ReadinessResponse } from "./health.schema.js";

export class HealthService {
  liveness(): LivenessResponse {
    return {
      ok: true,
      service: "lifeos-portal-api",
      trustIdMode: env.trustIdMode,
      installMode: env.installMode,
      gatewayMode: env.gatewayMode,
      primitives: [...LIFEOS_PRIMITIVE_IDS],
    };
  }

  async readiness(): Promise<ReadinessResponse> {
    const timestamp = new Date().toISOString();
    const rows = await Promise.all(GATEWAY_UPSTREAMS.map(probeUpstream));
    const upstreams = {
      datazone: rows.find((row) => row.id === "datazone")?.ok ? "UP" : "DOWN",
      trustId: rows.find((row) => row.id === "trust-id")?.ok ? "UP" : "DOWN",
      finprove: rows.find((row) => row.id === "finprove")?.ok ? "UP" : "DOWN",
    } as const;
    const healthy = Object.values(upstreams).every((state) => state === "UP");
    return {
      status: healthy ? "healthy" : "degraded",
      timestamp,
      upstreams,
    };
  }
}

export const healthService = new HealthService();
