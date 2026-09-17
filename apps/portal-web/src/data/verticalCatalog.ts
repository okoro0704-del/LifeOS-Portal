/**
 * Portal Web marketplace VIEW of the canonical Digiconomy / shared catalog.
 *
 * Canonical install semantics (engine, verticalId, template, modules, taxonomy)
 * come from `@lifeos-portal/shared`. This file only holds UI presentation overlays.
 */

import {
  digiconomyBucketFor,
  listInstallableDigiconomyEntries,
  type DigiconomyBucket,
  type DigiconomyCatalogEntry,
} from "@lifeos-portal/shared";

export type MarketplaceEngine = "hospitalityos" | "ecommerceos" | "transportationos" | "serviceos";

export type MarketplaceCategory =
  | "all"
  | "hospitality"
  | "retail"
  | "transport"
  | "services"
  | "industry"
  | "cross_industry"
  | "ecommerce_ecosystem";

export type TransportationPreset = "logistics" | "rentals" | "hub";
export type ServiceOSPreset = "beauty" | "wellness" | "technical" | "culinary" | "pleasure";
export type HospitalityOSPreset = "local_food" | "shared_homes";

export type MarketplaceVertical = {
  id: string;
  icon: string;
  name: string;
  description: string;
  engine: MarketplaceEngine;
  category: Exclude<MarketplaceCategory, "all" | "industry" | "cross_industry" | "ecommerce_ecosystem">;
  /** Digiconomy taxonomy bucket (derived from shared catalog). */
  bucket: DigiconomyBucket;
  modules: string[];
  features: string[];
  keywords: string[];
  verticalId: string;
  templateId: string;
  available: boolean;
  hasPhysicalAddress?: boolean;
  preset?: TransportationPreset | ServiceOSPreset | HospitalityOSPreset;
};

/** UI-only presentation keyed by shared catalogKey / templateId. */
type MarketplacePresentation = {
  icon: string;
  /** Legacy marketplace filter group (presentation only). */
  category: MarketplaceVertical["category"];
  features: string[];
  keywords: string[];
  /** Optional display name override for marketplace cards. */
  name?: string;
};

