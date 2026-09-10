import type { FastifyInstance } from "fastify";
import {
  BUSINESS_OS_CATALOG,
  ECOMMERCEOS_MANIFEST,
  HOSPITALITYOS_MANIFEST,
  TRANSPORTATIONOS_MANIFEST,
  LIFEOS_PRIMITIVE_IDS,
  PERSONAL_OS_CATALOG,
  MYBRANDOS_MANIFEST,
  PORTAL_LANES,
} from "@lifeos-portal/shared";
import { requireSession } from "../lib/auth.js";
import { isGuestAuthEnabled } from "../lib/guest-auth.js";
import { config } from "../config.js";

export async function registerCatalogRoutes(app: FastifyInstance) {
  app.get("/catalog", async (req, reply) => {
    if (!isGuestAuthEnabled() && config.enableTrustId && !requireSession(req, reply)) return;
    return {
      lanes: PORTAL_LANES,
      personalOs: PERSONAL_OS_CATALOG,
      mybrandos: MYBRANDOS_MANIFEST,
      businessOs: BUSINESS_OS_CATALOG,
      primitives: LIFEOS_PRIMITIVE_IDS,
      hospitalityos: HOSPITALITYOS_MANIFEST,
      ecommerceos: ECOMMERCEOS_MANIFEST,
      transportationos: TRANSPORTATIONOS_MANIFEST,
    };
  });
}
