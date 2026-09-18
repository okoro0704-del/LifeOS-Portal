import { describe, expect, test } from "vitest";
import {
  assertAllInstallableEntriesHaveIndustryGroup,
  digiconomyBucketFor,
  ecommerceCommercialMonthlyPriceMinor,
  getEcommerceCommercialProduct,
  listEcommerceCommercialProducts,
  listInstallableDigiconomyEntries,
  listPortalIndustryGroups,
  portalIndustryGroupForEntry,
} from "../src/index.js";

describe("Portal industry navigation", () => {
  test("every installable entry belongs to exactly one industry group", () => {
    const result = assertAllInstallableEntriesHaveIndustryGroup();
    expect(result.orphans).toEqual([]);
    expect(result.total).toBeGreaterThan(0);
    expect(listPortalIndustryGroups()).toHaveLength(5);

    const seen = new Map<string, string>();
    for (const entry of listInstallableDigiconomyEntries().filter((e) => e.available)) {
      const group = portalIndustryGroupForEntry(entry)!;
      const key = `${entry.engine}/${entry.verticalId}`;
      expect(seen.has(key)).toBe(false);
      seen.set(key, group);
      // Industry navigation must not mutate Digiconomy bucket.
      expect(entry.bucket).toBe(
        digiconomyBucketFor({ engine: entry.engine, verticalId: entry.verticalId }),
      );
    }
  });
});

describe("EcommerceOS commercial catalog", () => {
  test("exact approved prices and allowances", () => {
    const matrix: Array<[string, number, number, number, number]> = [
      ["online_store", 2900, 900, 10, 100],
      ["physical_store", 4900, 1500, 20, 150],
      ["wholesaler", 7900, 1900, 30, 250],
      ["supermarket", 9900, 2900, 50, 500],
      ["shopping_centre", 14900, 3900, 100, 750],
      ["shopping_mall", 29900, 6900, 250, 1500],
      ["marketplace_operator", 29900, 7900, 250, 2000],
    ];
    for (const [id, once, monthly, gb, ai] of matrix) {
      const product = getEcommerceCommercialProduct(id)!;
      expect(product.software.oneTimePriceMinor).toBe(once);
      expect(product.services.monthlyPriceMinor).toBe(monthly);
      expect(product.services.dataZoneGb).toBe(gb);
      expect(product.services.digiAiCreditsMonthly).toBe(ai);
    }
  });

  test("marketplace is operator product, not ordinary seller vertical purchase card list", () => {
    const operator = getEcommerceCommercialProduct("marketplace_operator")!;
    expect(operator.productType).toBe("operator");
    expect(operator.application.verticalId).toBe("marketplace");
    const ordinary = listEcommerceCommercialProducts().filter((p) => p.productType === "vertical");
    expect(ordinary.some((p) => p.application.verticalId === "marketplace")).toBe(false);
  });

  test("catalog monthly priceMinor aligns with commercial services monthly", () => {
    for (const product of listEcommerceCommercialProducts()) {
      expect(ecommerceCommercialMonthlyPriceMinor(product.application.verticalId)).toBe(
        product.services.monthlyPriceMinor,
      );
    }
  });

  test("does not invent usage / commission / per-store charges", () => {
    for (const product of listEcommerceCommercialProducts()) {
      expect("usage" in product).toBe(false);
      expect(product.software.oneTimePriceMinor).toBeGreaterThan(0);
    }
    const op = getEcommerceCommercialProduct("marketplace_operator")!;
    expect(op.software.capabilities.some((c) => c.id === "no_per_store_charge")).toBe(true);
  });
});
