/**
 * LifeOS Portal catalog — lanes, business OS, and HospitalityOS verticals.
 * The Portal is not an app store. You license a vertical inside a domain OS.
 */

export const LIFEOS_PRIMITIVE_IDS = [
  "trust-id",
  "elfcom",
  "sovereign-drive",
  "platform-jobs",
  "master-distributor",
  "fundzman",
] as const;

export type LifeOsPrimitiveId = (typeof LIFEOS_PRIMITIVE_IDS)[number];

export type RequiredLifeOsPrimitive =
  | "identity"
  | "messaging"
  | "storage"
  | "jobs"
  | "distributor"
  | "billing";

export type DistributorPrimitive = "hospitality" | "commerce" | "identity" | "billing" | "messaging";

export type OsLaneId = "personal" | "business";

export type PortalLane = {
  id: OsLaneId;
  displayName: string;
  description: string;
  available: boolean;
};

export const PORTAL_LANES: PortalLane[] = [
  {
    id: "personal",
    displayName: "Personal OS",
    description: "Your life shell — identity, wallet, and daily operating system.",
    available: false,
  },
  {
    id: "business",
    displayName: "Business OS",
    description: "License a domain operating system for a real-world vertical.",
    available: true,
  },
];

/** Shared HospitalityOS platform modules enabled on every vertical install. */
export const HOSPITALITY_PLATFORM_MODULES = [
  "staff_management",
  "customer_management",
  "notifications",
  "billing",
  "inventory",
] as const;

export const SUITE_VERTICAL_MODULES = [
  "accommodation",
  "shared_homes",
  "dining",
  "local_food",
  "bar",
  "gym_spa",
  "events",
] as const;

export type SuiteVerticalModuleId = (typeof SUITE_VERTICAL_MODULES)[number];

export const SUITE_SHARED_MODULES = ["billing", "crm"] as const;

export type SuiteSharedModuleId = (typeof SUITE_SHARED_MODULES)[number];

export type SuiteModuleId = SuiteVerticalModuleId | SuiteSharedModuleId;

export type HospitalityInstallTemplateId =
  | "standalone_hotel"
  | "standalone_restaurant"
  | "standalone_local_food"
  | "standalone_shared_homes"
  | "standalone_gym_spa"
  | "standalone_bar"
  | "standalone_events"
  | "full_hotel_resort"
  | "custom";

export type HospitalityInstallTemplate = {
  id: HospitalityInstallTemplateId;
  verticalId: HospitalityVerticalId;
  label: string;
  description: string;
  modules: SuiteModuleId[];
};

export const HOSPITALITYOS_INSTALL_TEMPLATES: HospitalityInstallTemplate[] = [
  {
    id: "standalone_hotel",
    verticalId: "hotel",
    label: "Hotel / Resort",
    description: "Rooms, stays, housekeeping, and front desk — lodging without F&B.",
    modules: ["accommodation", "billing", "crm"],
  },
  {
    id: "standalone_restaurant",
    verticalId: "restaurant",
    label: "Standalone Restaurant",
    description: "POS, menus, and kitchen display — no rooms or housekeeping.",
    modules: ["dining", "billing", "crm"],
  },
  {
    id: "standalone_local_food",
    verticalId: "local_food",
    label: "🍲 Local Food & Home Kitchen OS",
    description:
      "Home cooks, food stalls, and local caterers — GPS kitchens, delivery, Finprove escrow.",
    modules: ["local_food", "billing", "crm"],
  },
  {
    id: "standalone_shared_homes",
    verticalId: "shared_homes",
    label: "Shared Homes / Apartment",
    description: "Apartments and short-lets — unit inventory and guest stays.",
    modules: ["shared_homes", "billing", "crm"],
  },
  {
    id: "standalone_gym_spa",
    verticalId: "gym",
    label: "Standalone Gym / Spa",
    description: "Memberships, class schedules, and day passes.",
    modules: ["gym_spa", "billing", "crm"],
  },
  {
    id: "standalone_bar",
    verticalId: "bar",
    label: "Standalone Bar",
    description: "Beverage POS and open tabs.",
    modules: ["bar", "billing", "crm"],
  },
  {
    id: "standalone_events",
    verticalId: "events",
    label: "Cinema & Events Venue",
    description: "Venues, ticketing, showtimes, and hall booking.",
    modules: ["events", "billing", "crm"],
  },
  {
    id: "full_hotel_resort",
    verticalId: "resort",
    label: "Full Resort & Leisure Complex",
    description:
      "Accommodation as the primary anchor with dining, bar, gym/spa, and events — including charge-to-room folio.",
    modules: ["accommodation", "dining", "bar", "gym_spa", "events", "billing", "crm"],
  },
  {
    id: "custom",
    verticalId: "custom",
    label: "Custom",
    description: "Pick any combination of hospitality modules.",
    modules: ["billing", "crm"],
  },
];

