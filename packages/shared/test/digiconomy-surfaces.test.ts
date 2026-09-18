import { describe, expect, test } from "vitest";
import {
  DIGICONOMY_ACTIVE_ROOT_POLICY,
  DIGICONOMY_SURFACE_IDS,
  classifyDigiconomyHost,
  digiconomyCurrentSurfaceUrl,
  digiconomyTargetSurfaceUrl,
  mybrandUserAppUrl,
  pathMatchesSurfaceSegment,
  resolveDigiconomyRequest,
  tenantDeliverables,
} from "../src/index.js";

describe("Digiconomy surface contract", () => {
  test("exposes the five canonical surface ids", () => {
    expect([...DIGICONOMY_SURFACE_IDS]).toEqual([
      "digital_space",
      "app",
      "news",
      "digipedia",
      "admin",
    ]);
    expect(DIGICONOMY_ACTIVE_ROOT_POLICY).toBe("root_is_app");
  });
});

describe("resolveDigiconomyRequest — current production policy", () => {
  const host = "mrfundzman.getlifeos.app";

  test("tenant root is APP (not Digital Space)", () => {
    const r = resolveDigiconomyRequest({ host, path: "/" });
    expect(r.hostKind).toBe("tenant_getlifeos");
    expect(r.tenantSlug).toBe("mrfundzman");
    expect(r.surface).toBe("app");
    expect(r.publicAppDeployedAtRoot).toBe(true);
    expect(r.rootPolicy).toBe("root_is_app");
  });

  test("/space and /life are Digital Space; /life redirects to /space", () => {
    expect(resolveDigiconomyRequest({ host, path: "/space" }).surface).toBe("digital_space");
    expect(resolveDigiconomyRequest({ host, path: "/space/styles.css" }).surface).toBe(
      "digital_space",
    );
    const life = resolveDigiconomyRequest({ host, path: "/life" });
    expect(life.surface).toBe("digital_space");
    expect(life.lifeCompatibility).toBe(true);
    expect(life.lifeRedirectTo).toBe("/space");
  });

  test("news, digipedia, admin surfaces", () => {
    expect(resolveDigiconomyRequest({ host, path: "/news" }).surface).toBe("news");
    expect(resolveDigiconomyRequest({ host, path: "/news/post-1" }).surface).toBe("news");
    expect(resolveDigiconomyRequest({ host, path: "/digipedia" }).surface).toBe("digipedia");
    expect(resolveDigiconomyRequest({ host, path: "/admin" }).surface).toBe("admin");
    expect(resolveDigiconomyRequest({ host, path: "/admin/settings" }).surface).toBe("admin");
  });

  test("/app is model-recognized as APP under current policy without implying production cutover", () => {
    const r = resolveDigiconomyRequest({ host, path: "/app" });
    expect(r.surface).toBe("app");
    expect(r.publicAppDeployedAtRoot).toBe(true);
  });

  test("query parameters cannot select surface", () => {
    const r = resolveDigiconomyRequest({
      host,
      path: "/",
      search: "?surface=admin&app=1",
    });
    expect(r.surface).toBe("app");
    expect(r.queryIgnoredForSurface).toBe(true);
    expect(resolveDigiconomyRequest({ host, path: "/news?surface=admin" }).surface).toBe("news");
  });
});

describe("resolveDigiconomyRequest — future target policy (unit only)", () => {
  const host = "mrfundzman.getlifeos.app";
  const policy = "root_is_digital_space" as const;

  test("root becomes Digital Space; /app becomes APP", () => {
    expect(resolveDigiconomyRequest({ host, path: "/", rootPolicy: policy }).surface).toBe(
      "digital_space",
    );
    expect(resolveDigiconomyRequest({ host, path: "/space", rootPolicy: policy }).surface).toBe(
      "digital_space",
    );
    expect(resolveDigiconomyRequest({ host, path: "/app", rootPolicy: policy }).surface).toBe("app");
    expect(resolveDigiconomyRequest({ host, path: "/news", rootPolicy: policy }).surface).toBe(
      "news",
    );
    expect(resolveDigiconomyRequest({ host, path: "/digipedia", rootPolicy: policy }).surface).toBe(
      "digipedia",
    );
    expect(resolveDigiconomyRequest({ host, path: "/admin", rootPolicy: policy }).surface).toBe(
      "admin",
    );
  });
});

describe("path boundaries", () => {
  const host = "mrfundzman.getlifeos.app";

  test("lookalike paths are not Digiconomy surfaces", () => {
    expect(pathMatchesSurfaceSegment("/lifestyle", "life")).toBe(false);
    expect(pathMatchesSurfaceSegment("/lifelong", "life")).toBe(false);
    expect(pathMatchesSurfaceSegment("/application", "app")).toBe(false);
    expect(pathMatchesSurfaceSegment("/apparel", "app")).toBe(false);
    expect(pathMatchesSurfaceSegment("/newsletter", "news")).toBe(false);
    expect(pathMatchesSurfaceSegment("/administrator", "admin")).toBe(false);
    expect(pathMatchesSurfaceSegment("/digipediaSomething", "digipedia")).toBe(false);

    expect(resolveDigiconomyRequest({ host, path: "/lifestyle" }).surface).toBeNull();
    expect(resolveDigiconomyRequest({ host, path: "/lifelong" }).surface).toBeNull();
    expect(resolveDigiconomyRequest({ host, path: "/application" }).surface).toBeNull();
    expect(resolveDigiconomyRequest({ host, path: "/apparel" }).surface).toBeNull();
    expect(resolveDigiconomyRequest({ host, path: "/newsletter" }).surface).toBeNull();
    expect(resolveDigiconomyRequest({ host, path: "/administrator" }).surface).toBeNull();
    expect(resolveDigiconomyRequest({ host, path: "/digipediaSomething" }).surface).toBeNull();
  });
});

