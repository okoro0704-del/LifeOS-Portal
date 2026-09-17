/**
 * Digiconomy ecosystem participation (Phase 3).
 *
 * Answers: "What commerce capabilities does this application participate in?"
 *
 * Constitution:
 * - BUCKET ≠ CAPABILITY ≠ ECOSYSTEM PARTICIPATION
 * - ECOMMERCEOS ≠ ECOMMERCE ECOSYSTEM
 * - COMMERCE PARTICIPATION ≠ NEW APPLICATION
 * - Domain implementations stay separate (menu≠SKU); this layer is semantic only
 *
 * DERIVE FIRST from engine / vertical / modules. No second identity. No domain DB merge.
 */

export const DIGICONOMY_ECOSYSTEMS = ["ecommerce"] as const;
export type DigiconomyEcosystemId = (typeof DIGICONOMY_ECOSYSTEMS)[number];

/**
 * Shared semantic Ecommerce Ecosystem capabilities.
 * These are participation contracts — not product/order/menu schemas.
 */
export const ECOMMERCE_ECOSYSTEM_CAPABILITIES = [
  "catalog",
  "ordering",
  "checkout",
  "payment",
  "logistics",
] as const;

export type EcommerceEcosystemCapability = (typeof ECOMMERCE_ECOSYSTEM_CAPABILITIES)[number];

/**
 * - active: participates now (capabilities derived from installed modules / vertical)
 * - eligible: may participate without reclassification (e.g. mybrandOS creator)
 * - none: not a commerce participant in this ecosystem
 */
export type DigiconomyParticipationStatus = "active" | "eligible" | "none";

/**
 * Domain implementation hint for consumers.
 * Does NOT merge Hospitality menu with Ecommerce SKU; signals which local model applies.
 */
export type DigiconomyCommerceDomainModel =
  | "menu_order"
  | "retail_commerce"
  | "service_catalog"
  | "creator_offers"
  | "logistics_network"
  | "none";

export type DigiconomyEcosystemParticipation = {
  ecosystem: DigiconomyEcosystemId;
  status: DigiconomyParticipationStatus;
  capabilities: EcommerceEcosystemCapability[];
  domainModel: DigiconomyCommerceDomainModel;
};

function moduleSet(input: {
  enabledModules?: readonly string[] | null;
  modulesEnabled?: readonly string[] | null;
}): Set<string> {
  const next = new Set<string>();
  for (const list of [input.enabledModules, input.modulesEnabled]) {
    for (const raw of list ?? []) {
      const id = String(raw || "")
        .toLowerCase()
        .trim();
      if (id) next.add(id);
    }
  }
  return next;
}

function uniqCaps(caps: EcommerceEcosystemCapability[]): EcommerceEcosystemCapability[] {
  const order = ECOMMERCE_ECOSYSTEM_CAPABILITIES;
  return order.filter((cap) => caps.includes(cap));
}

function capsFromEcommerceModules(modules: Set<string>): EcommerceEcosystemCapability[] {
  const caps: EcommerceEcosystemCapability[] = [];
  if (
    modules.has("catalog") ||
    modules.has("inventory") ||
    modules.has("storefront")
  ) {
    caps.push("catalog");
  }
  if (modules.has("pos") || modules.has("cart") || modules.has("orders")) {
    caps.push("ordering");
  }
  if (modules.has("checkout")) {
    caps.push("checkout");
  }
  if (modules.has("billing") || modules.has("checkout")) {
    // Ecommerce checkout expands to checkout+billing; billing alone still implies payment rail.
    if (!caps.includes("payment")) caps.push("payment");
  }
  if (modules.has("logisticsbridge") || modules.has("logistics_bridge")) {
    caps.push("logistics");
  }
  return uniqCaps(caps);
}

function hospitalityMenuOrderCaps(
  verticalId: string,
  modules: Set<string>,
): EcommerceEcosystemCapability[] {
  const diningVertical =
    verticalId === "restaurant" ||
    verticalId === "local_food" ||
    verticalId === "bar" ||
    verticalId === "resort";
  const diningModules =
    modules.has("dining") ||
    modules.has("local_food") ||
    modules.has("bar") ||
    modules.has("restaurant");

  if (!diningVertical && !diningModules) return [];

  const caps: EcommerceEcosystemCapability[] = ["catalog", "ordering"];
  // Local food / takeaway fulfillment — semantic logistics, not TransportationOS identity.
  if (
    verticalId === "local_food" ||
    modules.has("local_food") ||
    modules.has("delivery")
  ) {
    caps.push("logistics");
  }
  return uniqCaps(caps);
}

