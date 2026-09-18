/**
 * Canonical EcommerceOS commercial catalog (Portal).
 *
 * Commercial configuration ≠ application identity.
 * Digiconomy bucket remains ecommerce_ecosystem for these products.
 *
 * SOFTWARE — ONE TIME vs SERVICES — MONTHLY (not monthly/annual billing).
 * Online Marketplace Operator is an operator product, not an ordinary seller vertical.
 *
 * QUOTA ENFORCEMENT: NOT IMPLEMENTED
 * DIGI AI CONSUMPTION: NOT IMPLEMENTED
 */

import {
  ECOMMERCEOS_INSTALL_TEMPLATES,
  expandEcommerceModules,
  type EcommerceInstallTemplate,
  type EcommerceVerticalId,
} from "./catalog.js";
import { formatMyBrandOsPackPrice } from "./mybrandos-packs.js";

export type EcommerceCommercialProductId =
  | "online_store"
  | "physical_store"
  | "wholesaler"
  | "supermarket"
  | "shopping_centre"
  | "shopping_mall"
  | "marketplace_operator";

export type EcommerceCommercialLayer = "software" | "services";

export type EcommerceCommercialProductType = "vertical" | "operator";

export type EcommerceCapabilityItem = {
  id: string;
  label: string;
  available: boolean;
};

export type EcommerceCommercialProduct = {
  id: EcommerceCommercialProductId;
  displayName: string;
  tagline: string;
  order: number;
  productType: EcommerceCommercialProductType;
  application: {
    engine: "ecommerceos";
    /** Canonical vertical retained for install (marketplace for operator). */
    verticalId: EcommerceVerticalId;
    templateId: EcommerceInstallTemplate["id"];
  };
  software: {
    oneTimePriceMinor: number;
    currency: "USD";
    headline: string;
    capabilities: EcommerceCapabilityItem[];
  };
  services: {
    monthlyPriceMinor: number;
    currency: "USD";
    headline: string;
    dataZoneGb: number;
    digiAiCreditsMonthly: number;
    includedServices: EcommerceCapabilityItem[];
  };
};

function template(verticalId: EcommerceVerticalId): EcommerceInstallTemplate {
  const hit = ECOMMERCEOS_INSTALL_TEMPLATES.find((t) => t.verticalId === verticalId);
  if (!hit) throw new Error(`Missing EcommerceOS template for ${verticalId}`);
  return hit;
}

function capsFromModules(modules: readonly string[]): EcommerceCapabilityItem[] {
  const expanded = expandEcommerceModules(modules);
  const labels: Record<string, string> = {
    catalog: "Product catalogue",
    inventory: "Inventory",
    storefront: "Storefront",
    cart: "Cart",
    orders: "Orders",
    checkout: "Checkout",
    billing: "Billing modules",
    logistics_bridge: "Local delivery bridge modules",
    departments: "Departments",
    promotions: "Promotions",
    directory: "Directory",
    units: "Units / spaces",
    hours: "Hours",
    events: "Events",
    offers: "Offers",
    facilities: "Facilities",
    bulk_orders: "Bulk orders",
    wholesale_pricing: "Wholesale pricing",
    seller_participation: "Seller participation",
    staff_management: "Staff management",
  };
  return expanded
    .filter((id) => id !== "staff_management" || true)
    .map((id) => ({
      id,
      label: labels[id] ?? id.replaceAll("_", " "),
      available: true,
    }));
}

function sharedServices(dataZoneGb: number, digiAi: number): EcommerceCapabilityItem[] {
  return [
    { id: "managed_app", label: "Managed EcommerceOS application on getlifeos.app", available: true },
    { id: "hosting", label: "Public and admin application availability", available: true },
    {
      id: "datazone",
      label: `${dataZoneGb} GB DataZone included with monthly services`,
      available: true,
    },
    {
      id: "digi_ai",
      label: `${digiAi.toLocaleString()} Digi AI credits each month`,
      available: true,
    },
    { id: "media", label: "Media delivery", available: true },
    { id: "updates", label: "Platform and application updates", available: true },
    { id: "security", label: "Security and service maintenance", available: true },
    {
      id: "quota_enforcement",
      label: "Hard DataZone quota enforcement",
      available: false,
    },
    {
      id: "ai_consumption",
      label: "Digi AI credit consumption metering",
      available: false,
    },
  ];
}

