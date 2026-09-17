import { describe, expect, test } from "vitest";
import {
  MYBRANDOS_PACKS,
  MYBRANDOS_PACKS_TAGLINE,
  formatMyBrandOsPackPrice,
  getMyBrandOsPack,
  listMyBrandOsPacks,
} from "../src/index.js";

describe("mybrandOS commercial packs", () => {
  test("defines exactly four packs with the commercial matrix", () => {
    const packs = listMyBrandOsPacks();
    expect(packs.map((p) => p.id)).toEqual(["audience", "creator", "creator_plus", "creator_pro"]);

    expect(packs[0]!.software.oneTimePriceMinor).toBe(4900);
    expect(packs[0]!.services.monthlyPriceMinor).toBe(900);
    expect(packs[0]!.software.monetization.kind).toBe("none");
    expect(packs[0]!.services.dataZoneQuotaLabel).toBe("10 GB");
    expect(packs[0]!.services.digiAiCreditsMonthly).toBe(100);

    expect(packs[1]!.software.oneTimePriceMinor).toBe(19900);
    expect(packs[1]!.services.monthlyPriceMinor).toBe(3900);
    expect(packs[1]!.software.monetization).toMatchObject({ kind: "count", count: 1 });
    expect(packs[1]!.services.digiAiCreditsMonthly).toBe(500);

    expect(packs[2]!.software.oneTimePriceMinor).toBe(49900);
    expect(packs[2]!.services.monthlyPriceMinor).toBe(7900);
    expect(packs[2]!.software.monetization).toMatchObject({ kind: "count", count: 3 });
    expect(packs[2]!.services.digiAiCreditsMonthly).toBe(1500);

    expect(packs[3]!.software.oneTimePriceMinor).toBe(99900);
    expect(packs[3]!.services.monthlyPriceMinor).toBe(14900);
    expect(packs[3]!.software.monetization.kind).toBe("all_eligible");
    expect(packs[3]!.services.dataZoneQuotaLabel).toBe("2 TB");
    expect(packs[3]!.services.digiAiCreditsMonthly).toBe(5000);
  });

  test("Audience can build/create/publish and does not monetize", () => {
    const audience = getMyBrandOsPack("audience")!;
    const labels = audience.software.capabilities.map((c) => c.label.toLowerCase());
    expect(labels.some((l) => l.includes("create"))).toBe(true);
    expect(labels.some((l) => l.includes("publish"))).toBe(true);
    expect(audience.software.monetization.kind).toBe("none");
  });

  test("planned services are explicitly marked unavailable", () => {
    for (const pack of MYBRANDOS_PACKS) {
      const digi = pack.services.includedServices.find((s) => s.id === "digi_ai");
      const datazone = pack.services.includedServices.find((s) => s.id === "datazone");
      expect(digi?.available).toBe(false);
      expect(datazone?.available).toBe(false);
      expect(pack.services.includedServices.some((s) => s.id === "managed_hosting" && s.available)).toBe(
        true,
      );
    }
  });

  test("price formatter and tagline", () => {
    expect(formatMyBrandOsPackPrice(49900)).toBe("$499");
    expect(MYBRANDOS_PACKS_TAGLINE.toLowerCase()).toContain("own your mybrandos");
  });
});
