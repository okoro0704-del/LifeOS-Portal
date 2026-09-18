/**
 * Portal customer-facing industry navigation groups.
 *
 * PRESENTATION ONLY — does not change Digiconomy buckets, engines, or vertical IDs.
 *
 * DIGICONOMY BUCKET ≠ CUSTOMER INDUSTRY GROUP ≠ ECOSYSTEM PARTICIPATION
 */

import { listInstallableDigiconomyEntries, type DigiconomyCatalogEntry } from "./digiconomy.js";

export const PORTAL_INDUSTRY_GROUP_IDS = [
  "commerce_retail",
  "hospitality_food",
  "services",
  "transportation_mobility",
  "creator_brand",
] as const;

export type PortalIndustryGroupId = (typeof PORTAL_INDUSTRY_GROUP_IDS)[number];

export type PortalIndustryGroup = {
  id: PortalIndustryGroupId;
  label: string;
  description: string;
  order: number;
  /** Primary engines shown under this industry (navigation hint). */
  engines: readonly string[];
  /** Route for the industry experience inside Portal Web. */
  href: string;
};

export const PORTAL_INDUSTRY_GROUPS: PortalIndustryGroup[] = [
  {
    id: "commerce_retail",
    label: "Commerce & Retail",
    description: "Stores, supermarkets, wholesale and commerce",
    order: 1,
    engines: ["ecommerceos"],
    href: "/app/business/commerce",
  },
  {
    id: "hospitality_food",
    label: "Hospitality & Food",
    description: "Hotels, restaurants, food and hospitality",
    order: 2,
    engines: ["hospitalityos"],
    href: "/app/business/hospitality",
  },
  {
    id: "services",
    label: "Services",
    description: "Beauty, wellness, technical and other services",
    order: 3,
    engines: ["serviceos"],
    href: "/app/business?industry=services",
  },
  {
    id: "transportation_mobility",
    label: "Transportation & Mobility",
    description: "Logistics, rentals and mobility businesses",
    order: 4,
    engines: ["transportationos"],
    href: "/app/business?industry=transport",
  },
  {
    id: "creator_brand",
    label: "Creator & Brand",
    description: "Build and operate your Digital Life",
    order: 5,
    engines: ["mybrandos"],
    href: "/app/personal/packs",
  },
];

/** Map engine → industry group. Canonical vertical facts stay in digiconomy/catalog. */
const ENGINE_TO_INDUSTRY: Record<string, PortalIndustryGroupId> = {
  ecommerceos: "commerce_retail",
  hospitalityos: "hospitality_food",
  serviceos: "services",
  transportationos: "transportation_mobility",
  mybrandos: "creator_brand",
};

export function portalIndustryGroupForEngine(engine: string): PortalIndustryGroupId | undefined {
  return ENGINE_TO_INDUSTRY[engine.toLowerCase().trim()];
}

export function portalIndustryGroupForEntry(
  entry: Pick<DigiconomyCatalogEntry, "engine">,
): PortalIndustryGroupId | undefined {
  return portalIndustryGroupForEngine(entry.engine);
}

export function listPortalIndustryGroups(): PortalIndustryGroup[] {
  return [...PORTAL_INDUSTRY_GROUPS].sort((a, b) => a.order - b.order);
}

export function getPortalIndustryGroup(id: string): PortalIndustryGroup | undefined {
  return PORTAL_INDUSTRY_GROUPS.find((g) => g.id === id);
}

/** Every installable catalog entry with its Portal industry group (throws if orphan). */
export function assertAllInstallableEntriesHaveIndustryGroup(): {
  total: number;
  byGroup: Record<PortalIndustryGroupId, number>;
  orphans: Array<{ engine: string; verticalId: string }>;
} {
  const byGroup = Object.fromEntries(
    PORTAL_INDUSTRY_GROUP_IDS.map((id) => [id, 0]),
  ) as Record<PortalIndustryGroupId, number>;
  const orphans: Array<{ engine: string; verticalId: string }> = [];

  for (const entry of listInstallableDigiconomyEntries()) {
    if (!entry.available) continue;
    const group = portalIndustryGroupForEntry(entry);
    if (!group) {
      orphans.push({ engine: entry.engine, verticalId: entry.verticalId });
      continue;
    }
    byGroup[group] += 1;
  }

  if (orphans.length > 0) {
    throw new Error(
      `Orphan Digiconomy catalog entries without Portal industry group: ${orphans
        .map((o) => `${o.engine}/${o.verticalId}`)
        .join(", ")}`,
    );
  }

  return {
    total: Object.values(byGroup).reduce((a, b) => a + b, 0),
    byGroup,
    orphans,
  };
}