const SUITE_TO_INTERNAL: Record<SuiteModuleId, string[]> = {
  accommodation: ["accommodation", "reservations"],
  shared_homes: ["accommodation", "reservations"],
  dining: ["restaurant"],
  local_food: ["restaurant"],
  bar: ["restaurant"],
  gym_spa: ["gym_membership", "fitness_classes", "spa_services", "wellness_packages"],
  events: ["events", "ticketing", "venue_booking"],
  billing: ["billing"],
  crm: ["customer_management"],
};

export function normalizeSuiteModules(input: readonly string[]): SuiteModuleId[] {
  const allowed = new Set<string>([...SUITE_VERTICAL_MODULES, ...SUITE_SHARED_MODULES]);
  const next = new Set<SuiteModuleId>(SUITE_SHARED_MODULES);
  for (const raw of input) {
    if (allowed.has(raw)) next.add(raw as SuiteModuleId);
  }
  if (next.has("shared_homes") && next.has("accommodation")) next.delete("accommodation");
  if (next.has("local_food") && next.has("dining")) next.delete("dining");
  return [...SUITE_VERTICAL_MODULES, ...SUITE_SHARED_MODULES].filter((id) => next.has(id));
}

export function expandSuiteToInternal(suite: readonly string[]): string[] {
  const normalized = normalizeSuiteModules(suite);
  const next = new Set<string>(HOSPITALITY_PLATFORM_MODULES);
  for (const id of normalized) {
    for (const internal of SUITE_TO_INTERNAL[id]) next.add(internal);
  }
  return [...next];
}

export function folioChargeEnabled(suite: readonly string[]): boolean {
  const set = new Set(normalizeSuiteModules(suite));
  if (!set.has("accommodation") && !set.has("shared_homes")) return false;
  return set.has("dining") || set.has("bar") || set.has("gym_spa");
}

export type HospitalityVerticalId =
  | "hotel"
  | "restaurant"
  | "local_food"
  | "shared_homes"
  | "gym"
  | "bar"
  | "events"
  | "resort"
  | "custom";

export type CatalogVertical = {
  id: string;
  displayName: string;
  description: string;
  osId: string;
  available: boolean;
  /** Monthly license in minor units (USD cents). Billed before install. */
  priceMonthlyMinor: number;
  currency: "USD";
  modules: readonly string[];
};

export type CatalogBusinessOs = {
  osId: string;
  displayName: string;
  version: string;
  description: string;
  available: boolean;
  requiredPrimitives: RequiredLifeOsPrimitive[];
  verticals: CatalogVertical[];
};

export const HOSPITALITY_VERTICALS: CatalogVertical[] = HOSPITALITYOS_INSTALL_TEMPLATES.map(
  (template) => {
    const prices: Record<HospitalityVerticalId, number> = {
      hotel: 4900,
      restaurant: 3900,
      local_food: 2900,
      shared_homes: 3900,
      gym: 3500,
      bar: 3500,
      events: 4500,
      resort: 7900,
      custom: 2900,
    };
    return {
      id: template.verticalId,
      displayName: template.label,
      description: template.description,
      osId: "hospitalityos" as const,
      available: true,
      priceMonthlyMinor: prices[template.verticalId],
      currency: "USD" as const,
      modules: expandSuiteToInternal(template.modules),
    };
  },
);

export type EcommerceVerticalId = "retail" | "delivery";

export type EcommerceInstallTemplate = {
  id: "physical_retail" | "ecommerce_delivery";
  verticalId: EcommerceVerticalId;
  label: string;
  description: string;
  /** Same commerce stack; only the shop-address flag differs. */
  hasPhysicalAddress: boolean;
  modules: string[];
};

/** Shared ECommerceOS stack — catalog, till, checkout, and local delivery. */
export const ECOMMERCE_CORE_MODULES = ["catalog", "pos", "checkout", "logisticsBridge"] as const;

export const ECOMMERCEOS_INSTALL_TEMPLATES: EcommerceInstallTemplate[] = [
  {
    id: "physical_retail",
    verticalId: "retail",
    label: "Retail with a physical address",
    description:
      "Same retail engine as online: catalog, checkout, and local delivery. Customers can also walk into a shop.",
    hasPhysicalAddress: true,
    modules: [...ECOMMERCE_CORE_MODULES],
  },
  {
    id: "ecommerce_delivery",
    verticalId: "delivery",
    label: "Retail without a physical address",
    description:
      "Same retail engine: catalog, checkout, and local delivery. No walk-in shop — orders go out to the customer.",
    hasPhysicalAddress: false,
    modules: [...ECOMMERCE_CORE_MODULES],
  },
];

