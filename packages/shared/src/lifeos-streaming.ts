/**
 * LifeOS cross-vertical streaming contracts (Portal-owned shared layer).
 *
 * LifeOS DISCOVERS / PRESENTS. Source verticals OWN content.
 * No universal product DB. No second application registry.
 * No media copy. Adapters READ public shapes → CanonicalLifeOsProjection.
 *
 * Eligibility is DERIVED from Portal Digiconomy catalog + known public
 * contract readiness — not a manually maintained if/else of app names
 * in LifeOS UI code.
 */

import type { CanonicalAssetReference, CanonicalEntityReference } from "./digiconomy-universal.js";
import { canonicalEntityKindFor } from "./digiconomy-universal.js";
import {
  listInstallableDigiconomyEntries,
  type DigiconomyCatalogEntry,
} from "./digiconomy.js";
import {
  deriveEcommerceParticipation,
  type DigiconomyCommerceDomainModel,
} from "./digiconomy-participation.js";

export const LIFEOS_STREAMING_PROJECTION_VERSION = 1 as const;

/** Presentation families — shared discovery ≠ identical UI. */
export const LIFEOS_PROJECTION_FAMILIES = ["publication", "catalogue", "entity"] as const;
export type LifeOsProjectionFamily = (typeof LIFEOS_PROJECTION_FAMILIES)[number];

/**
 * Explicit LifeOS streaming capabilities (orthogonal to ecommerce ecosystem caps).
 * Declared on catalog engines that expose machine-readable public projections.
 */
export const LIFEOS_STREAMING_CAPABILITIES = [
  "lifeos_publication_projection",
  "lifeos_catalogue_projection",
] as const;
export type LifeOsStreamingCapability = (typeof LIFEOS_STREAMING_CAPABILITIES)[number];

export type LifeOsStreamingReadiness = "ready" | "partial" | "not_ready" | "not_applicable";

export type LifeOsSourceFailureKind =
  | "empty"
  | "unavailable"
  | "unauthorized"
  | "invalid_projection"
  | "timeout"
  | "partial";

export type LifeOsSourceResult<T> =
  | { ok: true; items: T[]; nextCursor: string | null; partial?: boolean }
  | { ok: false; failure: LifeOsSourceFailureKind; message: string };

/**
 * Shared LifeOS consumption projection.
 * Domain semantics stay in itemType + family + catalogueMetadata —
 * do not flatten rooms into "product".
 */
export type CanonicalLifeOsProjection = {
  projectionVersion: typeof LIFEOS_STREAMING_PROJECTION_VERSION;
  family: LifeOsProjectionFamily;
  applicationId: string;
  engine: string;
  verticalId: string | null;
  tenant: CanonicalEntityReference;
  itemType: string;
  canonicalItemId: string;
  title: string;
  summary: string | null;
  assetReferences: CanonicalAssetReference[];
  availability: "available" | "unavailable" | "unknown";
  price: { amount: string; currency: string } | null;
  catalogueMetadata: Record<string, unknown> | null;
  presentationHints: {
    kind: string;
    immersiveEligible: boolean;
  };
  canonicalSourceUrl: string;
  sourceSurface: "app" | "digital_space" | "storefront" | "other";
  publishedAt: string | null;
  updatedAt: string | null;
  provenance: {
    sourceApplicationId: string;
    sourceTenantSlug: string;
    sourceItemId: string;
    sourceContract: string;
  };
};

export type LifeOsStreamingEligibility = {
  catalogKey: string;
  displayName: string;
  bucket: DigiconomyCatalogEntry["bucket"];
  engine: string;
  verticalId: string;
  domainModel: DigiconomyCommerceDomainModel;
  readiness: LifeOsStreamingReadiness;
  capabilities: LifeOsStreamingCapability[];
  families: LifeOsProjectionFamily[];
  /** Documented public/least-privilege contract pattern (not a secret). */
  publicContract: string | null;
  missing: string[];
};

