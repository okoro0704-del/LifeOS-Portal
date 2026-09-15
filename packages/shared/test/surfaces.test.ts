import { describe, expect, test } from "vitest";
import {
  APPLICATION_SURFACES,
  BUSINESS_PORTAL_ORIGIN,
  GUEST_PORTAL_ORIGIN,
  PLATFORM_ADMIN_ORIGIN,
  UPSTREAM_SERVICE_ORIGINS,
  isUpstreamServiceUrl,
  mybrandOsDeliverables,
  mybrandUserAdminEnterPath,
  mybrandUserAdminUrl,
  mybrandUserAppUrl,
  mybrandSurfaceUrl,
  platformAdminDashboardUrl,
  platformUserDashboardUrl,
  platformWebUrl,
} from "../src/index.js";

describe("application surfaces", () => {
  test("locks the registered surfaces with web origins", () => {
    expect(Object.keys(APPLICATION_SURFACES).sort()).toEqual([
      "platform_admin_dashboard",
      "platform_user_dashboard",
      "platform_web",
      "studio",
      "user_admin",
      "user_app",
      "website",
    ]);
    expect(APPLICATION_SURFACES.platform_web.webOrigin).toBe(GUEST_PORTAL_ORIGIN);
    expect(APPLICATION_SURFACES.platform_user_dashboard.webOrigin).toBe(BUSINESS_PORTAL_ORIGIN);
    expect(APPLICATION_SURFACES.platform_admin_dashboard.webOrigin).toBe(PLATFORM_ADMIN_ORIGIN);
  });

  test("platform user dashboard URL is a web app host, not Railway", () => {
    expect(BUSINESS_PORTAL_ORIGIN).toBe("https://business.getlifeos.app");
    expect(isUpstreamServiceUrl(BUSINESS_PORTAL_ORIGIN)).toBe(false);
    expect(isUpstreamServiceUrl(UPSTREAM_SERVICE_ORIGINS.businessPortalUpstream)).toBe(true);
    expect(platformUserDashboardUrl()).toBe("https://business.getlifeos.app/dashboard/verticals");
    expect(platformUserDashboardUrl()).not.toContain("railway.app");
  });

  test("platform admin and web helpers stay on first-party hosts", () => {
    expect(platformAdminDashboardUrl()).toBe("https://admin.getlifeos.app/admin/tenants");
    expect(platformWebUrl("/app/business")).toBe("https://getlifeos.app/app/business");
  });

  test("mybrand USER APP and USER ADMIN URLs are distinct", () => {
    expect(mybrandUserAppUrl("kingbooker")).toBe("https://kingbooker.getlifeos.app/");
    expect(mybrandUserAdminUrl("kingbooker")).toBe("https://kingbooker.getlifeos.app/admin");
    const deliverables = mybrandOsDeliverables({ slug: "kingbooker" });
    expect(deliverables.guestApp.url).toBe("https://kingbooker.getlifeos.app/");
    expect(deliverables.adminDashboard.url).toBe("https://kingbooker.getlifeos.app/admin");
    expect(deliverables.guestApp.url).not.toBe(deliverables.adminDashboard.url);
  });

  test("mybrand deliverables ignore Railway and /studio overrides", () => {
    const deliverables = mybrandOsDeliverables({
      slug: "mrfundzman",
      baseUrl: "https://mybrandos-production.up.railway.app/u/mrfundzman",
      adminUrl: "https://mybrandos-production.up.railway.app/enter?wl=1",
    });
    expect(deliverables.guestApp.url).toBe("https://mrfundzman.getlifeos.app/");
    expect(deliverables.adminDashboard.url).toBe("https://mrfundzman.getlifeos.app/admin");
    expect(deliverables.adminDashboard.url).not.toContain("/studio");
    expect(deliverables.adminDashboard.url).not.toContain("railway");
  });

  test("canonical mybrand surface resolver is deterministic", () => {
    expect(mybrandSurfaceUrl({ slug: "kingbooker", surface: "user_app" })).toBe("https://kingbooker.getlifeos.app/");
    expect(mybrandSurfaceUrl({ slug: "kingbooker", surface: "studio" })).toBe("https://kingbooker.getlifeos.app/admin");
    expect(mybrandSurfaceUrl({ slug: "kingbooker", surface: "website" })).toBe("https://kingbooker.getlifeos.app/website");
  });

  test("USER ADMIN enter path carries white-label studio params and defaults returnTo=/admin", () => {
    const path = mybrandUserAdminEnterPath({
      trustId: "TD-WL-KINGBOOKER",
      displayName: "King Booker",
    });
    expect(path.startsWith("/enter?")).toBe(true);
    expect(path).toContain("wl=1");
    expect(path).toContain("trustId=TD-WL-KINGBOOKER");
    expect(path).toContain("name=King");
    expect(path).toContain("returnTo=%2Fadmin");
    expect(path).not.toMatch(/returnTo=%2F(?!admin)/);
  });

  test("enter path refuses public root as returnTo", () => {
    const path = mybrandUserAdminEnterPath({
      trustId: "TD-WL-MRFUNDZMAN",
      displayName: "Mr FundzMan",
      search: "?returnTo=/",
    });
    expect(path).toContain("returnTo=%2Fadmin");
  });
});
