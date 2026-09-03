import type { FastifyInstance } from "fastify";
import { healthController } from "./health.controller.js";
import { LivenessResponse, ReadinessResponse, ReadyResponse } from "./health.schema.js";

/**
 * Liveness (`/health`) and readiness (`/api/v1/health`, `/ready`).
 * Schemas are TypeBox → Fastify JSON Schema; no untyped handlers.
 */
export async function registerHealthModule(app: FastifyInstance) {
  app.get(
    "/health",
    {
      schema: {
        response: { 200: LivenessResponse },
      },
    },
    (req, reply) => healthController.liveness(req, reply),
  );

  app.get(
    "/api/v1/health",
    {
      schema: {
        response: {
          200: ReadinessResponse,
          503: ReadinessResponse,
        },
      },
    },
    (req, reply) => healthController.readiness(req, reply),
  );

  app.get(
    "/ready",
    {
      schema: {
        response: {
          200: ReadyResponse,
          503: ReadyResponse,
        },
      },
    },
    (req, reply) => healthController.ready(req, reply),
  );
}
