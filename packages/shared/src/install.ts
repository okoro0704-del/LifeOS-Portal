import type { TenantDeliverables } from "./urls.js";

export type { TenantDeliverables } from "./urls.js";

export type InstallStatus =
  | "bootstrapping"
  | "awaiting_domain"
  | "provisioning"
  | "ready"
  | "failed";

export type LaunchUrls = {
  staff?: string;
  guest?: string;
  storefront?: string;
  admin?: string;
};

export type InstallRecordPublic = {
  id: string;
  appId: string;
  osId: string;
  verticalId: string;
  billingId?: string;
  displayName: string;
  subdomain: string;
  customDomain?: string;
  distributorTenantId: string;
  domainId?: string;
  hosTenantId?: string;
  tenantId?: string;
  storefrontUrl?: string;
  adminConsoleUrl?: string;
  organizationId?: string;
  branchId?: string;
  staffId?: string;
  modulesEnabled: string[];
  enabledModules?: string[];
  seedApplied: boolean;
  launchUrls?: LaunchUrls;
  deliverables?: TenantDeliverables;
  status: InstallStatus;
  error?: string;
  createdAt: string;
  updatedAt: string;
};

export type InstallHospitalityInput = {
  osId?: string;
  appId?: string;
  verticalId: string;
  billingId: string;
  displayName: string;
  subdomain: string;
  customDomain?: string;
  organization?: { slug?: string; name?: string };
  brand?: { primaryColor?: string; logoUrl?: string };
  dashboardStyle?: "console" | "greetings";
  site?: { writeup?: string; phone?: string; email?: string; address?: string };
  seed?: "default" | "none";
  enabledModules?: string[];
  pickup?: {
    addressLine1?: string;
    city?: string;
    region?: string;
    postalCode?: string;
    country?: string;
    lat?: number;
    lng?: number;
  };
  walletPayoutAccount?: string;
  rentalSettings?: {
    defaultDailyRate?: number;
    defaultHourlyRate?: number;
    defaultSecurityDepositAmount?: number;
    requireLicenseVerification?: boolean;
  };
  /** TransportationOS / ServiceOS / HospitalityOS portal preset */
  preset?: string;
  /** HOS install template id e.g. standalone_local_food */
  installTemplate?: string;
  localFoodSettings?: {
    defaultPrepBufferMins?: number;
    deliveryRadiusKm?: number;
    fundzmanInstantPayout?: boolean;
  };
  verticals?: { logistics?: boolean; rentals?: boolean };
  adminStaff: {
    email: string;
    displayName: string;
    role?: string;
    password?: string;
  };
  trustIdAccessToken?: string;
};

export type DistributorBootstrapResult = {
  tenantId: string;
  domainId?: string;
  manifest: {
    tenantId: string;
    subdomain: string;
    customDomain?: string;
    hostTarget?: string;
    enabledPrimitives: string[];
    displayName?: string;
    brand?: { primaryColor?: string; logoUrl?: string };
    oauthDestinations?: string[];
    enabledModules?: string[];
    domainId?: string;
    compiledAt: string;
    version: string;
  };
  eventsEmitted: string[];
};

export type DomainStatusResult = {
  domainId: string;
  dnsStatus: string;
  sslStatus: string;
  dnsVerified: boolean;
  sslReady: boolean;
};

export type HosProvisionResult = {
  ok: true;
  hosTenantId?: string;
  tenantId?: string;
  organizationId?: string;
  branchId?: string;
  staffId?: string;
  modulesEnabled: string[];
  enabledModules?: string[];
  seedApplied: boolean;
  storefrontUrl?: string;
  adminConsoleUrl?: string;
  launchUrls: LaunchUrls;
};

export type PortalOrganization = {
  organizationId: string;
  name: string;
  appId: string;
  osId?: string;
  verticalId?: string;
  hosTenantId?: string;
  role: string;
  launchUrls?: LaunchUrls;
  deliverables?: TenantDeliverables;
};
