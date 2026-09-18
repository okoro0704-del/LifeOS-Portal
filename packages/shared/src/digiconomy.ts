/**
 * Digiconomy taxonomy for LifeOS Portal.
 *
 * Taxonomy buckets describe catalog families. They are NOT provisioning engines,
 * NOT capabilities, and NOT exclusive ecosystem participation rights.
 *
 * - industry: domain OS verticals (Hospitality / Transport / Service)
 * - cross_industry: personal/creator apps (mybrandOS) that can span industries
 * - ecommerce_ecosystem: EcommerceOS catalog family in Phase 1
 *
 * IMPORTANT: ecommerce_ecosystem does NOT mean "only these apps may participate
 * in commerce." Later phases will attach commerce participation/composition to
 * industry and cross_industry applications without changing their bucket.
 *
 * Engine ≠ application identity. Bucket ≠ capability. Vertical ≠ tenant.
 */

import {
  BUSINESS_OS_CATALOG,
  ECOMMERCEOS_INSTALL_TEMPLATES,
  HOSPITALITYOS_INSTALL_TEMPLATES,
  MYBRANDOS_MANIFEST,
  SERVICEOS_INSTALL_TEMPLATES,
  TRANSPORTATIONOS_INSTALL_TEMPLATES,
  getVertical,
} from "./catalog.js";
import { mybrandOsDeliverables, tenantDeliverables } from "./urls.js";

export const DIGICONOMY_BUCKETS = ["industry", "cross_industry", "ecommerce_ecosystem"] as const;

export type DigiconomyBucket = (typeof DIGICONOMY_BUCKETS)[number];

export type DigiconomyEngineId =
  | "mybrandos"
  | "hospitalityos"
  | "ecommerceos"
  | "transportationos"
  | "serviceos";

export type DigiconomyCatalogEntry = {
  /** Stable catalog key for UI cards / deep links (template or personal app id). */
  catalogKey: string;
  engine: DigiconomyEngineId;
  /** Lane used by Portal install UX. */
  lane: "personal" | "business";
  verticalId: string;
  displayName: string;
  description: string;
  available: boolean;
  bucket: DigiconomyBucket;
  templateId?: string;
  modules: readonly string[];
  priceMonthlyMinor?: number;
  currency?: "USD";
  hasPhysicalAddress?: boolean;
  preset?: string | string[];
  customerPurchase?: boolean;
};

/**
 * Resolve the primary Digiconomy taxonomy bucket for an engine + vertical.
 * Throws if the pair is installable-looking but unclassified.
 */
export function digiconomyBucketFor(input: {
  engine?: string | null;
  osId?: string | null;
  appId?: string | null;
  verticalId?: string | null;
}): DigiconomyBucket {
  const engine = (input.engine || input.osId || input.appId || "").toLowerCase().trim();
  const verticalId = (input.verticalId || "").toLowerCase().trim();

  if (engine === "mybrandos" || verticalId === "creator") {
    return "cross_industry";
  }

  if (engine === "ecommerceos") {
    // Phase 1: EcommerceOS catalog family is classified under ecommerce_ecosystem.
    // This bucket does NOT define exclusive commerce participation.
    return "ecommerce_ecosystem";
  }

  if (engine === "hospitalityos" || engine === "transportationos" || engine === "serviceos") {
    return "industry";
  }

  throw new Error(
    `UNCLASSIFIED Digiconomy catalog entry: engine=${engine || "(empty)"} verticalId=${verticalId || "(empty)"}`,
  );
}

