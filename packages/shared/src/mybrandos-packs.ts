/**
 * Canonical mybrandOS commercial pack configuration (Portal).
 *
 * Pack is a commercial configuration of the existing mybrandOS application.
 * It does NOT change Digiconomy taxonomy (mybrandos / creator / cross_industry).
 * It does NOT create a second application identity.
 *
 * Two commercial layers:
 * - software: one-time purchase of the mybrandOS edition
 * - services: monthly Digiconomy services that power that Digital Life
 *
 * Asset taxonomy: no canonical creator Asset category enum exists in this
 * repository yet. Monetization is expressed as an allowance count only —
 * do not invent incompatible Asset types here.
 */

export const MYBRANDOS_PACK_IDS = ["audience", "creator", "creator_plus", "creator_pro"] as const;
export type MyBrandOsPackId = (typeof MYBRANDOS_PACK_IDS)[number];

export type MyBrandOsCommercialLayer = "software" | "services";

export type MyBrandOsMonetizationAllowance =
  | { kind: "none"; label: string }
  | { kind: "count"; count: number; label: string }
  | { kind: "all_eligible"; label: string };

export type MyBrandOsCapabilityItem = {
  id: string;
  label: string;
  /** When false, UI should not present the item as a live guarantee. */
  available: boolean;
};

export type MyBrandOsPackSoftware = {
  oneTimePriceMinor: number;
  currency: "USD";
  headline: string;
  capabilities: MyBrandOsCapabilityItem[];
  monetization: MyBrandOsMonetizationAllowance;
};

export type MyBrandOsPackServices = {
  monthlyPriceMinor: number;
  currency: "USD";
  headline: string;
  /** Planning quota — DataZone per-tenant pack metering is not fully wired yet. */
  dataZoneQuotaLabel: string;
  dataZoneQuotaBytes: number;
  /** Planning Digi AI allowance — credit metering not fully wired yet. */
  digiAiCreditsMonthly: number;
  includedServices: MyBrandOsCapabilityItem[];
};

export type MyBrandOsPack = {
  id: MyBrandOsPackId;
  name: string;
  positioning: string;
  /** Display order, lowest first. */
  order: number;
  software: MyBrandOsPackSoftware;
  services: MyBrandOsPackServices;
};

const GB = 1024 ** 3;
const TB = 1024 ** 4;

const AUDIENCE_SOFTWARE_CAPS: MyBrandOsCapabilityItem[] = [
  { id: "digital_life", label: "Your own mybrandOS Digital Life", available: true },
  { id: "public_app", label: "Public mybrandOS App", available: true },
  { id: "creator_presence", label: "Creator / profile presence", available: true },
  { id: "studio_basic", label: "Creator Studio — basic edition", available: true },
  { id: "create", label: "Create", available: true },
  { id: "publish", label: "Publish", available: true },
  { id: "asset_management", label: "Asset management", available: true },
  { id: "posts", label: "Posts", available: true },
  { id: "photo", label: "Photo publishing", available: true },
  { id: "video", label: "Video publishing", available: true },
  { id: "reels", label: "Reels / Watch presentations where supported", available: true },
  { id: "writing", label: "Writing", available: true },
  { id: "website_info", label: "Website / INFO foundation", available: true },
  { id: "digipedia", label: "DigiPedia", available: true },
  { id: "news_blog", label: "News / Blog foundation", available: true },
  { id: "connect", label: "Connect", available: true },
  { id: "love_comments", label: "Love / Comments", available: true },
  { id: "share", label: "Share", available: true },
  { id: "save_offline", label: "Save / Offline capabilities", available: true },
  { id: "build_assets", label: "Build across supported Asset types", available: true },
];

const CREATOR_EXTRA_SOFTWARE: MyBrandOsCapabilityItem[] = [
  { id: "studio_full", label: "Full Creator Studio", available: true },
  { id: "commercial_publish", label: "Commercial publishing capability", available: true },
  { id: "monetization_foundation", label: "Monetization foundation", available: true },
  { id: "paid_offerings", label: "Paid creator offerings where supported", available: true },
  { id: "creator_vip", label: "Creator VIP capability", available: true },
  { id: "creator_commerce", label: "Creator commerce foundation", available: true },
  { id: "earnings_dashboard", label: "Revenue / earning dashboard", available: true },
  { id: "creator_analytics", label: "Creator analytics", available: true },
  { id: "commercial_profile", label: "Commercial profile capabilities", available: true },
  {
    id: "campaigns",
    label: "Campaign / promotion tools where supported",
    available: true,
  },
  {
    id: "earn_one_category",
    label: "Choose one eligible Asset category to monetize",
    available: true,
  },
];

