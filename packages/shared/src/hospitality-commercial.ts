/**
 * Canonical HospitalityOS commercial catalog (Portal).
 *
 * Commercial configuration ≠ application identity.
 * Products map onto existing hospitalityos verticalIds.
 * Digiconomy taxonomy (bucket=industry) is unchanged.
 *
 * Two layers only in this mission:
 * - software: one-time acquisition of the vertical edition
 * - services: monthly Digiconomy operating services
 *
 * Usage-based metering is reserved for a future layer and is NOT implemented here.
 *
 * HOSPITALITY RESOURCE ALLOCATIONS: NOT CONFIGURED
 * (DataZone / Digi AI quotas intentionally null — do not invent numbers.)
 */

import {
  HOSPITALITYOS_INSTALL_TEMPLATES,
  type HospitalityInstallTemplateId,
  type HospitalityVerticalId,
} from "./catalog.js";
import { formatMyBrandOsPackPrice } from "./mybrandos-packs.js";

export type HospitalityCommercialProductId =
  | "hotel"
  | "restaurant"
  | "lounge_bar"
  | "service_apartment"
  | "gym_fitness"
  | "local_food"
  | "events"
  | "resort";

export type HospitalityCommercialLayer = "software" | "services";

export type HospitalityCapabilityItem = {
  id: string;
  label: string;
  /** False = do not present as a live guarantee in customer UI. */
  available: boolean;
};

export type HospitalityCommercialProduct = {
  id: HospitalityCommercialProductId;
  displayName: string;
  /** Short discovery line — what the business runs. */
  tagline: string;
  order: number;
  application: {
    engine: "hospitalityos";
    verticalId: Exclude<HospitalityVerticalId, "custom">;
    templateId: HospitalityInstallTemplateId;
  };
  software: {
    oneTimePriceMinor: number;
    currency: "USD";
    headline: string;
    capabilities: HospitalityCapabilityItem[];
  };
  services: {
    monthlyPriceMinor: number;
    currency: "USD";
    headline: string;
    /** Null until Hospitality resource allocations are approved. */
    dataZoneQuotaLabel: string | null;
    dataZoneQuotaBytes: number | null;
    digiAiCreditsMonthly: number | null;
    includedServices: HospitalityCapabilityItem[];
  };
};

const SHARED_SERVICES: HospitalityCapabilityItem[] = [
  { id: "managed_app", label: "Managed application service on getlifeos.app", available: true },
  { id: "hosting", label: "Public and admin application availability", available: true },
  { id: "media", label: "Media delivery for your guest experience", available: true },
  { id: "publication", label: "Publication / content infrastructure where used", available: true },
  { id: "updates", label: "Platform and application updates", available: true },
  { id: "security", label: "Security and service maintenance", available: true },
  {
    id: "datazone",
    label: "DataZone allocation",
    available: false,
  },
  {
    id: "digi_ai",
    label: "Digi AI monthly allowance",
    available: false,
  },
  {
    id: "processing",
    label: "Additional processing capacity",
    available: false,
  },
  {
    id: "priority_support",
    label: "Priority support",
    available: false,
  },
];

function servicesFor(headline: string): HospitalityCommercialProduct["services"] {
  return {
    monthlyPriceMinor: 0, // overwritten per product
    currency: "USD",
    headline,
    dataZoneQuotaLabel: null,
    dataZoneQuotaBytes: null,
    digiAiCreditsMonthly: null,
    includedServices: SHARED_SERVICES.filter((s) => s.available || s.id === "datazone" || s.id === "digi_ai"),
  };
}

/**
 * Software capabilities audited against Portal templates + hotel-ops / dining-ops / tenant apps.
 * Unavailable items stay out of customer-facing lists (or marked planned only in reports).
 */
