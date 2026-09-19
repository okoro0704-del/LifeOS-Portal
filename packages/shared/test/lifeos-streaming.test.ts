import { describe, expect, test } from "vitest";
import {
  assembleLifeOsStream,
  assertNoLifeOsOwnershipCopy,
  engineHasLifeOsCapability,
  isPubliclyEligibleLifeOsItem,
  listInstallableDigiconomyEntries,
  listLifeOsReadyEngines,
  listLifeOsStreamingEligibility,
  projectEcommercePublicPublication,
  projectEcommerceStorefrontProduct,
  projectMybrandPublicAssets,
} from "../src/index.js";

describe("LifeOS streaming eligibility (Portal catalog)", () => {
  test("derives from Digiconomy catalog without a second registry", () => {
    const catalog = listInstallableDigiconomyEntries().filter((e) => e.available);
    const eligibility = listLifeOsStreamingEligibility();
    expect(eligibility.length).toBe(catalog.length);
    expect(eligibility.every((row) => catalog.some((c) => c.catalogKey === row.catalogKey))).toBe(
      true,
    );
  });

  test("mybrandOS is READY with publication capability", () => {
    expect(listLifeOsReadyEngines()).toContain("mybrandos");
    expect(engineHasLifeOsCapability("mybrandos", "lifeos_publication_projection")).toBe(true);
  });

  test("EcommerceOS is READY with public LifeOS feed contract", () => {
    const eco = listLifeOsStreamingEligibility().filter((r) => r.engine === "ecommerceos");
    expect(eco.length).toBeGreaterThan(0);
    expect(eco.every((r) => r.readiness === "ready")).toBe(true);
    expect(engineHasLifeOsCapability("ecommerceos", "lifeos_catalogue_projection")).toBe(true);
    expect(listLifeOsReadyEngines()).toContain("ecommerceos");
  });

  test("unknown / finance engines are not invented as ready", () => {
    expect(listLifeOsReadyEngines()).not.toContain("financeos");
    expect(engineHasLifeOsCapability("financeos", "lifeos_publication_projection")).toBe(false);
  });

  test("HospitalityOS / ServiceOS / TransportationOS are not falsely READY", () => {
    const rows = listLifeOsStreamingEligibility();
    expect(rows.filter((r) => r.engine === "hospitalityos").every((r) => r.readiness === "partial")).toBe(
      true,
    );
    expect(rows.filter((r) => r.engine === "serviceos").every((r) => r.readiness === "partial")).toBe(
      true,
    );
    expect(
      rows.filter((r) => r.engine === "transportationos").every((r) => r.readiness === "not_ready"),
    ).toBe(true);
  });
});

describe("eligibility filters", () => {
  test("excludes drafts, private, processing, broken, suspended", () => {
    expect(isPubliclyEligibleLifeOsItem({ draft: true })).toBe(false);
    expect(isPubliclyEligibleLifeOsItem({ audience: "private" })).toBe(false);
    expect(isPubliclyEligibleLifeOsItem({ mediaStatus: "broken" })).toBe(false);
    expect(isPubliclyEligibleLifeOsItem({ mediaStatus: "processing" })).toBe(false);
    expect(isPubliclyEligibleLifeOsItem({ suspended: true })).toBe(false);
    expect(isPubliclyEligibleLifeOsItem({ status: "published", audience: "public" })).toBe(true);
  });
});

describe("mybrandOS adapter", () => {
  test("projects PHOTO/DESIGN by reference without LifeOS ownership", () => {
    const items = projectMybrandPublicAssets({
      slug: "mrfundzman",
      displayName: "Mr Fundzman",
      origin: "https://mrfundzman.getlifeos.app",
      assets: [
        {
          id: "cmu571eci0000ns01gn5azkrq",
          title: "IMG 2034",
          description: "The man who introduced Two Twins to themselves",
          assetType: "DESIGN",
          publishedAt: "2026-09-17T07:13:53.635Z",
          coverAvailable: true,
          mediaAvailable: false,
          presentationTypes: ["POST"],
        },
      ],
    });
    expect(items).toHaveLength(1);
    const item = items[0]!;
    expect(item.engine).toBe("mybrandos");
    expect(item.canonicalItemId).toBe("cmu571eci0000ns01gn5azkrq");
    expect(item.tenant.slug).toBe("mrfundzman");
    expect(item.assetReferences[0]!.href).toBe(
      "https://mrfundzman.getlifeos.app/api/public/mrfundzman/assets/cmu571eci0000ns01gn5azkrq/cover",
    );
    expect(item.provenance.sourceApplicationId).toBe("mybrandos");
    assertNoLifeOsOwnershipCopy(item);
  });
});