const ECOMMERCE_PLATFORM_MODULES = ["staff_management"] as const;

const ECOMMERCE_SUITE_TO_INTERNAL: Record<string, string[]> = {
  catalog: ["catalog", "inventory", "storefront"],
  pos: ["cart", "orders"],
  checkout: ["checkout", "billing"],
  logisticsBridge: ["logistics_bridge"],
};

export function expandEcommerceModules(input: readonly string[]): string[] {
  const next = new Set<string>(ECOMMERCE_PLATFORM_MODULES);
  for (const raw of input) {
    const mapped = ECOMMERCE_SUITE_TO_INTERNAL[raw];
    if (mapped) {
      for (const id of mapped) next.add(id);
    } else {
      next.add(raw);
    }
  }
  return [...next];
}

export const ECOMMERCE_VERTICALS: CatalogVertical[] = ECOMMERCEOS_INSTALL_TEMPLATES.map((template) => {
  const prices: Record<EcommerceVerticalId, number> = {
    retail: 3900,
    delivery: 3900,
  };
  return {
    id: template.verticalId,
    displayName: template.label,
    description: template.description,
    osId: "ecommerceos",
    available: true,
    priceMonthlyMinor: prices[template.verticalId],
    currency: "USD",
    modules: expandEcommerceModules(template.modules),
  };
});

export type TransportationVerticalId = "logistics" | "rentals" | "hub";

export type TransportationInstallTemplate = {
  id: "logistics" | "rentals" | "hub";
  verticalId: TransportationVerticalId;
  label: string;
  description: string;
  preset: "logistics" | "rentals" | ["logistics", "rentals"];
  modules: string[];
};

export const TRANSPORTATION_LOGISTICS_MODULES = [
  "fleet",
  "dispatch",
  "matching",
  "telemetry",
  "tracking",
  "settlement",
  "rider_console",
  "billing",
] as const;

export const TRANSPORTATION_RENTAL_MODULES = [
  "rental_fleet",
  "rental_bookings",
  "rental_inspections",
  "rental_escrow",
  "billing",
] as const;

export const TRANSPORTATIONOS_INSTALL_TEMPLATES: TransportationInstallTemplate[] = [
  {
    id: "logistics",
    verticalId: "logistics",
    label: "Last-Mile Delivery & Courier",
    description: "Dispatch, rider fleets, and live customer tracking for last-mile fulfillment.",
    preset: "logistics",
    modules: [...TRANSPORTATION_LOGISTICS_MODULES],
  },
  {
    id: "rentals",
    verticalId: "rentals",
    label: "Car & Fleet Rental Agency",
    description: "Hourly and daily vehicle rentals with Trust ID license checks and Finprove deposits.",
    preset: "rentals",
    modules: [...TRANSPORTATION_RENTAL_MODULES],
  },
  {
    id: "hub",
    verticalId: "hub",
    label: "Integrated Transit & Fleet Hub",
    description: "Courier dispatch plus car/fleet rentals on one TransportationOS tenant.",
    preset: ["logistics", "rentals"],
    modules: [...new Set([...TRANSPORTATION_LOGISTICS_MODULES, ...TRANSPORTATION_RENTAL_MODULES])],
  },
];

export const TRANSPORTATION_VERTICALS: CatalogVertical[] = TRANSPORTATIONOS_INSTALL_TEMPLATES.map((template) => {
  const prices: Record<TransportationVerticalId, number> = {
    logistics: 4500,
    rentals: 4900,
    hub: 7900,
  };
  return {
    id: template.verticalId,
    displayName: template.label,
    description: template.description,
    osId: "transportationos",
    available: true,
    priceMonthlyMinor: prices[template.verticalId],
    currency: "USD",
    modules: [...template.modules],
  };
});