const HOTEL_SOFTWARE: HospitalityCapabilityItem[] = [
  { id: "public_app", label: "Public Hotel App on getlifeos.app", available: true },
  { id: "admin", label: "Management / Admin software", available: true },
  { id: "rooms", label: "Rooms and room inventory", available: true },
  { id: "reservations", label: "Availability and reservations", available: true },
  { id: "guest_ops", label: "Guest operations", available: true },
  { id: "checkin", label: "Check-in / Check-out", available: true },
  { id: "front_desk", label: "Front desk and staff operations", available: true },
  { id: "housekeeping", label: "Housekeeping status", available: true },
  { id: "hotel_orders", label: "In-stay orders (hotel menu / room service ops)", available: true },
  { id: "reporting", label: "Operational reporting", available: true },
  { id: "property_info", label: "Property information for guests", available: true },
];

const RESTAURANT_SOFTWARE: HospitalityCapabilityItem[] = [
  { id: "public_app", label: "Public Restaurant App", available: true },
  { id: "admin", label: "Management / Admin software", available: true },
  { id: "menus", label: "Menu / catalog", available: true },
  { id: "ordering", label: "Guest ordering", available: true },
  { id: "tables", label: "Tables and dining operations", available: true },
  { id: "kitchen", label: "Kitchen / fulfillment workflow", available: true },
  { id: "reporting", label: "Operational reporting", available: true },
  {
    id: "ecommerce_participation",
    label: "Ecommerce Ecosystem participation (catalog + ordering)",
    available: true,
  },
];

const BAR_SOFTWARE: HospitalityCapabilityItem[] = [
  { id: "public_app", label: "Public Lounge / Bar App surface", available: true },
  { id: "admin", label: "Management / Admin software", available: true },
  { id: "bar_modules", label: "Bar / beverage operating modules", available: true },
  { id: "staff", label: "Staff and customer management modules", available: true },
  {
    id: "guest_ordering",
    label: "Dedicated guest bar ordering experience (dining-ops)",
    available: false,
  },
  {
    id: "reservations",
    label: "Table reservations",
    available: false,
  },
];

const SERVICE_APARTMENT_SOFTWARE: HospitalityCapabilityItem[] = [
  { id: "public_app", label: "Public property App surface", available: true },
  { id: "admin", label: "Management / Admin software", available: true },
  { id: "units", label: "Units / property inventory modules", available: true },
  { id: "stays", label: "Guest stays and reservation modules", available: true },
  { id: "staff", label: "Staff and customer management modules", available: true },
  {
    id: "full_guest_hotel_ux",
    label: "Full hotel-style guest check-in experience",
    available: false,
  },
];

const GYM_SOFTWARE: HospitalityCapabilityItem[] = [
  { id: "public_app", label: "Public Gym App surface", available: true },
  { id: "admin", label: "Management / Admin software", available: true },
  { id: "membership_modules", label: "Membership / class / spa module pack", available: true },
  { id: "staff", label: "Staff and customer management modules", available: true },
  {
    id: "membership_billing_runtime",
    label: "Live membership billing checkout",
    available: false,
  },
  {
    id: "class_scheduler_ui",
    label: "Dedicated class scheduler guest UI",
    available: false,
  },
];

const LOCAL_FOOD_SOFTWARE: HospitalityCapabilityItem[] = [
  { id: "public_app", label: "Public Food App", available: true },
  { id: "admin", label: "Management / Admin software", available: true },
  { id: "menus", label: "Menu / catalog", available: true },
  { id: "ordering", label: "Ordering", available: true },
  { id: "kitchen", label: "Kitchen / food operations", available: true },
  { id: "takeaway", label: "Takeaway / address fulfillment fields", available: true },
  {
    id: "ecommerce_participation",
    label: "Ecommerce Ecosystem participation (catalog, ordering, logistics)",
    available: true,
  },
  {
    id: "courier_bridge",
    label: "Live courier / logistics dispatch bridge",
    available: false,
  },
];