const CREATOR_PLUS_EXTRA_SOFTWARE: MyBrandOsCapabilityItem[] = [
  { id: "studio_advanced", label: "Advanced Creator Studio capabilities", available: true },
  {
    id: "earn_three_categories",
    label: "Monetize up to three eligible Asset categories",
    available: true,
  },
  { id: "multi_format_business", label: "Multi-format creator business capabilities", available: true },
  { id: "advanced_publish", label: "Advanced publishing workflows", available: true },
  {
    id: "advanced_campaigns",
    label: "Advanced campaign capabilities where supported",
    available: true,
  },
  { id: "multi_presentation", label: "Multi-presentation publishing", available: true },
  { id: "advanced_analytics", label: "Advanced analytics", available: true },
  { id: "vip_controls", label: "Expanded Creator VIP controls", available: true },
  { id: "website_advanced", label: "Advanced Website / INFO capabilities", available: true },
  { id: "audience_tools", label: "More sophisticated audience / business tools", available: true },
];

const CREATOR_PRO_EXTRA_SOFTWARE: MyBrandOsCapabilityItem[] = [
  { id: "studio_pro", label: "Professional Creator Studio", available: true },
  {
    id: "earn_all_categories",
    label: "Monetization across all eligible Asset categories",
    available: true,
  },
  { id: "pro_publish", label: "Professional publishing tools", available: true },
  { id: "full_creator_business", label: "Full creator-business capability set", available: true },
  { id: "vip_pro", label: "Advanced Creator VIP controls", available: true },
  { id: "pro_analytics", label: "Professional analytics", available: true },
  { id: "pro_campaigns", label: "Advanced campaigns", available: true },
  { id: "website_pro", label: "Professional Website / INFO capabilities", available: true },
  { id: "distribution_pro", label: "Highest available distribution controls", available: true },
  {
    id: "digi_ai_integrations",
    label: "Advanced Digi AI integrations where supported",
    available: false,
  },
  {
    id: "automation_agents",
    label: "Advanced automation / agent capabilities where supported",
    available: false,
  },
  { id: "pro_operating", label: "Professional creator operating controls", available: true },
];

function serviceItems(opts: {
  dataZoneLabel: string;
  digiAiCredits: number;
  higherCapacity?: boolean;
  commercial?: boolean;
  vip?: boolean;
  analytics?: boolean;
  prioritySupport?: boolean;
  proSupport?: boolean;
}): MyBrandOsCapabilityItem[] {
  const items: MyBrandOsCapabilityItem[] = [
    { id: "managed_hosting", label: "Managed mybrandOS hosting on getlifeos.app", available: true },
    {
      id: "datazone",
      label: `DataZone allocation — ${opts.dataZoneLabel} (planned metering)`,
      available: false,
    },
    {
      id: "digi_ai",
      label: `Digi AI — ${opts.digiAiCredits.toLocaleString()} monthly credits (planned)`,
      available: false,
    },
    {
      id: "sovereign_drive",
      label: "Sovereign Drive-backed storage where architecture applies",
      available: false,
    },
    { id: "media_delivery", label: "Media delivery", available: true },
    { id: "publication_infra", label: "Publication infrastructure", available: true },
    {
      id: "processing",
      label: opts.higherCapacity
        ? "Higher media-processing allowance"
        : "Processing allowance for this tier",
      available: false,
    },
    { id: "app_updates", label: "Application updates", available: true },
    { id: "security_maintenance", label: "Security / service maintenance", available: true },
    { id: "public_availability", label: "Public application availability", available: true },
    { id: "website_service", label: "Website / INFO service availability", available: true },
    {
      id: "distribution",
      label: "Basic distribution infrastructure where supported",
      available: true,
    },
  ];
  if (opts.commercial) {
    items.push({
      id: "commercial_infra",
      label: "Commercial / creator service infrastructure",
      available: true,
    });
  }
  if (opts.vip) {
    items.push({
      id: "vip_service",
      label: "Creator VIP service infrastructure where implemented",
      available: true,
    });
  }
  if (opts.analytics) {
    items.push({
      id: "analytics_service",
      label: "Analytics services",
      available: true,
    });
  }
  if (opts.prioritySupport) {
    items.push({
      id: "priority_support",
      label: "Priority support",
      available: false,
    });
  }
  if (opts.proSupport) {
    items.push({
      id: "pro_support",
      label: "Priority / Pro support",
      available: false,
    });
  }
  return items;
}

