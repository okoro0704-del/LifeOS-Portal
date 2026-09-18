/**
 * Compatibility aliases for the universal News projection.
 *
 * Canonical types live in digiconomy-universal.ts.
 * Do not invent a second News source or publication authority here.
 */

export {
  isPubliclyProjectablePublication as isDigiconomyNewsPublic,
  publicationRelationForSubject,
  sourceFromPublication,
  type CanonicalAssetReference as DigiconomyNewsMediaReference,
  type CanonicalPublicationProjection as DigiconomyNewsPublicationProjection,
  type SourceReference as DigiconomyNewsProvenance,
} from "./digiconomy-universal.js";

export const DIGICONOMY_NEWS_PUBLIC_STATUS = "published" as const;
export const DIGICONOMY_NEWS_PUBLIC_AUDIENCE = "public" as const;

export type DigiconomyNewsContentReference = {
  ownerVertical: string;
  kind: string;
  nativeId: string;
};

export function digiconomyNewsRelation(
  publisherEntityId: string,
  subjectEntityIds: string[],
): "self" | "third_party" {
  return subjectEntityIds.length === 1 && subjectEntityIds[0] === publisherEntityId
    ? "self"
    : "third_party";
}
