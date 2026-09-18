import assert from "node:assert/strict";
import { describe, test } from "node:test";
import {
  digiconomyEdgeSurfaceFromPath,
  digitalSpaceUpstreamPath,
  isDigitalSpacePath,
  rewriteDigitalSpaceLocation,
  selectBrandSurface,
  shouldRedirectLifeToSpace,
  tenantLabelFromHost,
} from "./surface-routing.ts";

describe("Digital Space edge surface routing", () => {
  test("/space is Digital Space; /life is compatibility; lookalikes are not", () => {
    assert.equal(isDigitalSpacePath("/space"), true);
    assert.equal(isDigitalSpacePath("/space/"), true);
    assert.equal(isDigitalSpacePath("/space/styles.css"), true);
    assert.equal(isDigitalSpacePath("/life"), true);
    assert.equal(isDigitalSpacePath("/life/styles.css"), true);
    assert.equal(isDigitalSpacePath("/lifestyle"), false);
    assert.equal(isDigitalSpacePath("/spaceship"), false);
    assert.equal(isDigitalSpacePath("/"), false);
    assert.equal(isDigitalSpacePath("/news"), false);
    assert.equal(isDigitalSpacePath("/digipedia"), false);
    assert.equal(isDigitalSpacePath("/admin"), false);
    assert.equal(shouldRedirectLifeToSpace("/life"), true);
    assert.equal(shouldRedirectLifeToSpace("/life/"), true);
    assert.equal(shouldRedirectLifeToSpace("/life/styles.css"), false);
    assert.equal(shouldRedirectLifeToSpace("/space"), false);
  });

  test("Digiconomy edge surface classification keeps CURRENT root = APP", () => {
    assert.equal(digiconomyEdgeSurfaceFromPath("/"), "app");
    assert.equal(digiconomyEdgeSurfaceFromPath("/space"), "digital_space");
    assert.equal(digiconomyEdgeSurfaceFromPath("/life"), "digital_space");
    assert.equal(digiconomyEdgeSurfaceFromPath("/news"), "news");
    assert.equal(digiconomyEdgeSurfaceFromPath("/digipedia"), "digipedia");
    assert.equal(digiconomyEdgeSurfaceFromPath("/admin"), "admin");
    assert.equal(digiconomyEdgeSurfaceFromPath("/app"), "app");
    assert.equal(digiconomyEdgeSurfaceFromPath("/lifestyle"), null);
    assert.equal(digiconomyEdgeSurfaceFromPath("/newsletter"), null);
    assert.equal(digiconomyEdgeSurfaceFromPath("/administrator"), null);
  });

  test("host identifies tenant; /space wins before mybrandOS catch-all", () => {
    const host = "mrfundzman.getlifeos.app";
    assert.equal(tenantLabelFromHost(host), "mrfundzman");
    assert.equal(selectBrandSurface({ host, pathname: "/space", tenantOsId: "mybrandos" }), "digital-space");
    assert.equal(selectBrandSurface({ host, pathname: "/life", tenantOsId: "mybrandos" }), "digital-space");
    assert.equal(selectBrandSurface({ host, pathname: "/", tenantOsId: "mybrandos" }), "mybrandos");
    assert.equal(selectBrandSurface({ host, pathname: "/admin", tenantOsId: "mybrandos" }), "mybrandos");
    assert.equal(selectBrandSurface({ host, pathname: "/news", tenantOsId: "mybrandos" }), "mybrandos");
    assert.equal(selectBrandSurface({ host, pathname: "/digipedia", tenantOsId: "mybrandos" }), "mybrandos");
    assert.equal(selectBrandSurface({ host, pathname: "/lifestyle", tenantOsId: "mybrandos" }), "mybrandos");
  });

  test("ecommerceos /space still goes to Digital Space, not the storefront catch-all", () => {
    const host = "mpa-6ppyad.getlifeos.app";
    assert.equal(selectBrandSurface({ host, pathname: "/space", tenantOsId: "ecommerceos" }), "digital-space");
    assert.equal(selectBrandSurface({ host, pathname: "/", tenantOsId: "ecommerceos" }), "ecommerceos");
  });

  test("unknown tenant /space still selects Digital Space for a truthful 404", () => {
    assert.equal(
      selectBrandSurface({ host: "unknownslug.getlifeos.app", pathname: "/space", tenantOsId: null }),
      "digital-space",
    );
    assert.equal(
      selectBrandSurface({ host: "unknownslug.getlifeos.app", pathname: "/", tenantOsId: null }),
      "passthrough",
    );
  });

  test("second tenant host does not resolve as mrfundzman", () => {
    assert.equal(tenantLabelFromHost("kingbooker.getlifeos.app"), "kingbooker");
    assert.notEqual(tenantLabelFromHost("kingbooker.getlifeos.app"), "mrfundzman");
    assert.equal(tenantLabelFromHost("admin.getlifeos.app"), null);
  });

  test("document /space is internally /u/{slug}; assets stay under /space/", () => {
    assert.equal(digitalSpaceUpstreamPath("/space", "mrfundzman"), "/u/mrfundzman");
    assert.equal(digitalSpaceUpstreamPath("/space/", "kingbooker"), "/u/kingbooker");
    assert.equal(digitalSpaceUpstreamPath("/space/styles.css", "mrfundzman"), "/space/styles.css");
    assert.equal(digitalSpaceUpstreamPath("/life", "mrfundzman"), "/u/mrfundzman");
    assert.equal(digitalSpaceUpstreamPath("/life/favicon.svg", "mrfundzman"), "/life/favicon.svg");
    assert.notEqual(digitalSpaceUpstreamPath("/space", "kingbooker"), "/u/mrfundzman");
  });

  test("rewrites Railway Location onto the brand host /space", () => {
    const loc = rewriteDigitalSpaceLocation(
      "https://digital-life-production.up.railway.app/life",
      "mrfundzman.getlifeos.app",
      "https://digital-life-production.up.railway.app",
    );
    assert.equal(loc, "https://mrfundzman.getlifeos.app/space");
  });
});