const EVENTS_SOFTWARE: HospitalityCapabilityItem[] = [
  { id: "public_app", label: "Public Events App surface", available: true },
  { id: "admin", label: "Management / Admin software", available: true },
  { id: "events_modules", label: "Events, ticketing, and venue booking modules", available: true },
  { id: "staff", label: "Staff and customer management modules", available: true },
  {
    id: "universal_ticketing",
    label: "Full universal ticketing marketplace",
    available: false,
  },
];

const RESORT_SOFTWARE: HospitalityCapabilityItem[] = [
  { id: "public_app", label: "Resort public App surface", available: true },
  { id: "admin", label: "Management / Admin software", available: true },
  { id: "accommodation", label: "Accommodation and reservations modules", available: true },
  { id: "dining", label: "Dining modules", available: true },
  { id: "bar", label: "Bar modules", available: true },
  { id: "gym", label: "Gym / leisure modules", available: true },
  { id: "events", label: "Events modules", available: true },
  { id: "folio", label: "Charge-to-room folio when lodging + F&B modules are enabled", available: true },
  {
    id: "unified_guest_resort_ux",
    label: "Single unified guest resort experience across all amenities",
    available: false,
  },
];

function templateIdFor(verticalId: Exclude<HospitalityVerticalId, "custom">): HospitalityInstallTemplateId {
  const hit = HOSPITALITYOS_INSTALL_TEMPLATES.find((t) => t.verticalId === verticalId);
  if (!hit) throw new Error(`Missing Hospitality template for ${verticalId}`);
  return hit.id;
}

export const HOSPITALITY_COMMERCIAL_PRODUCTS: HospitalityCommercialProduct[] = [
  {
    id: "hotel",
    displayName: "Hotel",
    tagline: "Run your hotel digitally.",
    order: 1,
    application: {
      engine: "hospitalityos",
      verticalId: "hotel",
      templateId: templateIdFor("hotel"),
    },
    software: {
      oneTimePriceMinor: 49900,
      currency: "USD",
      headline: "Software for operating your hotel’s digital business.",
      capabilities: HOTEL_SOFTWARE,
    },
    services: {
      ...servicesFor("Ongoing Digiconomy services that keep your hotel app operating."),
      monthlyPriceMinor: 14900,
    },
  },
  {
    id: "restaurant",
    displayName: "Restaurant",
    tagline: "Run your restaurant digitally.",
    order: 2,
    application: {
      engine: "hospitalityos",
      verticalId: "restaurant",
      templateId: templateIdFor("restaurant"),
    },
    software: {
      oneTimePriceMinor: 29900,
      currency: "USD",
      headline: "Software for operating your restaurant’s digital business.",
      capabilities: RESTAURANT_SOFTWARE,
    },
    services: {
      ...servicesFor("Ongoing Digiconomy services that keep your restaurant app operating."),
      monthlyPriceMinor: 9900,
    },
  },
  {
    id: "lounge_bar",
    displayName: "Lounge / Bar",
    tagline: "Run your lounge or bar digitally.",
    order: 3,
    application: {
      engine: "hospitalityos",
      verticalId: "bar",
      templateId: templateIdFor("bar"),
    },
    software: {
      oneTimePriceMinor: 29900,
      currency: "USD",
      headline: "Software for operating your lounge or bar digitally.",
      capabilities: BAR_SOFTWARE,
    },
    services: {
      ...servicesFor("Ongoing Digiconomy services that keep your lounge / bar app operating."),
      monthlyPriceMinor: 9900,
    },
  },
  {
    id: "service_apartment",
    displayName: "Service Apartment",
    tagline: "Run your service apartments digitally.",
    order: 4,
    application: {
      engine: "hospitalityos",
      verticalId: "shared_homes",
      templateId: templateIdFor("shared_homes"),
    },
    software: {
      oneTimePriceMinor: 19900,
      currency: "USD",
      headline: "Software for operating service apartments digitally.",
      capabilities: SERVICE_APARTMENT_SOFTWARE,
    },
    services: {
      ...servicesFor("Ongoing Digiconomy services that keep your property app operating."),
      monthlyPriceMinor: 9900,
    },
  },
  {
    id: "gym_fitness",
    displayName: "Gym / Fitness",
    tagline: "Run your gym digitally.",
    order: 5,
    application: {
      engine: "hospitalityos",
      verticalId: "gym",
      templateId: templateIdFor("gym"),
    },
    software: {
      oneTimePriceMinor: 9900,
      currency: "USD",
      headline: "Software for operating your gym digitally.",
      capabilities: GYM_SOFTWARE,
    },
    services: {
      ...servicesFor("Ongoing Digiconomy services that keep your gym app operating."),
      monthlyPriceMinor: 4900,
    },
  },
  {
    id: "local_food",
    displayName: "Local Food",
    tagline: "Run your local food business digitally.",
    order: 6,
    application: {
      engine: "hospitalityos",
      verticalId: "local_food",
      templateId: templateIdFor("local_food"),
    },
    software: {
      oneTimePriceMinor: 9900,
      currency: "USD",
      headline: "Software for operating local food and home kitchens digitally.",
      capabilities: LOCAL_FOOD_SOFTWARE,
    },
    services: {
      ...servicesFor("Ongoing Digiconomy services that keep your food app operating."),
      monthlyPriceMinor: 3900,
    },
  },
  {
    id: "events",
    displayName: "Events",
    tagline: "Run your events venue digitally.",
    order: 7,
    application: {
      engine: "hospitalityos",
      verticalId: "events",
      templateId: templateIdFor("events"),
    },
    software: {
      oneTimePriceMinor: 19900,
      currency: "USD",
      headline: "Software for operating your events venue digitally.",
      capabilities: EVENTS_SOFTWARE,
    },
    services: {
      ...servicesFor("Ongoing Digiconomy services that keep your events app operating."),
      monthlyPriceMinor: 7900,
    },
  },
  {
    id: "resort",
    displayName: "Resort",
    tagline: "Run your resort digitally.",
    order: 8,
    application: {
      engine: "hospitalityos",
      verticalId: "resort",
      templateId: templateIdFor("resort"),
    },
    software: {
      oneTimePriceMinor: 59900,
      currency: "USD",
      headline: "Software for operating a broader hospitality resort digitally.",
      capabilities: RESORT_SOFTWARE,
    },
    services: {
      ...servicesFor("Ongoing Digiconomy services that keep your resort app operating."),
      monthlyPriceMinor: 19900,
    },
  },
];

