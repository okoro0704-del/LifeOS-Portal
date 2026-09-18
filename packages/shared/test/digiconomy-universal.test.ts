import assert from "node:assert/strict";
import { describe, test } from "node:test";
import {
  canonicalEntityKindFor,
  digiconomyCurrentSurfaceUrl,
  entityProvidedSource,
  isPubliclyProjectablePublication,
  publicationRelationForSubject,
  sourceFromPublication,
} from "../src/index.ts";

describe("universal News + DigiPedia contracts", () => {
  test("person and business reuse existing taxonomy — no new entity types", () => {
    assert.equal(canonicalEntityKindFor("mybrandos", "creator"), "PERSON");
    assert.equal(canonicalEntityKindFor("hospitalityos", "hotel"), "BUSINESS");
    assert.equal(canonicalEntityKindFor("ecommerceos", "retail"), "BUSINESS");
  });

  test("surfaces share the same host identity", () => {
    assert.equal(
      digiconomyCurrentSurfaceUrl("mrfundzman", "news"),
      "https://mrfundzman.getlifeos.app/news",
    );
    assert.equal(
      digiconomyCurrentSurfaceUrl("mrfundzman", "digipedia"),
      "https://mrfundzman.getlifeos.app/digipedia",
    );
    assert.equal(digiconomyCurrentSurfaceUrl("harbour", "news"), "https://harbour.getlifeos.app/news");
  });

  test("publisher vs subject is a relation, not a second identity", () => {
    assert.equal(publicationRelationForSubject("kingbooker", "mrfundzman"), "third_party");
    assert.equal(publicationRelationForSubject("mrfundzman", "mrfundzman"), "self");
  });

  test("future and incomplete publications are not public", () => {
    const base = {
      status: "published" as const,
      audience: "public" as const,
      publisherEntityId: "kingbooker",
      subjectEntityIds: ["mrfundzman"],
      publishedAt: "2026-09-18T00:00:00.000Z",
    };
    assert.equal(isPubliclyProjectablePublication(base, new Date("2026-09-18T12:00:00.000Z")), true);
    assert.equal(
      isPubliclyProjectablePublication(
        { ...base, publishedAt: "2026-09-19T00:00:00.000Z" },
        new Date("2026-09-18T12:00:00.000Z"),
      ),
      false,
    );
  });

  test("publication sources are references, not copies", () => {
    const source = sourceFromPublication({
      publicationId: "p1",
      publisherEntityId: "kingbooker",
      canonicalUrl: "https://kingbooker.getlifeos.app/a/p1",
      title: "Build Africa announced",
      publishedAt: "2026-09-18T00:00:00.000Z",
    });
    assert.equal(source.sourceType, "canonical_publication");
    assert.equal(source.publicationId, "p1");
    assert.equal(source.available, true);
    const hidden = sourceFromPublication(
      {
        publicationId: "p1",
        publisherEntityId: "kingbooker",
        canonicalUrl: "https://kingbooker.getlifeos.app/a/p1",
        title: "Build Africa announced",
        publishedAt: "2026-09-18T00:00:00.000Z",
      },
      false,
    );
    assert.equal(hidden.available, false);
    assert.equal(hidden.canonicalUrl, undefined);
  });

  test("entity-provided knowledge cites the canonical Digital Life, not a wiki tenant", () => {
    const source = entityProvidedSource({
      canonicalEntityId: "mrfundzman",
      slug: "mrfundzman",
      kind: "PERSON",
      displayName: "Mr Fundzman",
      digiconomyApplicationId: "ins_1",
    });
    assert.equal(source.sourceType, "canonical_entity");
    assert.equal(source.canonicalUrl, "https://mrfundzman.getlifeos.app/");
  });
});
