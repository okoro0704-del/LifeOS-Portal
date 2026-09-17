/**
 * Digiconomy Ecommerce Ecosystem discovery / composition (Phase 4).
 *
 * Answers: which canonical applications participate in ecommerce, and by which
 * semantic capabilities — without owning their domain commerce data.
 *
 * DERIVED from Phase 3 DigiconomyEcosystemParticipation + Directory projection.
 * No EcommerceParticipant table. No Universal Product/Order. No Plaza.
 *
 * CAPABILITY ≠ AUTHORIZATION. Discovery ≠ transaction execution.
 * OBJECTIVE ≠ CAPABILITY (Shell objective routing is out of scope).
 */

import {
  DIGICONOMY_ECOSYSTEMS,
  ECOMMERCE_ECOSYSTEM_CAPABILITIES,
  type DigiconomyEcosystemId,
  type DigiconomyEcosystemParticipation,
  type DigiconomyParticipationStatus,
  type EcommerceEcosystemCapability,
} from "./digiconomy-participation.js";

export type DigiconomyDiscoveryQuery = {
  /** When set, only applications in this ecosystem (excluding status=none unless status overridden). */
  ecosystem?: DigiconomyEcosystemId;
  /** When set, only ACTIVE applications declaring this capability. */
  capability?: EcommerceEcosystemCapability;
  /** Explicit participation status filter. */
  status?: DigiconomyParticipationStatus;
};

export type DigiconomyDiscoverableParticipant = {
  applicationId: string;
  digiconomyApplicationId: string;
  name: string;
  engine: string;
  verticalId: string;
  bucket: string;
  publicSurface: string;
  ecommerce: DigiconomyEcosystemParticipation;
};

/** Type guard for ecosystem query values. */
export function isDigiconomyEcosystemId(value: string): value is DigiconomyEcosystemId {
  return (DIGICONOMY_ECOSYSTEMS as readonly string[]).includes(value);
}

/** Type guard for capability query values. */
export function isEcommerceEcosystemCapability(value: string): value is EcommerceEcosystemCapability {
  return (ECOMMERCE_ECOSYSTEM_CAPABILITIES as readonly string[]).includes(value);
}

export function isDigiconomyParticipationStatus(value: string): value is DigiconomyParticipationStatus {
  return value === "active" || value === "eligible" || value === "none";
}

/**
 * Pure participation match for discovery queries.
 * Capability queries require status=active and an explicit capability declaration.
 */
export function matchesEcommerceDiscovery(
  participation: DigiconomyEcosystemParticipation,
  query: DigiconomyDiscoveryQuery,
): boolean {
  if (query.ecosystem && participation.ecosystem !== query.ecosystem) {
    return false;
  }

  if (query.status) {
    if (participation.status !== query.status) return false;
  } else if (query.ecosystem) {
    // Ecosystem filter without explicit status: exclude non-participants.
    if (participation.status === "none") return false;
  }

  if (query.capability) {
    if (participation.status !== "active") return false;
    if (!participation.capabilities.includes(query.capability)) return false;
  }

  return true;
}

export function filterByEcommerceDiscovery<
  T extends { ecommerceParticipation: DigiconomyEcosystemParticipation },
>(applications: readonly T[], query: DigiconomyDiscoveryQuery): T[] {
  if (!query.ecosystem && !query.capability && !query.status) {
    return [...applications];
  }
  return applications.filter((app) => matchesEcommerceDiscovery(app.ecommerceParticipation, query));
}

/**
 * Normalize a Directory-style application into a composition participant view.
 * Does not create a second identity — applicationId === digiconomyApplicationId === install id.
 */
export function toDigiconomyDiscoverableParticipant(input: {
  id: string;
  digiconomyApplicationId: string;
  name: string;
  engine: string;
  verticalId: string;
  bucket: string;
  productionUrl: string;
  ecommerceParticipation: DigiconomyEcosystemParticipation;
}): DigiconomyDiscoverableParticipant {
  return {
    applicationId: input.id,
    digiconomyApplicationId: input.digiconomyApplicationId,
    name: input.name,
    engine: input.engine,
    verticalId: input.verticalId,
    bucket: input.bucket,
    publicSurface: input.productionUrl.endsWith("/")
      ? input.productionUrl
      : `${input.productionUrl}/`,
    ecommerce: input.ecommerceParticipation,
  };
}

export function parseEcommerceDiscoveryQuery(input: {
  ecosystem?: string | null;
  capability?: string | null;
  status?: string | null;
}): { ok: true; query: DigiconomyDiscoveryQuery } | { ok: false; error: string } {
  const query: DigiconomyDiscoveryQuery = {};

  if (input.ecosystem != null && input.ecosystem !== "") {
    const value = input.ecosystem.trim().toLowerCase();
    if (!isDigiconomyEcosystemId(value)) {
      return { ok: false, error: `Unknown ecosystem: ${input.ecosystem}` };
    }
    query.ecosystem = value;
  }

  if (input.capability != null && input.capability !== "") {
    const value = input.capability.trim().toLowerCase();
    if (!isEcommerceEcosystemCapability(value)) {
      return { ok: false, error: `Unknown capability: ${input.capability}` };
    }
    query.capability = value;
  }

  if (input.status != null && input.status !== "") {
    const value = input.status.trim().toLowerCase();
    if (!isDigiconomyParticipationStatus(value)) {
      return { ok: false, error: `Unknown status: ${input.status}` };
    }
    query.status = value;
  }

  return { ok: true, query };
}