export const HOSPITALITY_COMMERCIAL_TAGLINE =
  "Choose the Hospitality software built for your business. Own the edition once. Subscribe to the services that operate it.";

export function listHospitalityCommercialProducts(): HospitalityCommercialProduct[] {
  return [...HOSPITALITY_COMMERCIAL_PRODUCTS].sort((a, b) => a.order - b.order);
}

export function getHospitalityCommercialProduct(
  id: string,
): HospitalityCommercialProduct | undefined {
  return HOSPITALITY_COMMERCIAL_PRODUCTS.find((p) => p.id === id);
}

export function isHospitalityCommercialProductId(
  value: string,
): value is HospitalityCommercialProductId {
  return HOSPITALITY_COMMERCIAL_PRODUCTS.some((p) => p.id === value);
}

export function hospitalityCommercialSoftwareCapabilities(
  product: HospitalityCommercialProduct,
): HospitalityCapabilityItem[] {
  return product.software.capabilities.filter((c) => c.available);
}

export function hospitalityCommercialServiceCapabilities(
  product: HospitalityCommercialProduct,
): HospitalityCapabilityItem[] {
  // Omit unconfigured resource rows (DataZone / Digi AI) from production UI.
  return product.services.includedServices.filter((c) => {
    if (c.id === "datazone" || c.id === "digi_ai") return false;
    return c.available;
  });
}

export { formatMyBrandOsPackPrice as formatHospitalityCommercialPrice };