const MARKETPLACE_PRESENTATION: Record<string, MarketplacePresentation> = {
  standalone_hotel: {
    icon: "🏨",
    category: "hospitality",
    features: ["Rooms", "Reservations", "Restaurant & bar", "Self check-in", "Front desk", "Housekeeping"],
    keywords: ["hotel", "resort", "lodging", "rooms", "stay", "accommodation"],
    name: "Hotel & Resort",
  },
  standalone_restaurant: {
    icon: "🍽️",
    category: "hospitality",
    features: ["Menus", "Tables", "Kitchen display", "Billing & CRM"],
    keywords: ["restaurant", "dining", "food", "kitchen", "pos"],
    name: "Restaurant & Dining",
  },
  standalone_local_food: {
    icon: "🍲",
    category: "hospitality",
    features: ["GPS home kitchens", "Delivery radius", "Prep buffer", "Instant payout"],
    keywords: ["local food", "home kitchen", "catering", "delivery", "cook", "stall", "apartment kitchen"],
  },
  standalone_shared_homes: {
    icon: "🏠",
    category: "hospitality",
    features: ["Units", "Guest stays", "Billing & CRM"],
    keywords: ["shared homes", "apartment", "short-let", "airbnb", "unit"],
    name: "Shared Homes / Apartment",
  },
  standalone_bar: {
    icon: "🍹",
    category: "hospitality",
    features: ["Beverage POS", "Open tabs", "Floor service", "Billing & CRM"],
    keywords: ["bar", "nightclub", "lounge", "drinks", "tabs"],
    name: "Bar & Nightclub",
  },
  standalone_gym_spa: {
    icon: "🏋️",
    category: "hospitality",
    features: ["Memberships", "Schedules", "Day passes", "Billing & CRM"],
    keywords: ["gym", "fitness", "spa", "membership", "workout"],
    name: "Gym & Fitness Center",
  },
  standalone_events: {
    icon: "🎬",
    category: "hospitality",
    features: ["Venues", "Ticketing", "Showtimes", "Billing & CRM"],
    keywords: ["cinema", "events", "venue", "tickets", "theater"],
    name: "Cinema & Events Venue",
  },
  full_hotel_resort: {
    icon: "🏰",
    category: "hospitality",
    features: ["Rooms", "Dining", "Bar", "Wellness", "Events", "Charge to folio"],
    keywords: ["hotel", "resort", "leisure", "complex", "full", "bundle"],
  },
  custom: {
    icon: "🧩",
    category: "hospitality",
    features: ["Custom modules", "Billing & CRM"],
    keywords: ["custom", "compose", "hospitality"],
    name: "Custom Hospitality Suite",
  },
  physical_retail: {
    icon: "🛍️",
    category: "retail",
    features: ["Catalog", "Checkout", "Walk-in shop", "POS"],
    keywords: ["retail", "store", "shop", "physical store", "pos", "physical", "address", "walk-in"],
    name: "Physical Store",
  },
  ecommerce_delivery: {
    icon: "📦",
    category: "retail",
    features: ["Catalog", "Checkout", "Online storefront", "Orders"],
    keywords: ["retail", "ecommerce", "online store", "shop", "commerce", "online", "no address"],
    name: "Online Store",
  },
  supermarket: {
    icon: "🛒",
    category: "retail",
    features: ["Departments", "Inventory", "Checkout", "Promotions"],
    keywords: ["supermarket", "grocery", "aisle", "departments", "high-volume"],
  },
  shopping_centre: {
    icon: "🏬",
    category: "retail",
    features: ["Centre directory", "Units", "Hours", "Offers"],
    keywords: ["shopping centre", "center", "units", "directory", "commercial centre"],
  },
  wholesaler: {
    icon: "📦",
    category: "retail",
    features: ["Bulk catalog", "Wholesale pricing", "B2B orders", "Warehouse"],
    keywords: ["wholesale", "b2b", "bulk", "carton", "minimum quantity"],
  },
  shopping_mall: {
    icon: "🏙️",
    category: "retail",
    features: ["Mall directory", "Facilities", "Events", "Store discovery"],
    keywords: ["shopping mall", "mall", "facilities", "anchor", "destination"],
  },
  marketplace: {
    icon: "🧺",
    category: "retail",
    features: ["Seller roster", "Seller discovery", "Offer projection", "Operator console"],
    keywords: ["marketplace", "sellers", "multi-seller", "operator", "platform"],
  },
  logistics: {
    icon: "🚚",
    category: "transport",
    features: ["Dispatch", "Rider fleets", "Live tracking", "Settlements"],
    keywords: ["logistics", "delivery", "courier", "last-mile", "rider", "fleet", "freight", "transport"],
  },
  rentals: {
    icon: "🚗",
    category: "transport",
    features: ["Vehicle inventory", "Bookings", "Inspection photos", "Deposit escrow"],
    keywords: ["rental", "car rental", "fleet rental", "vehicle", "license", "deposit", "agency"],
  },
  hub: {
    icon: "🚖",
    category: "transport",
    features: ["Courier dispatch", "Rental fleet", "Tracking", "Deposits"],
    keywords: ["transit", "hub", "integrated", "courier", "fleet", "mobility"],
  },
  beauty: {
    icon: "✂️",
    category: "services",
    features: ["Beauty catalog", "Travel surcharge", "Live ETA", "Doorstep PIN"],
    keywords: ["barber", "salon", "makeup", "stylist", "grooming", "beauty", "serviceos"],
    name: "Mobile Salon & Grooming OS",
  },
  wellness: {
    icon: "💆",
    category: "services",
    features: ["Wellness catalog", "Travel fee", "Proof of service", "ElfCom chat"],
    keywords: ["massage", "spa", "wellness", "home", "serviceos"],
    name: "Home Wellness & Spa OS",
  },
  technical: {
    icon: "🛠️",
    category: "services",
    features: ["Technician catalog", "Skill matching", "Doorstep PIN", "Proof photos"],
    keywords: ["technician", "repair", "appliance", "field", "serviceos"],
    name: "On-Demand Field Technician OS",
  },
  culinary: {
    icon: "👨‍🍳",
    category: "services",
    features: ["Culinary catalog", "Travel surcharge", "Live tracking", "Escrow checkout"],
    keywords: ["chef", "catering", "culinary", "private chef", "serviceos"],
    name: "Private Chef & Culinary OS",
  },
  pleasure: {
    icon: "♥",
    category: "services",
    features: ["Gender", "Orientation", "Hooks MS", "Gigolo MS", "Identity search"],
    keywords: [
      "pleasure",
      "pleasureos",
      "hooks",
      "gigolo",
      "dating",
      "companion",
      "serviceos",
      "straight",
      "gay",
      "bi",
    ],
  },
};

function presentationFor(entry: DigiconomyCatalogEntry): MarketplacePresentation {
  const key = entry.catalogKey;
  const overlay = MARKETPLACE_PRESENTATION[key];
  if (overlay) return overlay;
  // Fallback presentation — never invent taxonomy; bucket already comes from shared.
  const category: MarketplaceVertical["category"] =
    entry.engine === "ecommerceos"
      ? "retail"
      : entry.engine === "transportationos"
        ? "transport"
        : entry.engine === "serviceos"
          ? "services"
          : "hospitality";
  return {
    icon: "◆",
    category,
    features: [...entry.modules].slice(0, 6),
    keywords: [entry.verticalId, entry.engine, entry.displayName.toLowerCase()],
  };
}