export const BUSINESS_OS_CATALOG: CatalogBusinessOs[] = [
  {
    osId: "hospitalityos",
    displayName: "HospitalityOS",
    version: "0.1.0",
    description:
      "Composable domain suite for hospitality, food, and leisure. Install a standalone restaurant, gym, or bar — or compose them onto a hotel/resort.",
    available: true,
    requiredPrimitives: ["identity", "messaging", "storage", "jobs", "distributor", "billing"],
    verticals: HOSPITALITY_VERTICALS,
  },
  {
    osId: "transportationos",
    displayName: "TransportationOS",
    version: "0.2.0",
    description:
      "Universal mobility platform — last-mile courier fleets and car/fleet rentals with Finprove deposits.",
    available: true,
    requiredPrimitives: ["identity", "messaging", "storage", "jobs", "distributor", "billing"],
    verticals: TRANSPORTATION_VERTICALS,
  },
  {
    osId: "ecommerceos",
    displayName: "ECommerceOS",
    version: "0.1.0",
    description:
      "Retail engine — catalog, checkout, and local delivery. Optional walk-in shop address.",
    available: true,
    requiredPrimitives: ["identity", "messaging", "storage", "jobs", "distributor", "billing"],
    verticals: ECOMMERCE_VERTICALS,
  },
  {
    osId: "logisticsos",
    displayName: "LogisticsOS",
    version: "0.2.0",
    description: "Now a last-mile vertical of TransportationOS. Use TransportationOS to install courier fleets.",
    available: false,
    requiredPrimitives: ["identity", "messaging", "storage", "jobs", "distributor", "billing"],
    verticals: [],
  },
  {
    osId: "enterpriseos",
    displayName: "EnterpriseOS",
    version: "0.0.0",
    description: "Organization-wide operations for enterprises.",
    available: false,
    requiredPrimitives: ["identity", "messaging", "storage", "jobs", "distributor", "billing"],
    verticals: [],
  },
];

export function getBusinessOs(osId: string): CatalogBusinessOs | undefined {
  return BUSINESS_OS_CATALOG.find((os) => os.osId === osId);
}

export function getVertical(osId: string, verticalId: string): CatalogVertical | undefined {
  return getBusinessOs(osId)?.verticals.find((v) => v.id === verticalId);
}

export function modulesForVertical(osId: string, verticalId: string): string[] {
  const vertical = getVertical(osId, verticalId);
  return vertical ? [...vertical.modules] : [];
}

export function suiteModulesForVertical(verticalId: string, extra?: readonly string[]): string[] {
  const template = HOSPITALITYOS_INSTALL_TEMPLATES.find((t) => t.verticalId === verticalId);
  if (!template) return normalizeSuiteModules(extra ?? SUITE_SHARED_MODULES);
  if (template.id === "custom") return normalizeSuiteModules(extra ?? template.modules);
  if (extra?.length) return normalizeSuiteModules([...template.modules, ...extra]);
  return [...template.modules];
}

export function modulesForInstall(osId: string, verticalId: string, enabledModules?: readonly string[]): string[] {
  if (osId === "ecommerceos") {
    if (enabledModules?.length) return expandEcommerceModules(enabledModules);
    return modulesForVertical(osId, verticalId);
  }
  if (osId === "transportationos") {
    if (enabledModules?.length) return [...enabledModules];
    return modulesForVertical(osId, verticalId);
  }
  if (enabledModules?.length) return expandSuiteToInternal(enabledModules);
  return modulesForVertical(osId, verticalId);
}

/** Hotel pack — used when a vertical is not specified (legacy). */
export const HOSPITALITYOS_DEFAULT_MODULES = modulesForVertical("hospitalityos", "hotel");

export const HOSPITALITYOS_OPTIONAL_MODULES = [
  "restaurant",
  "events",
  "ticketing",
  "venue_booking",
  "cinema",
  "gym_membership",
  "fitness_classes",
  "spa_services",
  "beauty_appointments",
  "wellness_packages",
  "equipment_rental",
  "visitor_management",
  "messaging",
  "promotions",
  "loyalty",
  "reviews",
  "analytics",
  "reporting",
] as const;

export type HospitalityOsManifest = {
  appId: "hospitalityos";
  displayName: string;
  version: string;
  description: string;
  distributorPrimitives: DistributorPrimitive[];
  requiredPrimitives: RequiredLifeOsPrimitive[];
  defaultModules: readonly string[];
  optionalModules: readonly string[];
  suiteVerticals: readonly SuiteVerticalModuleId[];
  sharedBaseModules: readonly SuiteSharedModuleId[];
  installTemplates: HospitalityInstallTemplate[];
  brandDefaults: { primaryColor: string; businessType: "hotel" };
  install: {
    bootstrapPath: "/v1/distributor/tenants/bootstrap";
    hosProvisionPath: "/internal/distributor/provision";
    oauthDestinations: string[];
  };
};

