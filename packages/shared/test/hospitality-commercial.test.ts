import { describe, expect, test } from "vitest";
import {
  HOSPITALITY_COMMERCIAL_PRODUCTS,
  getHospitalityCommercialProduct,
  hospitalityCommercialServiceCapabilities,
  hospitalityCommercialSoftwareCapabilities,
  listHospitalityCommercialProducts,
} from "../src/index.js";

describe("HospitalityOS commercial catalog", () => {
  test("exposes exactly the eight approved products", () => {
    const products = listHospitalityCommercialProducts();
    expect(products.map((p) => p.displayName)).toEqual([
      "Hotel",
      "Restaurant",
      "Lounge / Bar",
      "Service Apartment",
      "Gym / Fitness",
      "Local Food",
      "Events",
      "Resort",
    ]);
    expect(products.some((p) => p.application.verticalId === "custom")).toBe(false);
    expect(products.some((p) => /wellness|beauty/i.test(p.displayName))).toBe(false);
  });

  test("maps customer names to canonical vertical ids", () => {
    expect(getHospitalityCommercialProduct("hotel")?.application).toMatchObject({
      engine: "hospitalityos",
      verticalId: "hotel",
    });
    expect(getHospitalityCommercialProduct("lounge_bar")?.application.verticalId).toBe("bar");
    expect(getHospitalityCommercialProduct("service_apartment")?.application.verticalId).toBe(
      "shared_homes",
    );
    expect(getHospitalityCommercialProduct("gym_fitness")?.application.verticalId).toBe("gym");
  });

  test("commercial matrix prices", () => {
    const matrix: Array<[string, number, number]> = [
      ["hotel", 49900, 14900],
      ["restaurant", 29900, 9900],
      ["lounge_bar", 29900, 9900],
      ["service_apartment", 19900, 9900],
      ["gym_fitness", 9900, 4900],
      ["local_food", 9900, 3900],
      ["events", 19900, 7900],
      ["resort", 59900, 19900],
    ];
    for (const [id, once, monthly] of matrix) {
      const product = getHospitalityCommercialProduct(id)!;
      expect(product.software.oneTimePriceMinor).toBe(once);
      expect(product.services.monthlyPriceMinor).toBe(monthly);
    }
  });

  test("resource allocations are not configured", () => {
    for (const product of HOSPITALITY_COMMERCIAL_PRODUCTS) {
      expect(product.services.dataZoneQuotaLabel).toBeNull();
      expect(product.services.dataZoneQuotaBytes).toBeNull();
      expect(product.services.digiAiCreditsMonthly).toBeNull();
      expect(
        hospitalityCommercialServiceCapabilities(product).some(
          (c) => c.id === "datazone" || c.id === "digi_ai",
        ),
      ).toBe(false);
    }
  });

  test("customer software lists only available capabilities", () => {
    const hotel = getHospitalityCommercialProduct("hotel")!;
    const caps = hospitalityCommercialSoftwareCapabilities(hotel);
    expect(caps.every((c) => c.available)).toBe(true);
    expect(caps.some((c) => c.id === "rooms")).toBe(true);
    expect(caps.some((c) => /fake|invented/i.test(c.label))).toBe(false);

    const bar = getHospitalityCommercialProduct("lounge_bar")!;
    expect(hospitalityCommercialSoftwareCapabilities(bar).some((c) => c.id === "guest_ordering")).toBe(
      false,
    );
  });

  test("does not invent a usage billing layer", () => {
    for (const product of HOSPITALITY_COMMERCIAL_PRODUCTS) {
      expect("usage" in product).toBe(false);
    }
  });
});
