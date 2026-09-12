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
  platformAdminDashboardUrl,
  platformUserDashboardUrl,
  platformWebUrl,
} from "../src/index.js";

describe("application surfaces", () => {
  test("locks five distinct surfaces with web origins", () => {
    expect(Object.keys(APPLICATION_SURFACES).sort()).toEqual([
      "platform_admin_dashboard",
      "platform_user_dashboard",
      "platform_web",
      "user_admin",
      "user_app",
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

  test("USER ADMIN enter path carries white-label studio params", () => {
    const path = mybrandUserAdminEnterPath({
      trustId: "TD-WL-KINGBOOKER",
      displayName: "King Booker",
    });
    expect(path.startsWith("/enter?")).toBe(true);
    expect(path).toContain("wl=1");
    expect(path).toContain("trustId=TD-WL-KINGBOOKER");
    expect(path).toContain("name=King");
    expect(path).not.toContain("/admin");
  });
});