/** Known machine-readable public (or host-scoped least-privilege) contracts. */
const ENGINE_STREAMING_TRUTH: Record<
  string,
  {
    readiness: LifeOsStreamingReadiness;
    capabilities: LifeOsStreamingCapability[];
    families: LifeOsProjectionFamily[];
    publicContract: string | null;
    missing: string[];
  }
> = {
  mybrandos: {
    readiness: "ready",
    capabilities: ["lifeos_publication_projection", "lifeos_catalogue_projection"],
    families: ["publication", "catalogue", "entity"],
    publicContract: "GET {origin}/api/public/{slug} → publishedAssets[] (+ /assets/{id}/cover)",
    missing: [],
  },
  ecommerceos: {
    readiness: "ready",
    capabilities: ["lifeos_catalogue_projection", "lifeos_publication_projection"],
    families: ["catalogue", "publication"],
    publicContract:
      "GET /v1/public/lifeos/feed?kind=product|publication|all&cursor=&limit= (cross-tenant; active+public only)",
    missing: [],
  },
  hospitalityos: {
    readiness: "partial",
    capabilities: [],
    families: ["catalogue"],
    publicContract: null,
    missing: [
      "machine-readable public catalogue projection API for LifeOS",
      "canonical asset references on public offerings",
    ],
  },
  serviceos: {
    readiness: "partial",
    capabilities: [],
    families: ["catalogue"],
    publicContract: null,
    missing: [
      "machine-readable public service catalogue projection for LifeOS",
      "LifeOS currently embeds ServiceOS catalog via shell iframe only",
    ],
  },
  transportationos: {
    readiness: "not_ready",
    capabilities: [],
    families: ["catalogue"],
    publicContract: null,
    missing: [
      "public routes/offers projection contract",
      "Desktop TransportationOS repo not present as first-party source tree",
    ],
  },
};

export function lifeOsStreamingEligibilityForEntry(
  entry: DigiconomyCatalogEntry,
): LifeOsStreamingEligibility {
  const truth = ENGINE_STREAMING_TRUTH[entry.engine] ?? {
    readiness: "not_ready" as const,
    capabilities: [] as LifeOsStreamingCapability[],
    families: [] as LifeOsProjectionFamily[],
    publicContract: null,
    missing: ["no documented LifeOS public projection contract for this engine"],
  };
  const participation = deriveEcommerceParticipation({
    osId: entry.engine,
    verticalId: entry.verticalId,
    enabledModules: entry.modules,
  });

  return {
    catalogKey: entry.catalogKey,
    displayName: entry.displayName,
    bucket: entry.bucket,
    engine: entry.engine,
    verticalId: entry.verticalId,
    domainModel: participation.domainModel,
    readiness: truth.readiness,
    capabilities: truth.capabilities,
    families: truth.families,
    publicContract: truth.publicContract,
    missing: truth.missing,
  };
}

/** Dynamic eligibility from Portal Digiconomy catalog (no second registry). */
export function listLifeOsStreamingEligibility(): LifeOsStreamingEligibility[] {
  return listInstallableDigiconomyEntries()
    .filter((e) => e.available)
    .map(lifeOsStreamingEligibilityForEntry);
}

export function listLifeOsReadyEngines(): string[] {
  const engines = new Set<string>();
  for (const row of listLifeOsStreamingEligibility()) {
    if (row.readiness === "ready") engines.add(row.engine);
  }
  return [...engines].sort();
}

export function engineHasLifeOsCapability(
  engine: string,
  capability: LifeOsStreamingCapability,
): boolean {
  return listLifeOsStreamingEligibility().some(
    (row) => row.engine === engine && row.capabilities.includes(capability),
  );
}

/** Adapter interface — READ only; no ownership. */
export type LifeOsVerticalAdapter = {
  engine: string;
  families: LifeOsProjectionFamily[];
  projectPage(input: {
    tenantSlug: string;
    cursor?: string | null;
    limit?: number;
    signal?: AbortSignal;
  }): Promise<LifeOsSourceResult<CanonicalLifeOsProjection>>;
};

