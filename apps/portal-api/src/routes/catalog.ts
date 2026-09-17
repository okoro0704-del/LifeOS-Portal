import type { FastifyInstance } from "fastify";
import {
  BUSINESS_OS_CATALOG,
  ECOMMERCEOS_MANIFEST,
  HOSPITALITYOS_MANIFEST,
  TRANSPORTATIONOS_MANIFEST,
  SERVICEOS_MANIFEST,
  LIFEOS_PRIMITIVE_IDS,
  PERSONAL_OS_CATALOG,
  MYBRANDOS_MANIFEST,
  PORTAL_LANES,
  DIGICONOMY_BUCKETS,
  DIGICONOMY_ECOSYSTEMS,
  ECOMMERCE_ECOSYSTEM_CAPABILITIES,
  businessOsCatalogWithTaxonomy,
  personalOsCatalogWithTaxonomy,
  listInstallableDigiconomyEntries,
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
      serviceos: SERVICEOS_MANIFEST,
      // Additive Digiconomy taxonomy (Phase 1) — does not replace existing keys.
      digiconomy: {
        buckets: DIGICONOMY_BUCKETS,
        /**
         * ecommerce_ecosystem classifies the EcommerceOS catalog family in Phase 1.
         * It does NOT mean only those apps may participate in commerce.
         * Phase 3 participation is a separate composition layer (see ecosystems).
         */
        ecosystems: DIGICONOMY_ECOSYSTEMS,
        ecommerceCapabilities: ECOMMERCE_ECOSYSTEM_CAPABILITIES,
        personalOs: personalOsCatalogWithTaxonomy(),
        businessOs: businessOsCatalogWithTaxonomy(),
        installable: listInstallableDigiconomyEntries(),
      },
    };
  });
}
