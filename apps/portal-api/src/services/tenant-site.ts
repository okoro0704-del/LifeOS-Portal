import { tenantDeliverables } from "@lifeos-portal/shared";
import type { PortalInstall, PortalStore } from "../store.js";

export type DashboardStyle = "console" | "greetings";

export type Testimonial = { name: string; quote: string; visit: string };

export type TenantSite = {
  logoUrl?: string;
  primaryColor?: string;
  backgroundUrl?: string;
  heroTitle?: string;
  writeup?: string;
  phone?: string;
  email?: string;
  address?: string;
  dashboardStyle: DashboardStyle;
  testimonials?: Testimonial[];
};

export type StaffActivity = {
  id: string;
  at: string;
  staffId: string;
  staffName: string;
  role: string;
  action: string;
  detail: string;
};

export function defaultSite(install: PortalInstall): TenantSite {
  const stored = (install.site ?? {}) as Partial<TenantSite>;
  return {
    logoUrl: stored.logoUrl ?? install.brandLogoUrl,
    primaryColor: stored.primaryColor ?? install.brandPrimaryColor,
    backgroundUrl: stored.backgroundUrl,
    heroTitle: stored.heroTitle,
    writeup: stored.writeup,
    phone: stored.phone,
    email: stored.email,
    address: stored.address,
    dashboardStyle: stored.dashboardStyle ?? install.dashboardStyle ?? "console",
    testimonials: stored.testimonials,
  };
}

export function defaultTestimonials(verticalId: string, business: string): Testimonial[] {
  if (verticalId === "hotel") {
    return [
      { name: "Ada K.", quote: `I booked a room at ${business} from my phone. Quiet night, warm plates, no lobby queue.`, visit: "Stayed two nights" },
      { name: "Musa O.", quote: "Front desk already had my name when I walked in. Self check-in actually worked.", visit: "Business stay" },
      { name: "Chioma B.", quote: "Drinks on the terrace, then room service. Felt like a hotel, not an app demo.", visit: "Weekend guest" },
    ];
  }
  if (verticalId === "local_food") {
    return [
      { name: "Tunde A.", quote: `${business} packed my ofada like a neighbour who cooks better than I do.`, visit: "Weekly order" },
      { name: "Amaka E.", quote: "Rider was on time. The suya still had heat when it hit the gate.", visit: "Delivery" },
      { name: "Ibrahim S.", quote: "I keep coming back because the kitchen tastes like a real home pot.", visit: "Repeat patron" },
    ];
  }
  return [
    { name: "Ngozi L.", quote: `${business} is where I take people when I want the table to do the talking.`, visit: "Dinner for two" },
    { name: "Kelechi P.", quote: "Jollof, cold chapman, no fuss. I already booked the same table again.", visit: "Friday night" },
    { name: "Fatima R.", quote: "Walked in, ordered from the phone, food came fast. This is my lunch spot now.", visit: "Regular" },
  ];
}

export function resolveTestimonials(
  install: PortalInstall,
  patrons: Array<{ name: string; visit: string }> = [],
) {
  const site = defaultSite(install);
  if (site.testimonials?.length) return site.testimonials.slice(0, 3);
  const defaults = defaultTestimonials(install.verticalId, install.displayName);
  const seen = new Set<string>();
  const unique = patrons.filter((row) => {
    const key = row.name.trim().toLowerCase();
    if (!key || seen.has(key)) return false;
    seen.add(key);
    return true;
  });
  return defaults.map((row, index) =>
    unique[index]
      ? { name: unique[index].name, quote: row.quote, visit: unique[index].visit || row.visit }
      : row,
  );
}

export function publicBranding(install: PortalInstall, patrons: Array<{ name: string; visit: string }> = []) {
  const site = defaultSite(install);
  const deliverables = tenantDeliverables(install.subdomain, install.customDomain);
  return {
    name: install.displayName,
    primaryColor: site.primaryColor ?? (install.verticalId === "local_food" ? "#e85d04" : install.verticalId === "restaurant" ? "#7c3aed" : "#0d7a6f"),
    logoUrl: site.logoUrl,
    backgroundUrl: site.backgroundUrl,
    heroTitle: site.heroTitle,
    writeup: site.writeup,
    phone: site.phone,
    email: site.email,
    address: site.address,
    dashboardStyle: site.dashboardStyle,
    testimonials: resolveTestimonials(install, patrons),
    staffAppUrl: deliverables.staffApp.url,
    adminDashboardUrl: deliverables.adminDashboard.url,
  };
}

export function updateTenantSite(
  install: PortalInstall,
  patch: Partial<TenantSite>,
  store: PortalStore,
) {
  const next = { ...defaultSite(install), ...stripEmpty(patch) };
  store.updateInstall(install.id, {
    site: next,
    dashboardStyle: next.dashboardStyle,
    brandPrimaryColor: next.primaryColor ?? install.brandPrimaryColor,
    brandLogoUrl: next.logoUrl ?? install.brandLogoUrl,
  });
  return next;
}

export function findInstallByHost(store: PortalStore, hostHeader: string) {
  const host = hostHeader.split(":")[0]?.toLowerCase() ?? "";
  return store.listAllInstalls().find((row) => {
    if (row.customDomain?.toLowerCase() === host) return true;
    return `${row.subdomain.toLowerCase()}.getlifeos.app` === host;
  });
}

function stripEmpty(patch: Partial<TenantSite>) {
  const next: Partial<TenantSite> = {};
  for (const [key, value] of Object.entries(patch) as Array<[keyof TenantSite, TenantSite[keyof TenantSite]]>) {
    if (value !== undefined) next[key] = value as never;
  }
  return next;
}
