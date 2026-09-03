/**
 * Admin suite — Tenant Business Portal + Platform Super Admin.
 * Hits the Portal API (TrustID, Master Distributor, Finprove) in-process.
 */
import { afterAll, beforeAll, describe, expect, test } from "vitest";
import type { FastifyInstance } from "fastify";
import {
  LIFEOS_HOST_TARGET,
  platformFeeMinor,
  simulatedGmvMinor,
  type TenantDomain,
  type TenantPortalAccess,
} from "@lifeos-portal/shared";

process.env.NODE_ENV = "test";
process.env.TRUSTID_MODE = "mock";
process.env.INSTALL_MODE = "local";
process.env.COOKIE_SECRET = "portal-admin-suite-cookie";
process.env.PORTAL_STORE_PATH = "";

let app: FastifyInstance;

async function session(trustId: string, platformAdmin = false) {
  const res = await app.inject({
    method: "POST",
    url: "/auth/session",
    payload: {
      accessToken: platformAdmin ? `mock:admin:${trustId}` : `mock:${trustId}`,
    },
  });
  expect(res.statusCode).toBe(200);
  const body = res.json() as {
    sessionToken: string;
    user: { trustId: string; roles: string[] };
  };
  return { token: body.sessionToken, user: body.user };
}

async function provisionHotel(
  token: string,
  input: { displayName: string; subdomain: string },
) {
  const paid = await app.inject({
    method: "POST",
    url: "/billing/checkout",
    headers: { "x-portal-session": token },
    payload: { osId: "hospitalityos", verticalId: "hotel" },
  });
  expect(paid.statusCode).toBe(201);
  const billingId = paid.json().billing.id as string;
  const licenseAmountMinor = paid.json().billing.amountMinor as number;
  const res = await app.inject({
    method: "POST",
    url: "/installs",
    headers: { "x-portal-session": token },
    payload: {
      osId: "hospitalityos",
      verticalId: "hotel",
      billingId,
      displayName: input.displayName,
      subdomain: input.subdomain,
      seed: "default",
      adminStaff: {
        email: `owner@${input.subdomain}.example`,
        displayName: "Owner",
        role: "owner",
      },
    },
  });
  expect(res.statusCode).toBe(201);
  return {
    install: res.json().install as {
      id: string;
      distributorTenantId: string;
      status: string;
    },
    licenseAmountMinor,
  };
}