export const HOSPITALITYOS_MANIFEST: HospitalityOsManifest = {
  appId: "hospitalityos",
  displayName: "HospitalityOS",
  version: "0.1.0",
  description:
    "Operating system for hospitality, leisure, tourism, and experiences — licensed as a composable suite, not a rigid hotel blob.",
  distributorPrimitives: ["hospitality", "identity", "billing", "messaging"],
  requiredPrimitives: ["identity", "messaging", "storage", "jobs", "distributor", "billing"],
  defaultModules: HOSPITALITYOS_DEFAULT_MODULES,
  optionalModules: HOSPITALITYOS_OPTIONAL_MODULES,
  suiteVerticals: [...SUITE_VERTICAL_MODULES],
  sharedBaseModules: [...SUITE_SHARED_MODULES],
  installTemplates: HOSPITALITYOS_INSTALL_TEMPLATES,
  brandDefaults: {
    primaryColor: "#0B3D2E",
    businessType: "hotel",
  },
  install: {
    bootstrapPath: "/v1/distributor/tenants/bootstrap",
    hosProvisionPath: "/internal/distributor/provision",
    oauthDestinations: [
      "https://{subdomain}.lifeos.app/staff",
      "https://{subdomain}.lifeos.app/guest",
    ],
  },
};

export type ECommerceOSManifest = {
  appId: "ecommerceos";
  displayName: string;
  version: string;
  description: string;
  distributorPrimitives: DistributorPrimitive[];
  requiredPrimitives: RequiredLifeOsPrimitive[];
  defaultModules: readonly string[];
  installTemplates: EcommerceInstallTemplate[];
  brandDefaults: { primaryColor: string; businessType: "retail" };
  install: {
    bootstrapPath: "/v1/distributor/tenants/bootstrap";
    hosProvisionPath: "/internal/distributor/provision";
    oauthDestinations: string[];
  };
};

export const ECOMMERCEOS_DEFAULT_MODULES = modulesForVertical("ecommerceos", "retail");

export type TransportationOSManifest = {
  appId: "transportationos";
  displayName: string;
  version: string;
  description: string;
  distributorPrimitives: DistributorPrimitive[];
  requiredPrimitives: RequiredLifeOsPrimitive[];
  verticals: { logistics: boolean; rentals: boolean };
  defaultModules: readonly string[];
  installTemplates: TransportationInstallTemplate[];
  brandDefaults: { primaryColor: string; businessType: "transportation" };
  install: {
    bootstrapPath: "/v1/distributor/tenants/bootstrap";
    hosProvisionPath: "/internal/distributor/provision";
    oauthDestinations: string[];
  };
};

export const TRANSPORTATIONOS_DEFAULT_MODULES = modulesForVertical("transportationos", "hub");

export const TRANSPORTATIONOS_MANIFEST: TransportationOSManifest = {
  appId: "transportationos",
  displayName: "TransportationOS",
  version: "0.2.0",
  description:
    "Universal mobility platform — last-mile courier fleets, live tracking, and car/fleet rentals with Finprove deposits.",
  distributorPrimitives: ["commerce", "identity", "billing", "messaging"],
  requiredPrimitives: ["identity", "messaging", "storage", "jobs", "distributor", "billing"],
  verticals: { logistics: true, rentals: true },
  defaultModules: TRANSPORTATIONOS_DEFAULT_MODULES,
  installTemplates: TRANSPORTATIONOS_INSTALL_TEMPLATES,
  brandDefaults: {
    primaryColor: "#F59E0B",
    businessType: "transportation",
  },
  install: {
    bootstrapPath: "/v1/distributor/tenants/bootstrap",
    hosProvisionPath: "/internal/distributor/provision",
    oauthDestinations: [
      "https://{subdomain}.lifeos.app/rider",
      "https://track.lifeos.app",
      "https://{subdomain}.lifeos.app/rentals",
    ],
  },
};

export const ECOMMERCEOS_MANIFEST: ECommerceOSManifest = {
  appId: "ecommerceos",
  displayName: "ECommerceOS",
  version: "0.1.0",
  description:
    "Retail engine — catalog, checkout, local delivery, and an optional walk-in shop address.",
  distributorPrimitives: ["commerce", "identity", "billing", "messaging"],
  requiredPrimitives: ["identity", "messaging", "storage", "jobs", "distributor", "billing"],
  defaultModules: ECOMMERCEOS_DEFAULT_MODULES,
  installTemplates: ECOMMERCEOS_INSTALL_TEMPLATES,
  brandDefaults: {
    primaryColor: "#1D4ED8",
    businessType: "retail",
  },
  install: {
    bootstrapPath: "/v1/distributor/tenants/bootstrap",
    hosProvisionPath: "/internal/distributor/provision",
    oauthDestinations: [
      "https://{subdomain}.lifeos.app",
      "https://{subdomain}.lifeos.app/admin",
    ],
  },
};
