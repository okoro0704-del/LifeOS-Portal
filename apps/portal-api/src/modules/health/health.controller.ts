import type { FastifyReply, FastifyRequest } from "fastify";
import { env } from "../../config/env.js";
import { healthService } from "./health.service.js";

export class HealthController {
  liveness(_req: FastifyRequest, _reply: FastifyReply) {
    return healthService.liveness();
  }

  async readiness(_req: FastifyRequest, reply: FastifyReply) {
    const report = await healthService.readiness();
    return reply.code(report.status === "healthy" ? 200 : 503).send(report);
  }

  async ready(_req: FastifyRequest, reply: FastifyReply) {
    const report = await healthService.readiness();
    return reply.code(report.status === "healthy" ? 200 : 503).send({
      ready: report.status === "healthy",
      service: "lifeos-portal-api",
      mode: env.gatewayMode,
      ...report,
    });
  }
}

export const healthController = new HealthController();
