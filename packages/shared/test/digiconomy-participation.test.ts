import { describe, expect, test } from "vitest";
import {
  deriveEcommerceParticipation,
  digiconomyBucketFor,
  ecommerceCapabilityIdsForDirectory,
  expandEcommerceModules,
} from "../src/index.js";

describe("Digiconomy ecommerce participation (Phase 3)", () => {
  test("Dabris Kitchen pattern: hospitality local_food participates without becoming ecommerceos", () => {
    const participation = deriveEcommerceParticipation({
      osId: "hospitalityos",
      verticalId: "local_food",
      enabledModules: ["local_food", "billing", "crm"],
      modulesEnabled: ["restaurant", "billing", "customer_management"],
    });
    expect(participation.ecosystem).toBe("ecommerce");
    expect(participation.status).toBe("active");
    expect(participation.domainModel).toBe("menu_order");
    expect(participation.capabilities).toEqual(["catalog", "ordering", "logistics"]);
    expect(digiconomyBucketFor({ engine: "hospitalityos", verticalId: "local_food" })).toBe(
      "industry",
    );
  });

  test("mybrandOS remains eligible without reclassification or fabricated capabilities", () => {
    const participation = deriveEcommerceParticipation({
      osId: "mybrandos",
      verticalId: "creator",
      enabledModules: ["studio", "public_brand"],
    });
    expect(participation.status).toBe("eligible");
    expect(participation.domainModel).toBe("creator_offers");
    expect(participation.capabilities).toEqual([]);
    expect(ecommerceCapabilityIdsForDirectory(participation)).toEqual([]);
    expect(digiconomyBucketFor({ engine: "mybrandos", verticalId: "creator" })).toBe(
      "cross_industry",
    );
  });

  test("EcommerceOS retail participates natively with retail_commerce domain model", () => {
    const modules = expandEcommerceModules(["catalog", "pos", "checkout", "logisticsBridge"]);
    const participation = deriveEcommerceParticipation({
      osId: "ecommerceos",
      verticalId: "retail",
      modulesEnabled: modules,
    });
    expect(participation.status).toBe("active");
    expect(participation.domainModel).toBe("retail_commerce");
    expect(participation.capabilities).toEqual([
      "catalog",
      "ordering",
      "checkout",
      "payment",
      "logistics",
    ]);
    expect(digiconomyBucketFor({ engine: "ecommerceos", verticalId: "retail" })).toBe(
      "ecommerce_ecosystem",
    );
  });

  test("Shopping Centre participation is catalog-only and stays EcommerceOS", () => {
    const modules = expandEcommerceModules(["directory", "units", "hours", "events", "offers"]);
    const participation = deriveEcommerceParticipation({
      osId: "ecommerceos",
      verticalId: "shopping_centre",
      modulesEnabled: modules,
    });
    expect(participation.status).toBe("active");
    expect(participation.capabilities).toEqual(["catalog"]);
    expect(digiconomyBucketFor({ engine: "ecommerceos", verticalId: "shopping_centre" })).toBe(
      "ecommerce_ecosystem",
    );
  });

  test("pure accommodation hotel does not invent ecommerce participation", () => {
    const participation = deriveEcommerceParticipation({
      osId: "hospitalityos",
      verticalId: "hotel",
      enabledModules: ["accommodation", "billing", "crm"],
      modulesEnabled: ["accommodation", "reservations", "billing", "customer_management"],
    });
    expect(participation.status).toBe("none");
    expect(participation.capabilities).toEqual([]);
  });

  test("hotel with dining module participates via menu_order without bucket change", () => {
    const participation = deriveEcommerceParticipation({
      osId: "hospitalityos",
      verticalId: "hotel",
      enabledModules: ["accommodation", "dining", "billing", "crm"],
    });
    expect(participation.status).toBe("active");
    expect(participation.domainModel).toBe("menu_order");
    expect(participation.capabilities).toContain("catalog");
    expect(participation.capabilities).toContain("ordering");
    expect(digiconomyBucketFor({ engine: "hospitalityos", verticalId: "hotel" })).toBe("industry");
  });

  test("bucket is never rewritten by participation derivation", () => {
    for (const sample of [
      { osId: "hospitalityos", verticalId: "restaurant" },
      { osId: "serviceos", verticalId: "beauty" },
      { osId: "ecommerceos", verticalId: "delivery" },
      { osId: "mybrandos", verticalId: "creator" },
    ]) {
      deriveEcommerceParticipation(sample);
      // Taxonomy authority remains digiconomyBucketFor — participation must not alter it.
      expect(typeof digiconomyBucketFor(sample)).toBe("string");
    }
  });
});