export const ECOMMERCE_COMMERCIAL_PRODUCTS: EcommerceCommercialProduct[] = [
  {
    id: "online_store",
    displayName: "Online Store",
    tagline: "Sell online without a walk-in shop.",
    order: 1,
    productType: "vertical",
    application: {
      engine: "ecommerceos",
      verticalId: "delivery",
      templateId: template("delivery").id,
    },
    software: {
      oneTimePriceMinor: 2900,
      currency: "USD",
      headline: "Acquire the Online Store edition of EcommerceOS.",
      capabilities: [
        { id: "public_app", label: "Public storefront on getlifeos.app", available: true },
        { id: "admin", label: "Store admin / management", available: true },
        ...capsFromModules(template("delivery").modules),
      ],
    },
    services: {
      monthlyPriceMinor: 900,
      currency: "USD",
      headline: "Monthly Digiconomy services that operate your Online Store.",
      dataZoneGb: 10,
      digiAiCreditsMonthly: 100,
      includedServices: sharedServices(10, 100),
    },
  },
  {
    id: "physical_store",
    displayName: "Physical Store",
    tagline: "Run your physical shop and digital commerce together.",
    order: 2,
    productType: "vertical",
    application: {
      engine: "ecommerceos",
      verticalId: "retail",
      templateId: template("retail").id,
    },
    software: {
      oneTimePriceMinor: 4900,
      currency: "USD",
      headline: "Acquire the Physical Store edition of EcommerceOS.",
      capabilities: [
        { id: "public_app", label: "Public storefront on getlifeos.app", available: true },
        { id: "admin", label: "Store admin / management", available: true },
        { id: "physical", label: "Physical retail configuration", available: true },
        ...capsFromModules(template("retail").modules),
      ],
    },
    services: {
      monthlyPriceMinor: 1500,
      currency: "USD",
      headline: "Monthly Digiconomy services that operate your Physical Store.",
      dataZoneGb: 20,
      digiAiCreditsMonthly: 150,
      includedServices: sharedServices(20, 150),
    },
  },
  {
    id: "wholesaler",
    displayName: "Wholesaler",
    tagline: "Run bulk and business-to-business commerce.",
    order: 3,
    productType: "vertical",
    application: {
      engine: "ecommerceos",
      verticalId: "wholesaler",
      templateId: template("wholesaler").id,
    },
    software: {
      oneTimePriceMinor: 7900,
      currency: "USD",
      headline: "Acquire the Wholesaler edition of EcommerceOS.",
      capabilities: [
        { id: "public_app", label: "Public wholesale surface", available: true },
        { id: "admin", label: "Wholesale admin / management", available: true },
        ...capsFromModules(template("wholesaler").modules),
      ],
    },
    services: {
      monthlyPriceMinor: 1900,
      currency: "USD",
      headline: "Monthly Digiconomy services that operate your wholesale business.",
      dataZoneGb: 30,
      digiAiCreditsMonthly: 250,
      includedServices: sharedServices(30, 250),
    },
  },
  {
    id: "supermarket",
    displayName: "Supermarket",
    tagline: "Operate high-volume, multi-category retail.",
    order: 4,
    productType: "vertical",
    application: {
      engine: "ecommerceos",
      verticalId: "supermarket",
      templateId: template("supermarket").id,
    },
    software: {
      oneTimePriceMinor: 9900,
      currency: "USD",
      headline: "Acquire the Supermarket edition of EcommerceOS.",
      capabilities: [
        { id: "public_app", label: "Public supermarket surface", available: true },
        { id: "admin", label: "Supermarket admin / management", available: true },
        ...capsFromModules(template("supermarket").modules),
      ],
    },
    services: {
      monthlyPriceMinor: 2900,
      currency: "USD",
      headline: "Monthly Digiconomy services that operate your supermarket.",
      dataZoneGb: 50,
      digiAiCreditsMonthly: 500,
      includedServices: sharedServices(50, 500),
    },
  },
  {
    id: "shopping_centre",
    displayName: "Shopping Centre",
    tagline: "Bring the businesses in your commercial centre together digitally.",
    order: 5,
    productType: "vertical",
    application: {
      engine: "ecommerceos",
      verticalId: "shopping_centre",
      templateId: template("shopping_centre").id,
    },
    software: {
      oneTimePriceMinor: 14900,
      currency: "USD",
      headline: "Acquire the Shopping Centre edition of EcommerceOS.",
      capabilities: [
        { id: "public_app", label: "Public centre directory surface", available: true },
        { id: "admin", label: "Centre admin / management", available: true },
        ...capsFromModules(template("shopping_centre").modules),
      ],
    },
    services: {
      monthlyPriceMinor: 3900,
      currency: "USD",
      headline: "Monthly Digiconomy services that operate your shopping centre.",
      dataZoneGb: 100,
      digiAiCreditsMonthly: 750,
      includedServices: sharedServices(100, 750),
    },
  },
  {
    id: "shopping_mall",
    displayName: "Shopping Mall",
    tagline: "Operate a multi-store shopping destination.",
    order: 6,
    productType: "vertical",
    application: {
      engine: "ecommerceos",
      verticalId: "shopping_mall",
      templateId: template("shopping_mall").id,
    },
    software: {
      oneTimePriceMinor: 29900,
      currency: "USD",
      headline: "Acquire the Shopping Mall edition of EcommerceOS.",
      capabilities: [
        { id: "public_app", label: "Public mall directory surface", available: true },
        { id: "admin", label: "Mall admin / management", available: true },
        ...capsFromModules(template("shopping_mall").modules),
      ],
    },
    services: {
      monthlyPriceMinor: 6900,
      currency: "USD",
      headline: "Monthly Digiconomy services that operate your shopping mall.",
      dataZoneGb: 250,
      digiAiCreditsMonthly: 1500,
      includedServices: sharedServices(250, 1500),
    },
  },
  {
    id: "marketplace_operator",
    displayName: "Online Marketplace Operator",
    tagline: "Operate a marketplace environment and manage participating Online Stores.",
    order: 7,
    productType: "operator",
    application: {
      engine: "ecommerceos",
      verticalId: "marketplace",
      templateId: template("marketplace").id,
    },
    software: {
      oneTimePriceMinor: 29900,
      currency: "USD",
      headline:
        "Acquire Marketplace Operator software — create and manage Online Stores under your marketplace. Per-store software purchases are not charged automatically.",
      capabilities: [
        { id: "operator", label: "Marketplace operator controls", available: true },
        { id: "admin", label: "Operator admin / management", available: true },
        ...capsFromModules(template("marketplace").modules),
        {
          id: "no_per_store_charge",
          label: "No automatic per-store software charge when provisioning Online Stores",
          available: true,
        },
      ],
    },
    services: {
      monthlyPriceMinor: 7900,
      currency: "USD",
      headline: "Monthly Digiconomy services that operate your marketplace environment.",
      dataZoneGb: 250,
      digiAiCreditsMonthly: 2000,
      includedServices: sharedServices(250, 2000),
    },
  },
];

