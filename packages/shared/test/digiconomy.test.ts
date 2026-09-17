import { describe, expect, test } from "vitest";
import {
  assertAllInstallableEntriesClassified,
  digiconomyBucketFor,
  digiconomyIdentityFields,
  deriveDigiconomyApplicationProjection,
  listInstallableDigiconomyEntries,
  mybrandUserAdminUrl,
  mybrandUserAppUrl,
} from "../src/index.js";

describe("Digiconomy taxonomy (Phase 1)", () => {
  test("every installable catalog entry has exactly one bucket", () => {
    const counts = assertAllInstallableEntriesClassified();
    expect(counts.total).toBeGreaterThan(0);
    expect(counts.industry + counts.crossIndustry + counts.ecommerceEcosystem).toBe(counts.total);

    for (const entry of listInstallableDigiconomyEntries()) {
      expect(["industry", "cross_industry", "ecommerce_ecosystem"]).toContain(entry.bucket);
    }
  });

  test("industry domain engines map correctly", () => {
    expect(digiconomyBucketFor({ engine: "hospitalityos", verticalId: "hotel" })).toBe("industry");
    expect(digiconomyBucketFor({ engine: "hospitalityos", verticalId: "local_food" })).toBe("industry");
    expect(digiconomyBucketFor({ engine: "transportationos", verticalId: "logistics" })).toBe("industry");
    expect(digiconomyBucketFor({ engine: "serviceos", verticalId: "beauty" })).toBe("industry");
    expect(digiconomyBucketFor({ engine: "serviceos", verticalId: "pleasure" })).toBe("industry");
  });

  test("mybrandOS/creator is cross_industry", () => {
    expect(digiconomyBucketFor({ engine: "mybrandos", verticalId: "creator" })).toBe("cross_industry");
    const personal = listInstallableDigiconomyEntries().find(
      (entry) => entry.engine === "mybrandos" && entry.verticalId === "creator",
    );
    expect(personal?.bucket).toBe("cross_industry");
    expect(personal?.lane).toBe("personal");
  });

  test("EcommerceOS catalog family maps to ecommerce_ecosystem", () => {
    expect(digiconomyBucketFor({ engine: "ecommerceos", verticalId: "retail" })).toBe(
      "ecommerce_ecosystem",
    );
    expect(digiconomyBucketFor({ engine: "ecommerceos", verticalId: "delivery" })).toBe(
      "ecommerce_ecosystem",
    );
  });

  test("unclassified engines fail closed", () => {
    expect(() => digiconomyBucketFor({ engine: "unknownos", verticalId: "x" })).toThrow(/UNCLASSIFIED/);
  });

  test("derived Digiconomy identity uses stable install id and canonical URLs", () => {
    const projection = deriveDigiconomyApplicationProjection({
      id: "ins_stable_example",
      osId: "mybrandos",
      appId: "mybrandos",
      verticalId: "creator",
      subdomain: "mrfundzman",
    });
    expect(projection.digiconomyApplicationId).toBe("ins_stable_example");
    expect(projection.bucket).toBe("cross_industry");
    expect(projection.engine).toBe("mybrandos");
    expect(projection.publicUrl).toBe(mybrandUserAppUrl("mrfundzman"));
    expect(projection.adminUrl).toBe(mybrandUserAdminUrl("mrfundzman"));
    expect(projection.publicUrl).not.toContain("/admin");
    expect(projection.adminUrl).toContain("/admin");
    expect(projection.publicUrl).toContain("getlifeos.app");
  });

  test("digiconomyIdentityFields is deterministic and shared by projections", () => {
    const a = digiconomyIdentityFields({
      id: "ins_1",
      osId: "ecommerceos",
      verticalId: "delivery",
    });
    const b = digiconomyIdentityFields({
      id: "ins_1",
      osId: "ecommerceos",
      verticalId: "delivery",
    });
    expect(a).toEqual(b);
    expect(a.digiconomyApplicationId).toBe("ins_1");
    expect(a.bucket).toBe("ecommerce_ecosystem");
    expect(a.engine).toBe("ecommerceos");
  });

  test("industry install projection keeps public ≠ admin", () => {
    const projection = deriveDigiconomyApplicationProjection({
      id: "ins_hotel_1",
      osId: "hospitalityos",
      verticalId: "hotel",
      subdomain: "splashhotels",
    });
    expect(projection.bucket).toBe("industry");
    expect(projection.publicUrl).toBe("https://splashhotels.getlifeos.app/");
    expect(projection.adminUrl).toBe("https://splashhotels.getlifeos.app/admin");
  });
});
