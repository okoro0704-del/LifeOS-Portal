export type MarketplaceEngine = "hospitalityos" | "ecommerceos" | "transportationos" | "serviceos";

export type MarketplaceCategory =
  | "all"
  | "hospitality"
  | "retail"
  | "transport"
  | "services";

export type TransportationPreset = "logistics" | "rentals" | "hub";
export type ServiceOSPreset = "beauty" | "wellness" | "technical" | "culinary";
export type HospitalityOSPreset = "local_food" | "shared_homes";

export type MarketplaceVertical = {
  id: string;
  icon: string;
  name: string;
  description: string;
  engine: MarketplaceEngine;
  category: Exclude<MarketplaceCategory, "all">;
  modules: string[];
  features: string[];
  keywords: string[];
  /** Portal billing / install vertical id when the engine is live. */
  verticalId: string;
  templateId: string;
  available: boolean;
  /** Retail only: walk-in shop vs online-only. Both still dispatch local delivery. */
  hasPhysicalAddress?: boolean;
  /** TransportationOS / ServiceOS / HospitalityOS commercial preset. */
  preset?: TransportationPreset | ServiceOSPreset | HospitalityOSPreset;
};

export function engineDisplayName(engine: string) {
  if (engine === "ecommerceos") return "ECommerceOS";
  if (engine === "transportationos") return "TransportationOS";
  if (engine === "hospitalityos") return "HospitalityOS";
  if (engine === "serviceos") return "ServiceOS";
  return engine;
}

export const MARKETPLACE_CATEGORIES: Array<{ id: MarketplaceCategory; label: string }> = [
  { id: "all", label: "All Verticals" },
  { id: "hospitality", label: "Hospitality & Leisure" },
  { id: "retail", label: "Retail & Commerce" },
  { id: "transport", label: "Transport & Freight" },
  { id: "services", label: "At-home services" },
];