export const ECOMMERCE_COMMERCIAL_TAGLINE =
  "Choose EcommerceOS software for your commerce model. Own the edition once. Subscribe to the services that operate it.";

export function listEcommerceCommercialProducts(): EcommerceCommercialProduct[] {
  return [...ECOMMERCE_COMMERCIAL_PRODUCTS].sort((a, b) => a.order - b.order);
}

export function getEcommerceCommercialProduct(
  id: string,
): EcommerceCommercialProduct | undefined {
  return ECOMMERCE_COMMERCIAL_PRODUCTS.find((p) => p.id === id);
}

export function getEcommerceCommercialProductByVerticalId(
  verticalId: string,
): EcommerceCommercialProduct | undefined {
  return ECOMMERCE_COMMERCIAL_PRODUCTS.find((p) => p.application.verticalId === verticalId);
}

export function isEcommerceCommercialProductId(
  value: string,
): value is EcommerceCommercialProductId {
  return ECOMMERCE_COMMERCIAL_PRODUCTS.some((p) => p.id === value);
}

export function ecommerceCommercialSoftwareCapabilities(
  product: EcommerceCommercialProduct,
): EcommerceCapabilityItem[] {
  return product.software.capabilities.filter((c) => c.available);
}

export function ecommerceCommercialServiceCapabilities(
  product: EcommerceCommercialProduct,
): EcommerceCapabilityItem[] {
  return product.services.includedServices.filter((c) => c.available);
}

/** Authority for EcommerceOS monthly service price (replaces stale catalog monthly). */
export function ecommerceCommercialMonthlyPriceMinor(verticalId: string): number | undefined {
  return getEcommerceCommercialProductByVerticalId(verticalId)?.services.monthlyPriceMinor;
}

export { formatMyBrandOsPackPrice as formatEcommerceCommercialPrice };
