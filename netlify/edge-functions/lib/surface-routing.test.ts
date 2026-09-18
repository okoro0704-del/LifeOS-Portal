import assert from "node:assert/strict";
import { describe, test } from "node:test";
import {
  isDigitalLifePath,
  rewriteDigitalLifeLocation,
  selectBrandSurface,
  tenantLabelFromHost,
} from "./surface-routing.ts";

describe("Digital Life edge surface routing", () => {
  test("/life is Digital Life and /lifestyle is not", () => {
    assert.equal(isDigitalLifePath("/life"), true);
    assert.equal(isDigitalLifePath("/life/"), true);
    assert.equal(isDigitalLifePath("/life/styles.css"), true);
    assert.equal(isDigitalLifePath("/life/favicon.svg"), true);
    assert.equal(isDigitalLifePath("/lifestyle"), false);
    assert.equal(isDigitalLifePath("/lifelong"), false);
    assert.equal(isDigitalLifePath("/lifeinsurance"), false);
    assert.equal(isDigitalLifePath("/"), false);
    assert.equal(isDigitalLifePath("/news"), false);
    assert.equal(isDigitalLifePath("/digipedia"), false);
    assert.equal(isDigitalLifePath("/admin"), false);
  });

  test("host identifies tenant; /life wins before mybrandOS catch-all", () => {
    const host = "mrfundzman.getlifeos.app";
    assert.equal(tenantLabelFromHost(host), "mrfundzman");
    assert.equal(selectBrandSurface({ host, pathname: "/life", tenantOsId: "mybrandos" }), "digital-life");
    assert.equal(selectBrandSurface({ host, pathname: "/", tenantOsId: "mybrandos" }), "mybrandos");
    assert.equal(selectBrandSurface({ host, pathname: "/admin", tenantOsId: "mybrandos" }), "mybrandos");
    assert.equal(selectBrandSurface({ host, pathname: "/news", tenantOsId: "mybrandos" }), "mybrandos");
    assert.equal(selectBrandSurface({ host, pathname: "/digipedia", tenantOsId: "mybrandos" }), "mybrandos");
    assert.equal(selectBrandSurface({ host, pathname: "/lifestyle", tenantOsId: "mybrandos" }), "mybrandos");
  });

  test("ecommerceos /life still goes to Digital Life, not the storefront catch-all", () => {
    const host = "mpa-6ppyad.getlifeos.app";
    assert.equal(
      selectBrandSurface({ host, pathname: "/life", tenantOsId: "ecommerceos" }),
      "digital-life",
    );
    assert.equal(selectBrandSurface({ host, pathname: "/", tenantOsId: "ecommerceos" }), "ecommerceos");
  });

  test("unknown tenant /life still selects Digital Life for a truthful 404", () => {
    assert.equal(
      selectBrandSurface({ host: "unknownslug.getlifeos.app", pathname: "/life", tenantOsId: null }),
      "digital-life",
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

  test("rewrites Railway Location onto the brand host", () => {
    const loc = rewriteDigitalLifeLocation(
      "https://digital-life-production.up.railway.app/life",
      "mrfundzman.getlifeos.app",
      "https://digital-life-production.up.railway.app",
    );
    assert.equal(loc, "https://mrfundzman.getlifeos.app/life");
  });
});