describe("host context", () => {
  test("getlifeos.app/app is Portal marketplace — not tenant APP", () => {
    const r = resolveDigiconomyRequest({ host: "getlifeos.app", path: "/app" });
    expect(r.hostKind).toBe("portal_apex");
    expect(r.isPortalAppRoute).toBe(true);
    expect(r.surface).toBeNull();
    expect(r.tenantSlug).toBeNull();

    const www = resolveDigiconomyRequest({ host: "www.getlifeos.app", path: "/app/business" });
    expect(www.isPortalAppRoute).toBe(true);
    expect(www.surface).toBeNull();
  });

  test("tenant /app under target policy is APP; apex remains Portal", () => {
    const tenant = resolveDigiconomyRequest({
      host: "mrfundzman.getlifeos.app",
      path: "/app",
      rootPolicy: "root_is_digital_space",
    });
    expect(tenant.surface).toBe("app");
    expect(tenant.isPortalAppRoute).toBe(false);

    const apex = resolveDigiconomyRequest({
      host: "getlifeos.app",
      path: "/app",
      rootPolicy: "root_is_digital_space",
    });
    expect(apex.isPortalAppRoute).toBe(true);
    expect(apex.surface).toBeNull();
  });

  test("reserved and unknown hosts", () => {
    expect(classifyDigiconomyHost("admin.getlifeos.app").hostKind).toBe("portal_reserved");
    expect(classifyDigiconomyHost("business.getlifeos.app").hostKind).toBe("portal_reserved");
    expect(classifyDigiconomyHost("unknownslug.getlifeos.app").tenantSlug).toBe("unknownslug");
    expect(classifyDigiconomyHost("not-a-host").hostKind).toBe("unknown");
  });

  test("custom domain candidate is representable without claiming verification", () => {
    const apex = classifyDigiconomyHost("mrfundzman.com");
    expect(apex.hostKind).toBe("custom_domain_candidate");
    expect(apex.customDomainApex).toBe("mrfundzman.com");

    const news = classifyDigiconomyHost("news.mrfundzman.com");
    expect(news.hostKind).toBe("custom_domain_candidate");
    expect(news.hostSurfacePrefix).toBe("news");
    expect(news.customDomainApex).toBe("mrfundzman.com");

    const conflict = resolveDigiconomyRequest({
      host: "app.mrfundzman.com",
      path: "/news",
    });
    expect(conflict.hostSurfacePrefix).toBe("app");
    expect(conflict.conflict.kind).toBe("host_owns_surface");
    expect(conflict.surface).toBe("app");
  });
});

describe("URL helpers — dual policy without migrating callers", () => {
  test("current policy URLs match production meaning", () => {
    expect(digiconomyCurrentSurfaceUrl("mrfundzman", "app")).toBe("https://mrfundzman.getlifeos.app/");
    expect(digiconomyCurrentSurfaceUrl("mrfundzman", "digital_space")).toBe(
      "https://mrfundzman.getlifeos.app/space",
    );
    expect(digiconomyCurrentSurfaceUrl("mrfundzman", "news")).toBe(
      "https://mrfundzman.getlifeos.app/news",
    );
    expect(digiconomyCurrentSurfaceUrl("mrfundzman", "digipedia")).toBe(
      "https://mrfundzman.getlifeos.app/digipedia",
    );
    expect(digiconomyCurrentSurfaceUrl("mrfundzman", "admin")).toBe(
      "https://mrfundzman.getlifeos.app/admin",
    );
  });

  test("target policy URLs are available but unused by existing callers", () => {
    expect(digiconomyTargetSurfaceUrl("mrfundzman", "digital_space")).toBe(
      "https://mrfundzman.getlifeos.app/",
    );
    expect(digiconomyTargetSurfaceUrl("mrfundzman", "app")).toBe(
      "https://mrfundzman.getlifeos.app/app",
    );
  });

  test("existing mybrandUserAppUrl and guestApp remain root Public App", () => {
    expect(mybrandUserAppUrl("kingbooker")).toBe("https://kingbooker.getlifeos.app/");
    expect(tenantDeliverables("kingbooker").guestApp.url).toBe("https://kingbooker.getlifeos.app/");
  });
});

describe("admin is routing identity only", () => {
  test("resolver marks ADMIN without implying authorization", () => {
    const r = resolveDigiconomyRequest({ host: "mrfundzman.getlifeos.app", path: "/admin" });
    expect(r.surface).toBe("admin");
    expect("authorized" in r).toBe(false);
    expect("session" in r).toBe(false);
  });
});
