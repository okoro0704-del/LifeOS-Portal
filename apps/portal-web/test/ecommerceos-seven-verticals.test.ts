import { describe, expect, test } from "vitest";
import {
  ECOMMERCEOS_INSTALL_TEMPLATES,
  canonicalEcommerceVerticalId,
  customerFacingEcommerceTemplates,
  deriveEcommerceParticipation,
  expandEcommerceModules,
  getVertical,
  listInstallableDigiconomyEntries,
} from "@lifeos-portal/shared";

describe("EcommerceOS seven canonical verticals", () => {
  test("internal taxonomy keeps seven IDs; customer purchase is six applications", () => {
    const internalNames = ECOMMERCEOS_INSTALL_TEMPLATES.map((t) => t.label);
    expect(internalNames).toEqual([
      "Physical Store",
      "Online Store",
      "Supermarket",
      "Shopping Centre",
      "Wholesaler",
      "Shopping Mall",
      "Marketplace",
    ]);
    expect(new Set(ECOMMERCEOS_INSTALL_TEMPLATES.map((t) => t.verticalId)).size).toBe(7);
    expect(internalNames.some((n) => n.includes("physical address"))).toBe(false);

    const customer = customerFacingEcommerceTemplates();
    expect(customer.map((t) => t.label)).toEqual([
      "Physical Store",
      "Online Store",
      "Supermarket",
      "Shopping Centre",
      "Wholesaler",
      "Shopping Mall",
    ]);
    expect(customer.some((t) => t.verticalId === "marketplace")).toBe(false);
    expect(ECOMMERCEOS_INSTALL_TEMPLATES.find((t) => t.verticalId === "marketplace")?.customerPurchase).toBe(
      false,
    );
  });

  test("stable IDs for the two existing store models are preserved", () => {
    expect(canonicalEcommerceVerticalId("physical_store")).toBe("retail");
    expect(canonicalEcommerceVerticalId("online_store")).toBe("delivery");
    expect(getVertical("ecommerceos", "retail")?.displayName).toBe("Physical Store");
    expect(getVertical("ecommerceos", "delivery")?.displayName).toBe("Online Store");
    expect(getVertical("ecommerceos", "physical_store")?.id).toBe("retail");
    expect(getVertical("ecommerceos", "marketplace")?.id).toBe("marketplace");
    expect(getVertical("ecommerceos", "marketplace")?.customerPurchase).toBe(false);
  });

  test("shared Digiconomy catalog lists seven EcommerceOS entries under ecommerce_ecosystem", () => {
    const eco = listInstallableDigiconomyEntries().filter((e) => e.engine === "ecommerceos");
    expect(eco).toHaveLength(7);
    expect(eco.every((e) => e.bucket === "ecommerce_ecosystem")).toBe(true);
  });

  test("shopping centre does not declare checkout or payment", () => {
    const modules = expandEcommerceModules(
      ECOMMERCEOS_INSTALL_TEMPLATES.find((t) => t.verticalId === "shopping_centre")!.modules,
    );
    const participation = deriveEcommerceParticipation({
      osId: "ecommerceos",
      verticalId: "shopping_centre",
      modulesEnabled: modules,
    });
    expect(participation.capabilities).toEqual(["catalog"]);
    expect(participation.capabilities).not.toContain("payment");
    expect(participation.capabilities).not.toContain("logistics");
  });

  test("marketplace ordering does not fabricate payment", () => {
    const modules = expandEcommerceModules(
      ECOMMERCEOS_INSTALL_TEMPLATES.find((t) => t.verticalId === "marketplace")!.modules,
    );
    const participation = deriveEcommerceParticipation({
      osId: "ecommerceos",
      verticalId: "marketplace",
      modulesEnabled: modules,
    });
    expect(participation.capabilities).toContain("catalog");
    expect(participation.capabilities).toContain("ordering");
    expect(participation.capabilities).not.toContain("payment");
    expect(participation.domainModel).toBe("retail_commerce");
  });
});