function toMarketplaceVertical(entry: DigiconomyCatalogEntry): MarketplaceVertical | null {
  if (entry.lane !== "business" || entry.engine === "mybrandos") return null;
  const ui = presentationFor(entry);
  const preset = entry.preset;
  return {
    id: entry.catalogKey,
    icon: ui.icon,
    name: ui.name || entry.displayName,
    description: entry.description,
    engine: entry.engine,
    category: ui.category,
    bucket: entry.bucket,
    modules: [...entry.modules],
    features: ui.features,
    keywords: ui.keywords,
    verticalId: entry.verticalId,
    templateId: entry.templateId || entry.catalogKey,
    available: entry.available,
    hasPhysicalAddress: entry.hasPhysicalAddress,
    preset: typeof preset === "string" ? (preset as MarketplaceVertical["preset"]) : undefined,
  };
}

/** Marketplace cards derived from the shared Digiconomy catalog (business lane only). */
export const VERTICAL_CATALOG: MarketplaceVertical[] = listInstallableDigiconomyEntries()
  .map(toMarketplaceVertical)
  .filter((item): item is MarketplaceVertical => item !== null);

export function engineDisplayName(engine: string) {
  if (engine === "ecommerceos") return "ECommerceOS";
  if (engine === "transportationos") return "TransportationOS";
  if (engine === "hospitalityos") return "HospitalityOS";
  if (engine === "serviceos") return "ServiceOS";
  if (engine === "mybrandos") return "mybrandOS";
  return engine;
}

export const MARKETPLACE_CATEGORIES: Array<{ id: MarketplaceCategory; label: string }> = [
  { id: "all", label: "All Verticals" },
  { id: "hospitality", label: "Hospitality & Leisure" },
  { id: "retail", label: "Retail & Commerce" },
  { id: "transport", label: "Transport & Freight" },
  { id: "services", label: "At-home Services" },
  { id: "industry", label: "Industry" },
  { id: "cross_industry", label: "Cross-Industry" },
  { id: "ecommerce_ecosystem", label: "Ecommerce Ecosystem" },
];

/** Legacy marketplace card ids → shared catalogKey (template id). */
const LEGACY_MARKETPLACE_IDS: Record<string, string> = {
  hotel_resort: "standalone_hotel",
  restaurant_dining: "standalone_restaurant",
  local_food_home_kitchen: "standalone_local_food",
  bar_nightclub: "standalone_bar",
  gym_fitness: "standalone_gym_spa",
  cinema_events: "standalone_events",
  full_resort: "full_hotel_resort",
  retail_store: "physical_retail",
  ecommerce_delivery: "ecommerce_delivery",
  last_mile_courier: "logistics",
  car_fleet_rental: "rentals",
  transit_fleet_hub: "hub",
  mobile_salon_grooming: "beauty",
  home_wellness_spa: "wellness",
  field_technician: "technical",
  private_chef_culinary: "culinary",
  pleasure_os: "pleasure",
};

export function getMarketplaceVertical(id: string): MarketplaceVertical | undefined {
  const resolved = LEGACY_MARKETPLACE_IDS[id] || id;
  return VERTICAL_CATALOG.find((item) => item.id === resolved);
}

export function filterVerticalCatalog(
  query: string,
  category: MarketplaceCategory = "all",
  items: MarketplaceVertical[] = VERTICAL_CATALOG,
): MarketplaceVertical[] {
  const q = query.trim().toLowerCase();
  return items.filter((item) => {
    if (category === "industry" || category === "cross_industry" || category === "ecommerce_ecosystem") {
      if (item.bucket !== category) return false;
    } else if (category !== "all" && item.category !== category) {
      return false;
    }
    if (!q) return true;
    const haystack = [item.name, item.description, ...item.keywords].join(" ").toLowerCase();
    return haystack.includes(q);
  });
}

/** Sanity helper for tests — marketplace taxonomy matches shared derivation. */
export function assertMarketplaceBucketsMatchShared() {
  for (const item of VERTICAL_CATALOG) {
    const expected = digiconomyBucketFor({ engine: item.engine, verticalId: item.verticalId });
    if (item.bucket !== expected) {
      throw new Error(`Marketplace bucket drift for ${item.id}: ${item.bucket} !== ${expected}`);
    }
  }
}
