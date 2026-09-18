import { getVertical, tenantDeliverables, tenantLaunchUrls } from "@lifeos-portal/shared";
import { HttpError } from "../lib/http.js";
import type { PortalInstall, PortalStore } from "../store.js";
import { provisionTenantHostname } from "./tenant-hostname.js";
import { projectInstallToLifeOsShell } from "./shell-projection.js";

export type SellerInstallInput = {
  applicationId: string;
  tenantId: string;
  subdomain: string;
  displayName: string;
  marketplaceSubdomain: string;
  organizationId?: string;
};

/**
 * Register an Online Store that a Marketplace operator created in EcommerceOS
 * as a canonical PortalInstall + getlifeos.app hostname. Does not consume a license.
 */
export async function registerMarketplaceSellerInstall(
  store: PortalStore,
  input: SellerInstallInput,
): Promise<PortalInstall> {
  const subdomain = input.subdomain.trim().toLowerCase();
  if (!/^[a-z0-9]([a-z0-9-]*[a-z0-9])?$/.test(subdomain)) {
    throw new HttpError("Invalid subdomain", 400, "invalid_subdomain");
  }

  const marketplace = store.getReadyInstallBySubdomain(input.marketplaceSubdomain.trim().toLowerCase());
  if (!marketplace || marketplace.osId !== "ecommerceos") {
    throw new HttpError("Marketplace operator install not found", 404, "not_found");
  }

  const existingById = store.getInstall(input.applicationId);
  if (existingById?.status === "ready") return existingById;
  const existingBySlug = store.getReadyInstallBySubdomain(subdomain);
  if (existingBySlug) return existingBySlug;

  const modules = getVertical("ecommerceos", "delivery")?.modules ?? ["catalog", "checkout", "logisticsBridge"];
  const deliverables = tenantDeliverables(subdomain);
  const launchUrls = tenantLaunchUrls(subdomain);

  const row = store.createInstall({
    id: input.applicationId,
    ownerUserId: marketplace.ownerUserId,
    ownerTrustId: marketplace.ownerTrustId,
    appId: "ecommerceos",
    osId: "ecommerceos",
    verticalId: "delivery",
    displayName: input.displayName,
    subdomain,
    distributorTenantId: marketplace.distributorTenantId,
    hosTenantId: input.tenantId,
    tenantId: input.tenantId,
    organizationId: input.organizationId ?? marketplace.organizationId,
    storefrontUrl: deliverables.guestApp.url,
    adminConsoleUrl: deliverables.adminDashboard.url,
    modulesEnabled: [...modules],
    enabledModules: [...modules],
    preset: "delivery",
    seedApplied: true,
    status: "ready",
    launchUrls,
  });

  try {
    await provisionTenantHostname(subdomain);
  } catch {
    // Tenant remains reachable at getlifeos.app/t/{subdomain} if DNS lags.
  }

  await projectInstallToLifeOsShell({
    installId: row.id,
    trustId: row.ownerTrustId,
    appId: "ecommerceos",
    osId: "ecommerceos",
    verticalId: "delivery",
    tenantId: input.tenantId,
    displayName: input.displayName,
    subdomain,
    launchUrl: deliverables.adminDashboard.url,
    preset: "delivery",
    enabledModules: row.enabledModules,
    modulesEnabled: row.modulesEnabled,
  });

  return row;
}