export function isPubliclyEligibleLifeOsItem(input: {
  status?: string | null;
  audience?: string | null;
  publicationState?: string | null;
  privacy?: string | null;
  draft?: boolean;
  suspended?: boolean;
  processing?: boolean;
  mediaStatus?: string | null;
}): boolean {
  if (input.draft === true) return false;
  if (input.suspended === true) return false;
  if (input.processing === true) return false;
  if (input.status && input.status !== "published" && input.status !== "active") return false;
  if (input.audience && input.audience !== "public") return false;
  if (input.publicationState && !["published", "live", "active"].includes(input.publicationState)) {
    return false;
  }
  if (input.privacy && input.privacy !== "public") return false;
  if (input.mediaStatus === "broken" || input.mediaStatus === "processing") return false;
  return true;
}

function tenantRef(input: {
  slug: string;
  displayName: string;
  engine: string;
  verticalId?: string | null;
  digiconomyApplicationId?: string | null;
}): CanonicalEntityReference {
  return {
    canonicalEntityId: input.slug,
    slug: input.slug,
    kind: canonicalEntityKindFor(input.engine, input.verticalId),
    displayName: input.displayName,
    digiconomyApplicationId: input.digiconomyApplicationId ?? null,
  };
}

/** mybrandOS publishedAssets[] → LifeOS projections (by reference). */
export function projectMybrandPublicAssets(input: {
  slug: string;
  displayName?: string;
  origin: string;
  digiconomyApplicationId?: string | null;
  assets: Array<{
    id: string;
    title: string;
    description?: string;
    assetType: string;
    publishedAt: string;
    coverAvailable?: boolean;
    mediaAvailable?: boolean;
    presentationTypes?: string[];
    presentation?: { body?: string; storeAvailable?: boolean };
  }>;
}): CanonicalLifeOsProjection[] {
  const origin = input.origin.replace(/\/$/, "");
  const name = input.displayName || input.slug;
  const out: CanonicalLifeOsProjection[] = [];

  for (const asset of input.assets) {
    const types = (asset.presentationTypes ?? []).map((t) => String(t).toUpperCase());
    const isCatalogue =
      types.includes("PRODUCT") ||
      types.includes("STORE") ||
      types.includes("OFFER") ||
      asset.presentation?.storeAvailable === true;
    const pubType = types.includes("PHOTO")
      ? "PHOTO"
      : types.includes("REEL")
        ? "REEL"
        : types.includes("VIDEO") || asset.assetType === "VIDEO"
          ? "VIDEO"
          : asset.assetType === "PHOTO"
            ? "PHOTO"
            : types.includes("POST") || asset.assetType === "DESIGN" || asset.assetType === "WRITING"
              ? "POST"
              : asset.assetType;

    if (
      !isPubliclyEligibleLifeOsItem({
        status: "published",
        audience: "public",
      })
    ) {
      continue;
    }

    const assets: CanonicalAssetReference[] = [];
    if (asset.coverAvailable) {
      assets.push({
        assetId: asset.id,
        ownerEntityId: input.slug,
        href: `${origin}/api/public/${encodeURIComponent(input.slug)}/assets/${encodeURIComponent(asset.id)}/cover`,
        kind: asset.assetType === "VIDEO" || types.includes("VIDEO") || types.includes("REEL") ? "video" : "image",
        alt: asset.title,
      });
    }
    if (asset.mediaAvailable) {
      assets.push({
        assetId: `${asset.id}:media`,
        ownerEntityId: input.slug,
        href: `${origin}/api/public/${encodeURIComponent(input.slug)}/assets/${encodeURIComponent(asset.id)}/media`,
        kind: asset.assetType === "VIDEO" || types.includes("VIDEO") || types.includes("REEL") ? "video" : "file",
        alt: asset.title,
      });
    }

    out.push({
      projectionVersion: LIFEOS_STREAMING_PROJECTION_VERSION,
      family: isCatalogue ? "catalogue" : "publication",
      applicationId: "mybrandos",
      engine: "mybrandos",
      verticalId: "creator",
      tenant: tenantRef({
        slug: input.slug,
        displayName: name,
        engine: "mybrandos",
        verticalId: "creator",
        digiconomyApplicationId: input.digiconomyApplicationId,
      }),
      itemType: isCatalogue ? "PRODUCT" : pubType,
      canonicalItemId: asset.id,
      title: asset.title,
      summary: asset.presentation?.body || asset.description || null,
      assetReferences: assets,
      availability: "available",
      price: null,
      catalogueMetadata: isCatalogue ? { presentationTypes: types } : null,
      presentationHints: {
        kind: isCatalogue ? "catalogue" : pubType.toLowerCase(),
        immersiveEligible: !isCatalogue,
      },
      canonicalSourceUrl: `https://${input.slug}.getlifeos.app/`,
      sourceSurface: "app",
      publishedAt: asset.publishedAt,
      updatedAt: asset.publishedAt,
      provenance: {
        sourceApplicationId: "mybrandos",
        sourceTenantSlug: input.slug,
        sourceItemId: asset.id,
        sourceContract: "mybrandos.public_assets_v1",
      },
    });
  }

  return out;
}