function serviceCatalogCaps(modules: Set<string>): EcommerceEcosystemCapability[] {
  const caps: EcommerceEcosystemCapability[] = [];
  if (modules.has("catalog") || modules.has("studio") || modules.size === 0) {
    // ServiceOS always ships a service catalog in platform modules.
    caps.push("catalog");
  }
  if (modules.has("dispatch") || modules.has("matching")) {
    caps.push("ordering");
  }
  if (modules.has("settlement") || modules.has("billing")) {
    caps.push("payment");
  }
  if (modules.has("tracking") || modules.has("telemetry")) {
    caps.push("logistics");
  }
  return uniqCaps(caps.length ? caps : ["catalog"]);
}

function transportationCaps(
  verticalId: string,
  modules: Set<string>,
): EcommerceEcosystemCapability[] {
  const caps: EcommerceEcosystemCapability[] = [];
  if (
    verticalId === "logistics" ||
    verticalId === "hub" ||
    modules.has("fleet") ||
    modules.has("dispatch") ||
    modules.has("rider_console")
  ) {
    caps.push("logistics");
    if (modules.has("dispatch") || modules.has("matching") || verticalId === "logistics" || verticalId === "hub") {
      caps.push("ordering");
    }
  }
  if (
    verticalId === "rentals" ||
    verticalId === "hub" ||
    modules.has("rental_bookings") ||
    modules.has("rental_fleet")
  ) {
    caps.push("catalog");
    caps.push("ordering");
  }
  if (modules.has("settlement") || modules.has("billing") || modules.has("rental_escrow")) {
    caps.push("payment");
  }
  return uniqCaps(caps);
}

/**
 * Derive Ecommerce Ecosystem participation for a canonical Digiconomy application.
 * Does not change taxonomy bucket. Does not create EcommerceOS identity.
 */
export function deriveEcommerceParticipation(input: {
  osId?: string | null;
  appId?: string | null;
  verticalId?: string | null;
  enabledModules?: readonly string[] | null;
  modulesEnabled?: readonly string[] | null;
}): DigiconomyEcosystemParticipation {
  const engine = (input.osId || input.appId || "").toLowerCase().trim();
  const verticalId = (input.verticalId || "").toLowerCase().trim();
  const modules = moduleSet(input);

  if (engine === "ecommerceos") {
    const capabilities = capsFromEcommerceModules(modules);
    return {
      ecosystem: "ecommerce",
      status: "active",
      capabilities:
        capabilities.length > 0
          ? capabilities
          : uniqCaps(["catalog", "ordering", "checkout", "payment", "logistics"]),
      domainModel: "retail_commerce",
    };
  }

  if (engine === "hospitalityos") {
    const capabilities = hospitalityMenuOrderCaps(verticalId, modules);
    if (capabilities.length > 0) {
      return {
        ecosystem: "ecommerce",
        status: "active",
        capabilities,
        domainModel: "menu_order",
      };
    }
    return {
      ecosystem: "ecommerce",
      status: "none",
      capabilities: [],
      domainModel: "none",
    };
  }

  if (engine === "serviceos") {
    return {
      ecosystem: "ecommerce",
      status: "active",
      capabilities: serviceCatalogCaps(modules),
      domainModel: "service_catalog",
    };
  }

  if (engine === "transportationos") {
    const capabilities = transportationCaps(verticalId, modules);
    if (capabilities.length > 0) {
      return {
        ecosystem: "ecommerce",
        status: "active",
        capabilities,
        domainModel: "logistics_network",
      };
    }
    return {
      ecosystem: "ecommerce",
      status: "none",
      capabilities: [],
      domainModel: "none",
    };
  }

  if (engine === "mybrandos" || verticalId === "creator") {
    // May participate in commerce without reclassification or a second app identity.
    return {
      ecosystem: "ecommerce",
      status: "eligible",
      capabilities: [],
      domainModel: "creator_offers",
    };
  }

  return {
    ecosystem: "ecommerce",
    status: "none",
    capabilities: [],
    domainModel: "none",
  };
}

/** Flat capability ids for Directory `capabilities` (backward-compatible array shape). */
export function ecommerceCapabilityIdsForDirectory(
  participation: DigiconomyEcosystemParticipation,
): string[] {
  if (participation.status === "none") return [];
  // Eligible apps keep capabilities empty until offers are composed (no fabricated commerce).
  if (participation.status === "eligible") return [];
  return [...participation.capabilities];
}