export const VERTICAL_CATALOG: MarketplaceVertical[] = [
  {
    id: "hotel_resort",
    icon: "🏨",
    name: "Hotel & Resort",
    description: "Rooms, stays, housekeeping, and front desk for hotels and resorts.",
    engine: "hospitalityos",
    category: "hospitality",
    modules: ["accommodation", "billing", "crm"],
    features: ["Rooms", "Reservations", "Room service", "Front desk"],
    keywords: ["hotel", "resort", "lodging", "rooms", "stay", "accommodation"],
    verticalId: "hotel",
    templateId: "standalone_hotel",
    available: true,
  },
  {
    id: "restaurant_dining",
    icon: "🍽️",
    name: "Restaurant & Dining",
    description: "POS, menus, tables, and kitchen display for restaurants.",
    engine: "hospitalityos",
    category: "hospitality",
    modules: ["dining", "billing", "crm"],
    features: ["Menus", "Tables", "Kitchen display", "Billing & CRM"],
    keywords: ["restaurant", "dining", "food", "kitchen", "pos"],
    verticalId: "restaurant",
    templateId: "standalone_restaurant",
    available: true,
  },
  {
    id: "local_food_home_kitchen",
    icon: "🍲",
    name: "🍲 Local Food & Home Kitchen OS",
    description:
      "Home cooks, food stalls, and local caterers — GPS kitchens, delivery orders, and Finprove escrow. No brick-and-mortar venue required.",
    engine: "hospitalityos",
    category: "hospitality",
    modules: ["local_food", "billing", "crm"],
    features: [
      "GPS home kitchens",
      "Delivery radius",
      "Prep buffer",
      "Instant payout",
    ],
    keywords: [
      "local food",
      "home kitchen",
      "catering",
      "delivery",
      "cook",
      "stall",
      "apartment kitchen",
    ],
    verticalId: "local_food",
    templateId: "standalone_local_food",
    available: true,
    preset: "local_food",
  },
  {
    id: "bar_nightclub",
    icon: "🍹",
    name: "Bar & Nightclub",
    description: "Beverage POS, open tabs, and night-floor service.",
    engine: "hospitalityos",
    category: "hospitality",
    modules: ["bar", "billing", "crm"],
    features: ["Beverage POS", "Open tabs", "Floor service", "Billing & CRM"],
    keywords: ["bar", "nightclub", "lounge", "drinks", "tabs"],
    verticalId: "bar",
    templateId: "standalone_bar",
    available: true,
  },
  {
    id: "gym_fitness",
    icon: "🏋️",
    name: "Gym & Fitness Center",
    description: "Memberships, class schedules, and day passes.",
    engine: "hospitalityos",
    category: "hospitality",
    modules: ["gym_spa", "billing", "crm"],
    features: ["Memberships", "Schedules", "Day passes", "Billing & CRM"],
    keywords: ["gym", "fitness", "spa", "membership", "workout"],
    verticalId: "gym",
    templateId: "standalone_gym_spa",
    available: true,
  },
  {
    id: "cinema_events",
    icon: "🎬",
    name: "Cinema & Events Venue",
    description: "Venues, ticketing, showtimes, and hall booking.",
    engine: "hospitalityos",
    category: "hospitality",
    modules: ["events", "billing", "crm"],
    features: ["Venues", "Ticketing", "Showtimes", "Billing & CRM"],
    keywords: ["cinema", "events", "venue", "tickets", "theater"],
    verticalId: "events",
    templateId: "standalone_events",
    available: true,
  },
  {
    id: "retail_store",
    icon: "🛍️",
    name: "Retail with a physical address",
    description:
      "Catalog, checkout, and local delivery — plus a shop customers can walk into.",
    engine: "ecommerceos",
    category: "retail",
    modules: ["catalog", "pos", "checkout", "logisticsBridge"],
    features: ["Catalog", "Checkout", "Local delivery", "Walk-in shop"],
    keywords: ["retail", "store", "shop", "commerce", "pos", "physical", "address", "walk-in"],
    verticalId: "retail",
    templateId: "physical_retail",
    available: true,
    hasPhysicalAddress: true,
  },
  {
    id: "ecommerce_delivery",
    icon: "📦",
    name: "Retail without a physical address",
    description:
      "The same catalog, checkout, and local delivery — no walk-in shop.",
    engine: "ecommerceos",
    category: "retail",
    modules: ["catalog", "pos", "checkout", "logisticsBridge"],
    features: ["Catalog", "Checkout", "Local delivery", "No shopfront"],
    keywords: ["retail", "ecommerce", "delivery", "shop", "commerce", "online", "no address"],
    verticalId: "delivery",
    templateId: "ecommerce_delivery",
    available: true,
    hasPhysicalAddress: false,
  },
  {
    id: "last_mile_courier",
    icon: "🚚",
    name: "Last-Mile Delivery & Courier",
    description: "Dispatch, rider fleets, and live customer tracking for last-mile fulfillment.",
    engine: "transportationos",
    category: "transport",
    modules: [
      "fleet",
      "dispatch",
      "matching",
      "telemetry",
      "tracking",
      "settlement",
      "rider_console",
      "billing",
    ],
    features: ["Dispatch", "Rider fleets", "Live tracking", "Settlements"],
    keywords: ["logistics", "delivery", "courier", "last-mile", "rider", "fleet", "freight", "transport"],
    verticalId: "logistics",
    templateId: "logistics",
    available: true,
    preset: "logistics",
  },
  {
    id: "car_fleet_rental",
    icon: "🚗",
    name: "Car & Fleet Rental Agency",
    description:
      "Hourly and daily vehicle rentals with Trust ID license checks and Finprove security deposits.",
    engine: "transportationos",
    category: "transport",
    modules: ["rental_fleet", "rental_bookings", "rental_inspections", "rental_escrow", "billing"],
    features: ["Vehicle inventory", "Bookings", "Inspection photos", "Deposit escrow"],
    keywords: ["rental", "car rental", "fleet rental", "vehicle", "license", "deposit", "agency"],
    verticalId: "rentals",
    templateId: "rentals",
    available: true,
    preset: "rentals",
  },
  {
    id: "transit_fleet_hub",
    icon: "🚖",
    name: "Integrated Transit & Fleet Hub",
    description: "Courier dispatch plus car and fleet rentals on one TransportationOS tenant.",
    engine: "transportationos",
    category: "transport",
    modules: [
      "fleet",
      "dispatch",
      "matching",
      "telemetry",
      "tracking",
      "settlement",
      "rider_console",
      "rental_fleet",
      "rental_bookings",
      "rental_inspections",
      "rental_escrow",
      "billing",
    ],
    features: ["Courier dispatch", "Rental fleet", "Tracking", "Deposits"],
    keywords: ["transit", "hub", "integrated", "courier", "fleet", "mobility"],
    verticalId: "hub",
    templateId: "hub",
    available: true,
    preset: "hub",
  },
  {
    id: "mobile_salon_grooming",
    icon: "✂️",
    name: "Mobile Salon & Grooming OS",
    description: "Home barbers, stylists, and makeup artists dispatched to the customer's doorstep.",
    engine: "serviceos",
    category: "services",
    modules: ["studio", "catalog", "dispatch", "matching", "telemetry", "tracking", "settlement", "provider_console", "billing"],
    features: ["Beauty catalog", "Travel surcharge", "Live ETA", "Doorstep PIN"],
    keywords: ["barber", "salon", "makeup", "stylist", "grooming", "beauty", "serviceos"],
    verticalId: "beauty",
    templateId: "beauty",
    available: true,
    preset: "beauty",
  },
  {
    id: "home_wellness_spa",
    icon: "💆",
    name: "Home Wellness & Spa OS",
    description: "At-home massage and spa professionals with live tracking and Finprove escrow.",
    engine: "serviceos",
    category: "services",
    modules: ["studio", "catalog", "dispatch", "matching", "telemetry", "tracking", "settlement", "provider_console", "billing"],
    features: ["Wellness catalog", "Travel fee", "Proof of service", "ElfCom chat"],
    keywords: ["massage", "spa", "wellness", "home", "serviceos"],
    verticalId: "wellness",
    templateId: "wellness",
    available: true,
    preset: "wellness",
  },
  {
    id: "field_technician",
    icon: "🛠️",
    name: "On-Demand Field Technician OS",
    description: "Home repairs and appliance technicians matched by skill and proximity.",
    engine: "serviceos",
    category: "services",
    modules: ["studio", "catalog", "dispatch", "matching", "telemetry", "tracking", "settlement", "provider_console", "billing"],
    features: ["Technician catalog", "Skill matching", "Doorstep PIN", "Proof photos"],
    keywords: ["technician", "repair", "appliance", "field", "serviceos"],
    verticalId: "technical",
    templateId: "technical",
    available: true,
    preset: "technical",
  },
  {
    id: "private_chef_culinary",
    icon: "👨‍🍳",
    name: "Private Chef & Culinary OS",
    description: "Private chefs and catering dispatched into the customer's kitchen.",
    engine: "serviceos",
    category: "services",
    modules: ["studio", "catalog", "dispatch", "matching", "telemetry", "tracking", "settlement", "provider_console", "billing"],
    features: ["Culinary catalog", "Travel surcharge", "Live tracking", "Escrow checkout"],
    keywords: ["chef", "catering", "culinary", "private chef", "serviceos"],
    verticalId: "culinary",
    templateId: "culinary",
    available: true,
    preset: "culinary",
  },
  {
    id: "full_resort",
    icon: "🏰",
    name: "Full Resort & Leisure Complex",
    description:
      "Hotel lodging plus dining, bar, wellness, and events — including charge to room folio.",
    engine: "hospitalityos",
    category: "hospitality",
    modules: ["accommodation", "dining", "bar", "gym_spa", "events", "billing", "crm"],
    features: ["Rooms", "Dining", "Bar", "Wellness", "Events", "Charge to folio"],
    keywords: ["hotel", "resort", "leisure", "complex", "full", "bundle"],
    verticalId: "resort",
    templateId: "full_hotel_resort",
    available: true,
  },
];

export function getMarketplaceVertical(id: string): MarketplaceVertical | undefined {
  return VERTICAL_CATALOG.find((item) => item.id === id);
}

export function filterVerticalCatalog(
  query: string,
  category: MarketplaceCategory = "all",
  items: MarketplaceVertical[] = VERTICAL_CATALOG,
): MarketplaceVertical[] {
  const q = query.trim().toLowerCase();
  return items.filter((item) => {
    if (category !== "all" && item.category !== category) return false;
    if (!q) return true;
    const haystack = [item.name, item.description, ...item.keywords].join(" ").toLowerCase();
    return haystack.includes(q);
  });
}