/** EcommerceOS storefront product row → LifeOS catalogue projection. */
export function projectEcommerceStorefrontProduct(input: {
  slug: string;
  displayName?: string;
  digiconomyApplicationId?: string | null;
  verticalId?: string | null;
  product: {
    id: string;
    title: string;
    description?: string;
    status?: string;
    price?: string | number | null;
    currency?: string | null;
    images?: unknown;
    createdAt?: string;
    updatedAt?: string;
  };
}): CanonicalLifeOsProjection | null {
  if (
    !isPubliclyEligibleLifeOsItem({
      status: input.product.status ?? "active",
      suspended: input.product.status === "suspended" || input.product.status === "deleted",
    })
  ) {
    return null;
  }

  const images = Array.isArray(input.product.images)
    ? input.product.images.map(String).filter((href) => href.startsWith("https://"))
    : [];

  const price =
    input.product.price != null && input.product.currency
      ? { amount: String(input.product.price), currency: String(input.product.currency) }
      : null;

  return {
    projectionVersion: LIFEOS_STREAMING_PROJECTION_VERSION,
    family: "catalogue",
    applicationId: "ecommerceos",
    engine: "ecommerceos",
    verticalId: input.verticalId ?? "retail",
    tenant: tenantRef({
      slug: input.slug,
      displayName: input.displayName || input.slug,
      engine: "ecommerceos",
      verticalId: input.verticalId ?? "retail",
      digiconomyApplicationId: input.digiconomyApplicationId,
    }),
    itemType: "PRODUCT",
    canonicalItemId: input.product.id,
    title: input.product.title,
    summary: input.product.description?.replace(/\s+/g, " ").trim().slice(0, 280) || null,
    assetReferences: images.map((href, i) => ({
      assetId: `${input.product.id}:img:${i}`,
      ownerEntityId: input.slug,
      href,
      kind: "image" as const,
      alt: input.product.title,
    })),
    availability: input.product.status === "active" || !input.product.status ? "available" : "unavailable",
    price,
    catalogueMetadata: {
      domainModel: "retail_commerce",
    },
    presentationHints: {
      kind: "product",
      immersiveEligible: true,
    },
    canonicalSourceUrl: `https://${input.slug}.getlifeos.app/product/${input.product.id}`,
    sourceSurface: "storefront",
    publishedAt: input.product.createdAt ?? null,
    updatedAt: input.product.updatedAt ?? input.product.createdAt ?? null,
    provenance: {
      sourceApplicationId: "ecommerceos",
      sourceTenantSlug: input.slug,
      sourceItemId: input.product.id,
      sourceContract: "ecommerceos.storefront_products_v1",
    },
  };
}

/**
 * EcommerceOS Digiconomy News / storefront publications shape → LifeOS.
 * Reuses CanonicalPublicationProjection-compatible fields without copying products.
 */