/** Every currently installable catalog entry with exactly one bucket. */
export function listInstallableDigiconomyEntries(): DigiconomyCatalogEntry[] {
  const entries: DigiconomyCatalogEntry[] = [
    {
      catalogKey: "mybrandos",
      engine: "mybrandos",
      lane: "personal",
      verticalId: "creator",
      displayName: MYBRANDOS_MANIFEST.displayName,
      description: MYBRANDOS_MANIFEST.description,
      available: MYBRANDOS_MANIFEST.available,
      bucket: digiconomyBucketFor({ engine: "mybrandos", verticalId: "creator" }),
      modules: [],
    },
  ];

  for (const template of HOSPITALITYOS_INSTALL_TEMPLATES) {
    const vertical = getVertical("hospitalityos", template.verticalId);
    if (!vertical) {
      throw new Error(`UNCLASSIFIED: hospitalityos/${template.verticalId} missing from BUSINESS_OS_CATALOG`);
    }
    entries.push({
      catalogKey: template.id,
      engine: "hospitalityos",
      lane: "business",
      verticalId: template.verticalId,
      displayName: template.label,
      description: template.description,
      available: vertical.available,
      bucket: digiconomyBucketFor({ engine: "hospitalityos", verticalId: template.verticalId }),
      templateId: template.id,
      modules: template.modules,
      priceMonthlyMinor: vertical.priceMonthlyMinor,
      currency: vertical.currency,
      preset:
        template.verticalId === "local_food"
          ? "local_food"
          : template.verticalId === "shared_homes"
            ? "shared_homes"
            : undefined,
    });
  }

  for (const template of ECOMMERCEOS_INSTALL_TEMPLATES) {
    const vertical = getVertical("ecommerceos", template.verticalId);
    if (!vertical) {
      throw new Error(`UNCLASSIFIED: ecommerceos/${template.verticalId} missing from BUSINESS_OS_CATALOG`);
    }
    entries.push({
      catalogKey: template.id,
      engine: "ecommerceos",
      lane: "business",
      verticalId: template.verticalId,
      displayName: template.label,
      description: template.description,
      available: vertical.available,
      bucket: digiconomyBucketFor({ engine: "ecommerceos", verticalId: template.verticalId }),
      templateId: template.id,
      modules: template.modules,
      priceMonthlyMinor: vertical.priceMonthlyMinor,
      currency: vertical.currency,
      hasPhysicalAddress: template.hasPhysicalAddress,
      customerPurchase: template.customerPurchase !== false,
    });
  }

  for (const template of TRANSPORTATIONOS_INSTALL_TEMPLATES) {
    const vertical = getVertical("transportationos", template.verticalId);
    if (!vertical) {
      throw new Error(`UNCLASSIFIED: transportationos/${template.verticalId} missing from BUSINESS_OS_CATALOG`);
    }
    entries.push({
      catalogKey: template.id,
      engine: "transportationos",
      lane: "business",
      verticalId: template.verticalId,
      displayName: template.label,
      description: template.description,
      available: vertical.available,
      bucket: digiconomyBucketFor({ engine: "transportationos", verticalId: template.verticalId }),
      templateId: template.id,
      modules: template.modules,
      priceMonthlyMinor: vertical.priceMonthlyMinor,
      currency: vertical.currency,
      preset: Array.isArray(template.preset) ? "hub" : template.preset,
    });
  }

  for (const template of SERVICEOS_INSTALL_TEMPLATES) {
    const vertical = getVertical("serviceos", template.verticalId);
    if (!vertical) {
      throw new Error(`UNCLASSIFIED: serviceos/${template.verticalId} missing from BUSINESS_OS_CATALOG`);
    }
    entries.push({
      catalogKey: template.id,
      engine: "serviceos",
      lane: "business",
      verticalId: template.verticalId,
      displayName: template.label,
      description: template.description,
      available: vertical.available,
      bucket: digiconomyBucketFor({ engine: "serviceos", verticalId: template.verticalId }),
      templateId: template.id,
      modules: template.modules,
      priceMonthlyMinor: vertical.priceMonthlyMinor,
      currency: vertical.currency,
      preset: template.preset,
    });
  }

  for (const entry of entries) {
    if (!entry.bucket) {
      throw new Error(`UNCLASSIFIED: ${entry.engine}/${entry.verticalId}`);
    }
    if (!DIGICONOMY_BUCKETS.includes(entry.bucket)) {
      throw new Error(`Invalid Digiconomy bucket for ${entry.engine}/${entry.verticalId}: ${entry.bucket}`);
    }
  }

  return entries;
}

export function digiconomyEntriesByBucket(bucket: DigiconomyBucket): DigiconomyCatalogEntry[] {
  return listInstallableDigiconomyEntries().filter((entry) => entry.bucket === bucket);
}

/**
 * Additive Digiconomy identity fields for Directory / LifeOS / Shell projections.
 * digiconomyApplicationId is ALWAYS the stable Portal install id — never a new UUID.
 * Taxonomy comes only from digiconomyBucketFor (single authority).
 */
