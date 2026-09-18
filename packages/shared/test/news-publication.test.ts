import assert from "node:assert/strict";
import { describe, test } from "node:test";
import {
  digiconomyNewsRelation,
  type DigiconomyNewsPublicationProjection,
} from "../src/news-publication.ts";

describe("Digiconomy News publication contract", () => {
  test("preserves publisher vs subject without a second identity", () => {
    assert.equal(digiconomyNewsRelation("mrfundzman", ["mrfundzman"]), "self");
    assert.equal(digiconomyNewsRelation("kingbooker", ["mrfundzman"]), "third_party");
    const item: DigiconomyNewsPublicationProjection = {
      publicationId: "ecommerceos:publication:1",
      publisherEntityId: "mpa-6ppyad",
      subjectEntityIds: ["mpa-6ppyad"],
      publishedAt: "2026-09-10T00:00:00.000Z",
      status: "published",
      audience: "public",
      publicationType: "update",
      title: "Store update",
      summary: "A public store announcement.",
      contentReference: { ownerVertical: "ecommerceos", kind: "publication", nativeId: "1" },
      mediaReferences: [],
      provenance: {
        sourceId: "publication:ecommerceos:publication:1",
        sourceType: "canonical_publication",
        publisherEntityId: "mpa-6ppyad",
        canonicalUrl: "https://mpa-6ppyad.getlifeos.app/",
        publicationId: "ecommerceos:publication:1",
        title: "Store update",
        publishedAt: "2026-09-10T00:00:00.000Z",
        available: true,
      },
      canonicalUrl: "https://mpa-6ppyad.getlifeos.app/",
    };
    assert.equal(item.status, "published");
    assert.equal(item.audience, "public");
    assert.equal(item.provenance.sourceType, "canonical_publication");
  });
});
