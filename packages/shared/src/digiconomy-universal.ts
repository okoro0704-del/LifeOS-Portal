/**
 * Minimal universal-surface contracts for DigiNews and DigiPedia.
 *
 * These are projections over canonical Digital Life identity.
 * They do NOT create a second tenant/entity registry, CMS, or asset store.
 *
 * Identity:
 *   public entity key = tenant slug on {slug}.getlifeos.app
 *   application id    = Portal install id (digiconomyApplicationId)
 *   PATH selects the surface. HOST selects the entity.
 */

import { digiconomyCurrentSurfaceUrl } from "./digiconomy-surfaces.js";

export const CANONICAL_ENTITY_KINDS = [
  "PERSON",
  "BUSINESS",
  "ORGANIZATION",
  "PROJECT",
  "PLACE",
  "PRODUCT",
] as const;
export type CanonicalEntityKind = (typeof CANONICAL_ENTITY_KINDS)[number];

const BUSINESS_OS = new Set([
  "hospitalityos",
  "ecommerceos",
  "serviceos",
  "transportationos",
  "logisticsos",
  "enterpriseos",
]);

const BUSINESS_VERTICALS = new Set([
  "hotel",
  "restaurant",
  "local_food",
  "shared_homes",
  "gym_spa",
  "bar",
  "supermarket",
  "marketplace",
  "store",
  "retail",
  "delivery",
  "service",
  "transport",
  "logistics",
  "organization",
  "business",
  "brand",
]);

const PERSON_VERTICALS = new Set(["creator", "person", "personal", "individual"]);

export function canonicalEntityKindFor(
  osId?: string | null,
  verticalId?: string | null,
): CanonicalEntityKind {
  const os = (osId ?? "").toLowerCase();
  const vertical = (verticalId ?? "").toLowerCase();
  if (PERSON_VERTICALS.has(vertical) || os === "mybrandos") return "PERSON";
  if (BUSINESS_OS.has(os) || BUSINESS_VERTICALS.has(vertical)) return "BUSINESS";
  return "PERSON";
}

export type CanonicalEntityReference = {
  canonicalEntityId: string;
  slug: string;
  kind: CanonicalEntityKind;
  displayName: string;
  digiconomyApplicationId?: string | null;
};

export type CanonicalAssetReference = {
  assetId: string;
  ownerEntityId: string;
  href: string;
  kind: "image" | "video" | "audio" | "file";
  alt?: string | null;
};

export type SourceReference = {
  sourceId: string;
  sourceType: "canonical_publication" | "canonical_entity" | "canonical_asset" | "external";
  publisherEntityId?: string;
  canonicalUrl?: string;
  publicationId?: string;
  title?: string;
  publishedAt?: string;
  available: boolean;
};

export type CanonicalPublicationProjection = {
  publicationId: string;
  publisherEntityId: string;
  subjectEntityIds: string[];
  publishedAt: string;
  status: "published";
  audience: "public";
  publicationType: string;
  title?: string | null;
  summary?: string | null;
  contentReference: {
    ownerVertical: string;
    kind: string;
    nativeId: string;
  };
  mediaReferences: CanonicalAssetReference[];
  provenance: SourceReference;
  canonicalUrl: string;
};

export type DigiPediaSectionProjection = {
  sectionId: string;
  heading: string;
  body: string;
  order: number;
  sourceReferences: SourceReference[];
};

export type DigiPediaEntryProjection = {
  entryId: string;
  entityId: string;
  title: string;
  summary: string;
  sections: DigiPediaSectionProjection[];
  sourceReferences: SourceReference[];
  relatedEntityReferences: CanonicalEntityReference[];
  revision: {
    updatedAt: string | null;
    revisionId: string | null;
    historyAvailable: boolean;
  };
  status: "published" | "sparse";
};

export function publicationRelationForSubject(
  publisherEntityId: string,
  subjectEntityId: string,
): "self" | "third_party" {
  return publisherEntityId === subjectEntityId ? "self" : "third_party";
}

export function isPubliclyProjectablePublication(
  item: Pick<
    CanonicalPublicationProjection,
    "status" | "audience" | "publisherEntityId" | "subjectEntityIds" | "publishedAt"
  >,
  now = new Date(),
): boolean {
  if (item.status !== "published") return false;
  if (item.audience !== "public") return false;
  if (!item.publisherEntityId || !item.subjectEntityIds.length) return false;
  if (!item.publishedAt) return false;
  const at = Date.parse(item.publishedAt);
  if (!Number.isFinite(at) || at > now.getTime()) return false;
  return true;
}

export function sourceFromPublication(
  item: Pick<
    CanonicalPublicationProjection,
    "publicationId" | "publisherEntityId" | "canonicalUrl" | "title" | "publishedAt"
  >,
  available = true,
): SourceReference {
  return {
    sourceId: `publication:${item.publicationId}`,
    sourceType: "canonical_publication",
    publisherEntityId: item.publisherEntityId,
    canonicalUrl: available ? item.canonicalUrl : undefined,
    publicationId: item.publicationId,
    title: item.title ?? undefined,
    publishedAt: item.publishedAt,
    available,
  };
}

export function entityProvidedSource(entity: CanonicalEntityReference): SourceReference {
  return {
    sourceId: `entity:${entity.canonicalEntityId}`,
    sourceType: "canonical_entity",
    publisherEntityId: entity.canonicalEntityId,
    canonicalUrl: digiconomyCurrentSurfaceUrl(entity.slug, "app"),
    title: "Official entity information",
    available: true,
  };
}