describe("EcommerceOS adapter", () => {
  test("projects product catalogue with exact deep link and no LifeOS copy", () => {
    const item = projectEcommerceStorefrontProduct({
      slug: "demo-store",
      displayName: "Demo Store",
      product: {
        id: "prod_1",
        title: "Radio",
        description: "Vintage radio",
        status: "active",
        price: "19.99",
        currency: "USD",
        images: ["https://cdn.example.com/radio.jpg"],
        createdAt: "2026-09-01T00:00:00.000Z",
      },
    });
    expect(item).not.toBeNull();
    expect(item!.itemType).toBe("PRODUCT");
    expect(item!.family).toBe("catalogue");
    expect(item!.canonicalSourceUrl).toBe("https://demo-store.getlifeos.app/product/prod_1");
    expect(item!.assetReferences[0]!.href).toBe("https://cdn.example.com/radio.jpg");
    assertNoLifeOsOwnershipCopy(item!);
  });

  test("excludes suspended products", () => {
    expect(
      projectEcommerceStorefrontProduct({
        slug: "demo-store",
        product: { id: "x", title: "X", status: "suspended" },
      }),
    ).toBeNull();
  });

  test("projects storefront publications with provenance", () => {
    const item = projectEcommercePublicPublication({
      slug: "demo-store",
      publication: {
        publicationId: "ecommerceos:product:prod_1",
        publisherEntityId: "demo-store",
        publishedAt: "2026-09-01T00:00:00.000Z",
        status: "published",
        audience: "public",
        title: "Radio",
        summary: "Vintage",
        contentReference: { ownerVertical: "ecommerceos", kind: "product", nativeId: "prod_1" },
        mediaReferences: [{ href: "https://cdn.example.com/radio.jpg", kind: "image", alt: "Radio" }],
        canonicalUrl: "https://demo-store.getlifeos.app/product/prod_1",
      },
    });
    expect(item!.canonicalItemId).toBe("prod_1");
    expect(item!.canonicalSourceUrl).toContain("/product/prod_1");
  });
});

describe("assembly + failure distinction", () => {
  test("deterministic newest-first assembly without fake trending", () => {
    const a = projectMybrandPublicAssets({
      slug: "a",
      origin: "https://a.getlifeos.app",
      assets: [
        {
          id: "1",
          title: "Old",
          assetType: "PHOTO",
          publishedAt: "2026-01-01T00:00:00.000Z",
          coverAvailable: true,
          presentationTypes: ["PHOTO"],
        },
      ],
    });
    const b = projectMybrandPublicAssets({
      slug: "b",
      origin: "https://b.getlifeos.app",
      assets: [
        {
          id: "2",
          title: "New",
          assetType: "PHOTO",
          publishedAt: "2026-09-01T00:00:00.000Z",
          coverAvailable: true,
          presentationTypes: ["PHOTO"],
        },
      ],
    });
    const stream = assembleLifeOsStream([a, b], { limit: 10 });
    expect(stream[0]!.title).toBe("New");
    expect(stream[1]!.title).toBe("Old");
  });

  test("round-robin interleave is deterministic", () => {
    const pages = [
      projectMybrandPublicAssets({
        slug: "a",
        origin: "https://a.getlifeos.app",
        assets: [
          {
            id: "a1",
            title: "A1",
            assetType: "PHOTO",
            publishedAt: "2026-09-02T00:00:00.000Z",
            coverAvailable: false,
            presentationTypes: ["POST"],
          },
          {
            id: "a2",
            title: "A2",
            assetType: "PHOTO",
            publishedAt: "2026-09-01T00:00:00.000Z",
            coverAvailable: false,
            presentationTypes: ["POST"],
          },
        ],
      }),
      projectMybrandPublicAssets({
        slug: "b",
        origin: "https://b.getlifeos.app",
        assets: [
          {
            id: "b1",
            title: "B1",
            assetType: "PHOTO",
            publishedAt: "2026-09-03T00:00:00.000Z",
            coverAvailable: false,
            presentationTypes: ["POST"],
          },
        ],
      }),
    ];
    const stream = assembleLifeOsStream(pages, { interleaveSources: true, limit: 3 });
    expect(stream.map((s) => s.title)).toEqual(["A1", "B1", "A2"]);
  });
});

describe("no duplication invariants", () => {
  test("does not introduce LifeOSProducts / second registry keys in eligibility", () => {
    const keys = listLifeOsStreamingEligibility().map((r) => r.catalogKey).sort();
    const catalogKeys = listInstallableDigiconomyEntries()
      .filter((e) => e.available)
      .map((e) => e.catalogKey)
      .sort();
    expect(keys).toEqual(catalogKeys);
  });
});