describe("admin suite", () => {
  beforeAll(async () => {
    const { buildApp } = await import("../../portal-api/src/app.ts");
    app = await buildApp();
    await app.ready();
  });

  afterAll(async () => {
    if (app) await app.close();
  });

  test("auto-creates Tenant Business Portal access on first vertical provision", async () => {
    const { token, user } = await session("TD-APEX-OWNER");
    const before = await app.inject({
      method: "GET",
      url: "/v1/tenant/me",
      headers: { "x-portal-session": token },
    });
    expect(before.statusCode).toBe(403);
    expect(before.json().error).toBe("portal_not_provisioned");

    const { install } = await provisionHotel(token, {
      displayName: "Apex Stay",
      subdomain: `apex-stay-${Date.now().toString(36)}`,
    });
    expect(install.status).toBe("ready");

    const after = await app.inject({
      method: "GET",
      url: "/v1/tenant/me",
      headers: { "x-portal-session": token },
    });
    expect(after.statusCode).toBe(200);
    const body = after.json() as { access: TenantPortalAccess };
    expect(body.access.granted).toBe(true);
    expect(body.access.trustId).toBe(user.trustId);
    expect(body.access.sourceInstallId).toBe(install.id);
  });

  test("attaches a custom domain CNAME via Master Distributor", async () => {
    const { token } = await session("TD-CNAME-OWNER");
    await provisionHotel(token, {
      displayName: "Harbor Inn",
      subdomain: `harbor-inn-${Date.now().toString(36)}`,
    });

    const hostname = `rentals.apex-${Date.now().toString(36)}.com`;
    const res = await app.inject({
      method: "POST",
      url: "/v1/tenant/domains/custom",
      headers: { "x-portal-session": token },
      payload: { hostname },
    });
    expect(res.statusCode).toBe(201);
    const body = res.json() as {
      domain: TenantDomain;
      verification: { cnameTarget: string; dnsRecords: TenantDomain["dnsRecords"] };
    };
    expect(body.domain.hostname).toBe(hostname);
    expect(body.domain.kind).toBe("custom");
    expect(body.verification.cnameTarget).toBe(LIFEOS_HOST_TARGET);
    const cname = body.verification.dnsRecords.find((record) => record.type === "CNAME");
    expect(cname?.name).toBe(hostname);
    expect(cname?.content).toBe(LIFEOS_HOST_TARGET);

    const verified = await app.inject({
      method: "POST",
      url: "/v1/tenant/domains/verify",
      headers: { "x-portal-session": token },
      payload: { domainId: body.domain.domainId },
    });
    expect(verified.statusCode).toBe(200);
    expect(verified.json().domain.dnsStatus).toBe("ACTIVE");
  });

  test("blocks non-admin Trust ID tokens from platform admin", async () => {
    const tenant = await session("TD-TENANT-ONLY");
    const denied = await app.inject({
      method: "GET",
      url: "/v1/admin/tenants",
      headers: { "x-portal-session": tenant.token },
    });
    expect(denied.statusCode).toBe(403);
    expect(denied.json().error).toBe("forbidden");
    expect(tenant.user.roles).not.toContain("platform_admin");

    const admin = await session("TD-PLATFORM", true);
    expect(admin.user.roles).toContain("platform_admin");
    const allowed = await app.inject({
      method: "GET",
      url: "/v1/admin/tenants",
      headers: { "x-portal-session": admin.token },
    });
    expect(allowed.statusCode).toBe(200);
    expect(Array.isArray(allowed.json().tenants)).toBe(true);
  });

  test("tenant directory search and platform fee aggregation", async () => {
    const first = await session("TD-FEE-A");
    const second = await session("TD-FEE-B");
    const slug = Date.now().toString(36);
    const a = await provisionHotel(first.token, {
      displayName: "Apex Directory Hotel",
      subdomain: `apex-dir-${slug}`,
    });
    const b = await provisionHotel(second.token, {
      displayName: "Lagoon Suites",
      subdomain: `lagoon-${slug}`,
    });

    const expectedFee =
      platformFeeMinor(simulatedGmvMinor(a.licenseAmountMinor)) +
      platformFeeMinor(simulatedGmvMinor(b.licenseAmountMinor));

    const operator = await session("TD-PLATFORM", true);
    const search = await app.inject({
      method: "GET",
      url: "/v1/admin/tenants?q=Apex",
      headers: { "x-portal-session": operator.token },
    });
    expect(search.statusCode).toBe(200);
    const hits = search.json().tenants as Array<{
      displayName: string;
      ownerTrustId: string;
      subdomain: string;
      customDomain?: string;
      gmvMinor: number;
      platformFeeMinor: number;
    }>;
    expect(hits.some((row) => row.displayName === "Apex Directory Hotel")).toBe(true);
    expect(
      hits.every((row) =>
        /apex/i.test(`${row.displayName} ${row.ownerTrustId} ${row.subdomain} ${row.customDomain ?? ""}`),
      ),
    ).toBe(true);
    const apex = hits.find((row) => row.displayName === "Apex Directory Hotel")!;
    expect(apex.platformFeeMinor).toBe(platformFeeMinor(apex.gmvMinor));
    expect(apex.platformFeeMinor).toBe(platformFeeMinor(simulatedGmvMinor(a.licenseAmountMinor)));

    const directory = await app.inject({
      method: "GET",
      url: "/v1/admin/tenants",
      headers: { "x-portal-session": operator.token },
    });
    const tenants = directory.json().tenants as Array<{ platformFeeMinor: number; gmvMinor: number }>;
    const summedFees = tenants.reduce((sum, row) => sum + row.platformFeeMinor, 0);

    expect(summedFees).toBeGreaterThanOrEqual(expectedFee);

    const goneAdmin = await app.inject({
      method: "GET",
      url: "/v1/admin/finance",
      headers: { "x-portal-session": operator.token },
    });
    expect(goneAdmin.statusCode).toBe(404);

    const goneTenant = await app.inject({
      method: "GET",
      url: "/v1/tenant/finance",
      headers: { "x-portal-session": first.token },
    });
    expect(goneTenant.statusCode).toBe(404);
  });
});