export function digiconomyIdentityFields(input: {
  id: string;
  appId?: string;
  osId: string;
  verticalId: string;
}): {
  digiconomyApplicationId: string;
  bucket: DigiconomyBucket;
  engine: string;
  verticalId: string;
} {
  const engine = input.osId || input.appId || "";
  return {
    digiconomyApplicationId: input.id,
    bucket: digiconomyBucketFor({
      engine,
      osId: input.osId,
      appId: input.appId,
      verticalId: input.verticalId,
    }),
    engine,
    verticalId: input.verticalId,
  };
}

/**
 * Digiconomy-facing application projection derived from Portal install fields.
 * digiconomyApplicationId uses the stable Portal install id (survives redeploy).
 *
 * publicUrl / adminUrl come from declared deliverable surface contracts —
 * not invented per-bucket. Management is the declared adminDashboard surface.
 */
export function deriveDigiconomyApplicationProjection(input: {
  id: string;
  appId?: string;
  osId: string;
  verticalId: string;
  subdomain: string;
  customDomain?: string;
}): {
  digiconomyApplicationId: string;
  bucket: DigiconomyBucket;
  engine: string;
  verticalId: string;
  subdomain: string;
  publicUrl: string;
  adminUrl: string;
} {
  const identity = digiconomyIdentityFields(input);
  const deliverables =
    identity.engine === "mybrandos"
      ? mybrandOsDeliverables({ slug: input.subdomain, customDomain: input.customDomain })
      : tenantDeliverables(input.subdomain, input.customDomain);

  return {
    ...identity,
    subdomain: input.subdomain,
    publicUrl: deliverables.guestApp.url,
    adminUrl: deliverables.adminDashboard.url,
  };
}

/** Additive enrichment for Catalog API / consumers. */
export function withDigiconomyTaxonomy<T extends { osId: string; id: string }>(
  vertical: T,
): T & { bucket: DigiconomyBucket; engine: string } {
  return {
    ...vertical,
    engine: vertical.osId,
    bucket: digiconomyBucketFor({ engine: vertical.osId, verticalId: vertical.id }),
  };
}

export function businessOsCatalogWithTaxonomy() {
  return BUSINESS_OS_CATALOG.map((os) => {
    const verticals = os.verticals.map((vertical) => withDigiconomyTaxonomy(vertical));
    let bucket: DigiconomyBucket | undefined;
    if (os.osId === "hospitalityos" || os.osId === "transportationos" || os.osId === "serviceos") {
      bucket = "industry";
    } else if (os.osId === "ecommerceos") {
      // Catalog family classification only — not exclusive commerce participation.
      bucket = "ecommerce_ecosystem";
    }
    return {
      ...os,
      engine: os.osId,
      ...(bucket ? { bucket } : {}),
      verticals,
    };
  });
}

export function personalOsCatalogWithTaxonomy() {
  return [
    {
      ...MYBRANDOS_MANIFEST,
      engine: "mybrandos" as const,
      verticalId: "creator" as const,
      bucket: digiconomyBucketFor({ engine: "mybrandos", verticalId: "creator" }),
    },
  ];
}

/** Guard used by tests — throws listing any unclassified installable vertical. */
export function assertAllInstallableEntriesClassified(): {
  total: number;
  industry: number;
  crossIndustry: number;
  ecommerceEcosystem: number;
} {
  const entries = listInstallableDigiconomyEntries().filter((entry) => entry.available);
  // Also ensure every available BUSINESS_OS vertical appears in the installable list.
  for (const os of BUSINESS_OS_CATALOG) {
    if (!os.available) continue;
    for (const vertical of os.verticals) {
      if (!vertical.available) continue;
      const hit = entries.find((entry) => entry.engine === os.osId && entry.verticalId === vertical.id);
      if (!hit) {
        throw new Error(`UNCLASSIFIED: ${os.osId}/${vertical.id} — missing from installable Digiconomy catalog`);
      }
    }
  }
  return {
    total: entries.length,
    industry: entries.filter((entry) => entry.bucket === "industry").length,
    crossIndustry: entries.filter((entry) => entry.bucket === "cross_industry").length,
    ecommerceEcosystem: entries.filter((entry) => entry.bucket === "ecommerce_ecosystem").length,
  };
}
