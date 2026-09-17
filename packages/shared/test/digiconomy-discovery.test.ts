import { describe, expect, test } from "vitest";
import {
  deriveEcommerceParticipation,
  filterByEcommerceDiscovery,
  matchesEcommerceDiscovery,
  parseEcommerceDiscoveryQuery,
  toDigiconomyDiscoverableParticipant,
} from "../src/index.js";

describe("Digiconomy ecommerce discovery (Phase 4)", () => {
  const dabris = {
    id: "ins_dabris",
    digiconomyApplicationId: "ins_dabris",
    name: "Dabris Kitchen",
    engine: "hospitalityos",
    verticalId: "local_food",
    bucket: "industry" as const,
    productionUrl: "https://dabkitchen.getlifeos.app",
    ecommerceParticipation: deriveEcommerceParticipation({
      osId: "hospitalityos",
      verticalId: "local_food",
      enabledModules: ["local_food", "billing", "crm"],
    }),
  };

  const restaurant = {
    id: "ins_resto",
    digiconomyApplicationId: "ins_resto",
    name: "Restaurant & Dining",
    engine: "hospitalityos",
    verticalId: "restaurant",
    bucket: "industry" as const,
    productionUrl: "https://restaurant-dining.getlifeos.app",
    ecommerceParticipation: deriveEcommerceParticipation({
      osId: "hospitalityos",
      verticalId: "restaurant",
      enabledModules: ["dining", "billing", "crm"],
    }),
  };

  const fundz = {
    id: "ins_fundz",
    digiconomyApplicationId: "ins_fundz",
    name: "Mr FundzMan",
    engine: "mybrandos",
    verticalId: "creator",
    bucket: "cross_industry" as const,
    productionUrl: "https://mrfundzman.getlifeos.app",
    ecommerceParticipation: deriveEcommerceParticipation({
      osId: "mybrandos",
      verticalId: "creator",
    }),
  };

  const hotel = {
    id: "ins_hotel",
    digiconomyApplicationId: "ins_hotel",
    name: "splashhotels",
    engine: "hospitalityos",
    verticalId: "hotel",
    bucket: "industry" as const,
    productionUrl: "https://splashhotels.getlifeos.app",
    ecommerceParticipation: deriveEcommerceParticipation({
      osId: "hospitalityos",
      verticalId: "hotel",
      enabledModules: ["accommodation", "billing", "crm"],
    }),
  };

  const retail = {
    id: "ins_retail",
    digiconomyApplicationId: "ins_retail",
    name: "City Retail",
    engine: "ecommerceos",
    verticalId: "retail",
    bucket: "ecommerce_ecosystem" as const,
    productionUrl: "https://cityretail.getlifeos.app",
    ecommerceParticipation: deriveEcommerceParticipation({
      osId: "ecommerceos",
      verticalId: "retail",
      modulesEnabled: [
        "catalog",
        "inventory",
        "storefront",
        "cart",
        "orders",
        "checkout",
        "billing",
        "logistics_bridge",
      ],
    }),
  };

  const all = [dabris, restaurant, fundz, hotel, retail];

  test("active ecommerce discovery includes Dabris and excludes none/eligible-as-active", () => {
    const active = filterByEcommerceDiscovery(all, {
      ecosystem: "ecommerce",
      status: "active",
    });
    expect(active.map((a) => a.name).sort()).toEqual([
      "City Retail",
      "Dabris Kitchen",
      "Restaurant & Dining",
    ].sort());
    expect(active.every((a) => a.ecommerceParticipation.status === "active")).toBe(true);
  });

  test("catalog capability excludes eligible creators and non-commerce hotels", () => {
    const catalog = filterByEcommerceDiscovery(all, { capability: "catalog" });
    expect(catalog.map((a) => a.name).sort()).toEqual([
      "City Retail",
      "Dabris Kitchen",
      "Restaurant & Dining",
    ].sort());
    expect(catalog.some((a) => a.name === "Mr FundzMan")).toBe(false);
    expect(catalog.some((a) => a.name === "splashhotels")).toBe(false);
  });

  test("ordering and logistics capability discovery", () => {
    const ordering = filterByEcommerceDiscovery(all, { capability: "ordering" });
    expect(ordering.some((a) => a.name === "Dabris Kitchen")).toBe(true);
    expect(ordering.some((a) => a.name === "Restaurant & Dining")).toBe(true);

    const logistics = filterByEcommerceDiscovery(all, { capability: "logistics" });
    expect(logistics.map((a) => a.name).sort()).toEqual(["City Retail", "Dabris Kitchen"].sort());
  });

  test("eligible creator is not an active catalog participant", () => {
    expect(fundz.ecommerceParticipation.status).toBe("eligible");
    expect(fundz.ecommerceParticipation.capabilities).toEqual([]);
    expect(
      matchesEcommerceDiscovery(fundz.ecommerceParticipation, { capability: "catalog" }),
    ).toBe(false);
    expect(
      matchesEcommerceDiscovery(fundz.ecommerceParticipation, {
        ecosystem: "ecommerce",
        status: "eligible",
      }),
    ).toBe(true);
  });

  test("status=none hotels excluded from ecosystem discovery", () => {
    expect(hotel.ecommerceParticipation.status).toBe("none");
    const eco = filterByEcommerceDiscovery(all, { ecosystem: "ecommerce" });
    expect(eco.some((a) => a.id === hotel.id)).toBe(false);
  });

  test("discoverable participant preserves one identity and public surface", () => {
    const participant = toDigiconomyDiscoverableParticipant(dabris);
    expect(participant.applicationId).toBe(dabris.id);
    expect(participant.digiconomyApplicationId).toBe(dabris.id);
    expect(participant.publicSurface).toBe("https://dabkitchen.getlifeos.app/");
    expect(participant.publicSurface).not.toContain("/admin");
    expect(participant.ecommerce.domainModel).toBe("menu_order");
  });

  test("parseEcommerceDiscoveryQuery validates inputs", () => {
    expect(parseEcommerceDiscoveryQuery({ ecosystem: "ecommerce", capability: "catalog" })).toEqual({
      ok: true,
      query: { ecosystem: "ecommerce", capability: "catalog" },
    });
    expect(parseEcommerceDiscoveryQuery({ capability: "warp" }).ok).toBe(false);
    expect(parseEcommerceDiscoveryQuery({}).ok).toBe(true);
  });

  test("unfiltered discovery returns full list", () => {
    expect(filterByEcommerceDiscovery(all, {}).length).toBe(all.length);
  });
});