export const MYBRANDOS_PACKS: MyBrandOsPack[] = [
  {
    id: "audience",
    name: "Audience",
    positioning: "Build your Digital Life.",
    order: 1,
    software: {
      oneTimePriceMinor: 4900,
      currency: "USD",
      headline: "Own the Audience edition of mybrandOS.",
      capabilities: AUDIENCE_SOFTWARE_CAPS,
      monetization: { kind: "none", label: "Monetization not included" },
    },
    services: {
      monthlyPriceMinor: 900,
      currency: "USD",
      headline: "Keep your Digital Life online and operating.",
      dataZoneQuotaLabel: "10 GB",
      dataZoneQuotaBytes: 10 * GB,
      digiAiCreditsMonthly: 100,
      includedServices: serviceItems({
        dataZoneLabel: "10 GB",
        digiAiCredits: 100,
      }),
    },
  },
  {
    id: "creator",
    name: "Creator",
    positioning: "Create. Publish. Start earning.",
    order: 2,
    software: {
      oneTimePriceMinor: 19900,
      currency: "USD",
      headline: "Own the Creator edition — build freely, earn from one category.",
      capabilities: [...AUDIENCE_SOFTWARE_CAPS, ...CREATOR_EXTRA_SOFTWARE],
      monetization: { kind: "count", count: 1, label: "Earn from 1 Asset category" },
    },
    services: {
      monthlyPriceMinor: 3900,
      currency: "USD",
      headline: "Creator operating capacity for your Digital Life.",
      dataZoneQuotaLabel: "100 GB",
      dataZoneQuotaBytes: 100 * GB,
      digiAiCreditsMonthly: 500,
      includedServices: serviceItems({
        dataZoneLabel: "100 GB",
        digiAiCredits: 500,
        higherCapacity: true,
        commercial: true,
        vip: true,
        analytics: true,
      }),
    },
  },
  {
    id: "creator_plus",
    name: "Creator Plus",
    positioning: "Build a multi-format creator business.",
    order: 3,
    software: {
      oneTimePriceMinor: 49900,
      currency: "USD",
      headline: "Own Creator Plus — monetize up to three eligible categories.",
      capabilities: [
        ...AUDIENCE_SOFTWARE_CAPS,
        ...CREATOR_EXTRA_SOFTWARE.filter((c) => c.id !== "earn_one_category"),
        ...CREATOR_PLUS_EXTRA_SOFTWARE,
      ],
      monetization: { kind: "count", count: 3, label: "Earn from up to 3 Asset categories" },
    },
    services: {
      monthlyPriceMinor: 7900,
      currency: "USD",
      headline: "Expanded capacity for a multi-format creator business.",
      dataZoneQuotaLabel: "500 GB",
      dataZoneQuotaBytes: 500 * GB,
      digiAiCreditsMonthly: 1500,
      includedServices: serviceItems({
        dataZoneLabel: "500 GB",
        digiAiCredits: 1500,
        higherCapacity: true,
        commercial: true,
        vip: true,
        analytics: true,
        prioritySupport: true,
      }),
    },
  },
  {
    id: "creator_pro",
    name: "Creator Pro",
    positioning: "Run your creator business without limits on earning categories.",
    order: 4,
    software: {
      oneTimePriceMinor: 99900,
      currency: "USD",
      headline: "Own Creator Pro — earn across all eligible Asset categories.",
      capabilities: [
        ...AUDIENCE_SOFTWARE_CAPS,
        ...CREATOR_EXTRA_SOFTWARE.filter((c) => c.id !== "earn_one_category"),
        ...CREATOR_PLUS_EXTRA_SOFTWARE.filter((c) => c.id !== "earn_three_categories"),
        ...CREATOR_PRO_EXTRA_SOFTWARE,
      ],
      monetization: { kind: "all_eligible", label: "Earn from all eligible Asset categories" },
    },
    services: {
      monthlyPriceMinor: 14900,
      currency: "USD",
      headline: "Professional operating capacity for your creator business.",
      dataZoneQuotaLabel: "2 TB",
      dataZoneQuotaBytes: 2 * TB,
      digiAiCreditsMonthly: 5000,
      includedServices: serviceItems({
        dataZoneLabel: "2 TB",
        digiAiCredits: 5000,
        higherCapacity: true,
        commercial: true,
        vip: true,
        analytics: true,
        proSupport: true,
      }),
    },
  },
];

export function listMyBrandOsPacks(): MyBrandOsPack[] {
  return [...MYBRANDOS_PACKS].sort((a, b) => a.order - b.order);
}

export function getMyBrandOsPack(id: string): MyBrandOsPack | undefined {
  return MYBRANDOS_PACKS.find((pack) => pack.id === id);
}

export function isMyBrandOsPackId(value: string): value is MyBrandOsPackId {
  return (MYBRANDOS_PACK_IDS as readonly string[]).includes(value);
}

export function formatMyBrandOsPackPrice(amountMinor: number, currency: "USD" = "USD"): string {
  if (currency !== "USD") return `${amountMinor} ${currency}`;
  return `$${(amountMinor / 100).toLocaleString("en-US", { maximumFractionDigits: 0 })}`;
}

/** Tagline used across Packs UI. */
export const MYBRANDOS_PACKS_TAGLINE = "Own your mybrandOS. Subscribe to the services that power it.";