export function projectEcommercePublicPublication(input: {
  slug: string;
  displayName?: string;
  digiconomyApplicationId?: string | null;
  publication: {
    publicationId: string;
    publisherEntityId: string;
    publishedAt: string;
    status: string;
    audience: string;
    title: string | null;
    summary: string | null;
    contentReference: { ownerVertical: string; kind: string; nativeId: string };
    mediaReferences: Array<{ href: string; kind?: string; alt?: string | null }>;
    canonicalUrl: string;
  };
}): CanonicalLifeOsProjection | null {
  if (
    !isPubliclyEligibleLifeOsItem({
      status: input.publication.status,
      audience: input.publication.audience,
    })
  ) {
    return null;
  }

  return {
    projectionVersion: LIFEOS_STREAMING_PROJECTION_VERSION,
    family: input.publication.contentReference.kind === "product" ? "catalogue" : "publication",
    applicationId: "ecommerceos",
    engine: "ecommerceos",
    verticalId: null,
    tenant: tenantRef({
      slug: input.slug,
      displayName: input.displayName || input.slug,
      engine: "ecommerceos",
      digiconomyApplicationId: input.digiconomyApplicationId,
    }),
    itemType: input.publication.contentReference.kind.toUpperCase(),
    canonicalItemId: input.publication.contentReference.nativeId,
    title: input.publication.title || "Untitled",
    summary: input.publication.summary,
    assetReferences: input.publication.mediaReferences
      .filter((m) => m.href.startsWith("https://"))
      .map((m, i) => ({
        assetId: `${input.publication.contentReference.nativeId}:m:${i}`,
        ownerEntityId: input.publication.publisherEntityId,
        href: m.href,
        kind: (m.kind === "video" ? "video" : "image") as "image" | "video",
        alt: m.alt ?? input.publication.title,
      })),
    availability: "available",
    price: null,
    catalogueMetadata:
      input.publication.contentReference.kind === "product"
        ? { publicationId: input.publication.publicationId }
        : null,
    presentationHints: {
      kind: input.publication.contentReference.kind,
      immersiveEligible: true,
    },
    canonicalSourceUrl: input.publication.canonicalUrl,
    sourceSurface: "storefront",
    publishedAt: input.publication.publishedAt,
    updatedAt: input.publication.publishedAt,
    provenance: {
      sourceApplicationId: "ecommerceos",
      sourceTenantSlug: input.slug,
      sourceItemId: input.publication.contentReference.nativeId,
      sourceContract: "ecommerceos.storefront_publications_v1",
    },
  };
}

/**
 * Deterministic mixed-stream assembly for V1 (no fake trending).
 * Newest first by publishedAt, then stable id; round-robin optional via interleaveSources.
 */
export function assembleLifeOsStream(
  pages: CanonicalLifeOsProjection[][],
  opts?: { interleaveSources?: boolean; limit?: number },
): CanonicalLifeOsProjection[] {
  const limit = opts?.limit ?? 50;
  if (opts?.interleaveSources) {
    const queues = pages.map((p) => [...p]);
    const out: CanonicalLifeOsProjection[] = [];
    let progressed = true;
    while (out.length < limit && progressed) {
      progressed = false;
      for (const q of queues) {
        if (!q.length || out.length >= limit) continue;
        out.push(q.shift()!);
        progressed = true;
      }
    }
    return out;
  }

  return pages
    .flat()
    .sort((a, b) => {
      const ta = a.publishedAt ? Date.parse(a.publishedAt) : 0;
      const tb = b.publishedAt ? Date.parse(b.publishedAt) : 0;
      if (tb !== ta) return tb - ta;
      return a.canonicalItemId.localeCompare(b.canonicalItemId);
    })
    .slice(0, limit);
}

export function assertNoLifeOsOwnershipCopy(projection: CanonicalLifeOsProjection): void {
  // Structural invariant for tests: provenance must point at source app ≠ lifeos.
  if (projection.provenance.sourceApplicationId === "lifeos") {
    throw new Error("LifeOS must not be recorded as canonical content owner");
  }
  if (!projection.canonicalSourceUrl.startsWith("https://")) {
    throw new Error("canonicalSourceUrl must be https deep link / source URL");
  }
  for (const asset of projection.assetReferences) {
    if (!asset.href.startsWith("https://")) {
      throw new Error("asset href must be canonical https reference");
    }
    if (asset.href.includes("lifeos") && asset.href.includes("/upload")) {
      throw new Error("asset must not be a LifeOS upload copy");
    }
  }
}
