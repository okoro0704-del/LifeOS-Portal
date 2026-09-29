import {
  assembleLifeOsStream,
  assertNoLifeOsOwnershipCopy,
  digiconomyIdentityFields,
  isUpstreamServiceUrl,
  listLifeOsReadyEngines,
  mybrandOsDeliverables,
  projectMybrandPublicAssets,
  tenantDeliverables,
  type CanonicalLifeOsProjection,
  type LifeOsSourceResult,
} from "@lifeos-portal/shared";
import { httpJson } from "../lib/http.js";
import type { PortalInstall } from "../store.js";

/** Read-only source page. Portal does not store these items. */
export type LifeOsExperienceReader = (
  row: PortalInstall,
) => Promise<LifeOsSourceResult<CanonicalLifeOsProjection>>;

function publicOrigin(row: PortalInstall): string | null {
  const url = (row.osId === "mybrandos"
    ? mybrandOsDeliverables({ slug: row.subdomain, customDomain: row.customDomain }).guestApp.url
    : tenantDeliverables(row.subdomain, row.customDomain).guestApp.url).replace(/\/$/, "");
  if (!/^https:\/\//i.test(url) || isUpstreamServiceUrl(url)) return null;
  if (url.endsWith("/admin") || url.includes("/admin/")) return null;
  return url;
}

/** Same install gate as GET /v1/directory, plus streaming readiness. */
export function experienceSourceInstalls(rows: PortalInstall[]): PortalInstall[] {
  const ready = new Set(listLifeOsReadyEngines());
  return rows.filter((row) => {
    if (row.status !== "ready" || !row.seedApplied || row.suspended) return false;
    if (!publicOrigin(row)) return false;
    const identity = digiconomyIdentityFields({
      id: row.id,
      appId: row.appId,
      osId: row.osId,
      verticalId: row.verticalId,
    });
    return ready.has(identity.engine);
  });
}

/**
 * Production reader for the one public contract this process can project
 * without inventing a feed schema: mybrandOS publishedAssets[].
 * Other ready engines fail closed until their documented feed body is mapped
 * by the existing projectors.
 */
export async function readPublicLifeOsSource(
  row: PortalInstall,
): Promise<LifeOsSourceResult<CanonicalLifeOsProjection>> {
  const identity = digiconomyIdentityFields({
    id: row.id,
    appId: row.appId,
    osId: row.osId,
    verticalId: row.verticalId,
  });
  if (!listLifeOsReadyEngines().includes(identity.engine)) {
    return { ok: false, failure: "unavailable", message: "engine is not streaming-ready" };
  }
  if (identity.engine !== "mybrandos") {
    return {
      ok: false,
      failure: "unavailable",
      message: "public feed body is not mapped by an existing projector",
    };
  }
  const origin = publicOrigin(row);
  if (!origin) {
    return { ok: false, failure: "unavailable", message: "public origin is not established" };
  }
  try {
    const body = await httpJson<{ publishedAssets?: unknown }>(
      origin,
      `/api/public/${encodeURIComponent(row.subdomain)}`,
      { timeoutMs: 8_000 },
    );
    if (!body || !Array.isArray(body.publishedAssets)) {
      return { ok: false, failure: "invalid_projection", message: "publishedAssets[] missing" };
    }
    const items = projectMybrandPublicAssets({
      slug: row.subdomain,
      displayName: row.displayName,
      origin,
      digiconomyApplicationId: identity.digiconomyApplicationId,
      assets: body.publishedAssets.filter(
        (asset): asset is {
          id: string;
          title: string;
          description?: string;
          assetType: string;
          publishedAt: string;
          coverAvailable?: boolean;
          mediaAvailable?: boolean;
          presentationTypes?: string[];
          presentation?: { body?: string; storeAvailable?: boolean };
        } =>
          !!asset &&
          typeof asset === "object" &&
          typeof (asset as { id?: unknown }).id === "string" &&
          typeof (asset as { title?: unknown }).title === "string" &&
          typeof (asset as { assetType?: unknown }).assetType === "string" &&
          typeof (asset as { publishedAt?: unknown }).publishedAt === "string",
      ),
    });
    return { ok: true, items, nextCursor: null };
  } catch {
    return { ok: false, failure: "unavailable", message: "public contract unreachable" };
  }
}

function acceptProjection(item: CanonicalLifeOsProjection): boolean {
  if (!listLifeOsReadyEngines().includes(item.engine)) return false;
  try {
    assertNoLifeOsOwnershipCopy(item);
  } catch {
    return false;
  }
  return true;
}

export function eligibleProjections(
  pages: LifeOsSourceResult<CanonicalLifeOsProjection>[],
): CanonicalLifeOsProjection[][] {
  const out: CanonicalLifeOsProjection[][] = [];
  for (const page of pages) {
    if (!page.ok || page.partial) continue;
    const items = page.items.filter(acceptProjection);
    if (items.length) out.push(items);
  }
  return out;
}

type CursorKey = {
  publishedAt: string | null;
  canonicalItemId: string;
  engine: string;
  slug: string;
};

function encodeCursor(item: CanonicalLifeOsProjection): string {
  const key: CursorKey = {
    publishedAt: item.publishedAt,
    canonicalItemId: item.canonicalItemId,
    engine: item.engine,
    slug: item.tenant.slug,
  };
  return Buffer.from(JSON.stringify(key), "utf8").toString("base64url");
}

function decodeCursor(cursor: string): CursorKey | null {
  try {
    const parsed = JSON.parse(Buffer.from(cursor, "base64url").toString("utf8")) as Partial<CursorKey>;
    if (!parsed || typeof parsed.canonicalItemId !== "string" || typeof parsed.engine !== "string") {
      return null;
    }
    if (typeof parsed.slug !== "string") return null;
    if (parsed.publishedAt !== null && typeof parsed.publishedAt !== "string") return null;
    return {
      publishedAt: parsed.publishedAt ?? null,
      canonicalItemId: parsed.canonicalItemId,
      engine: parsed.engine,
      slug: parsed.slug,
    };
  } catch {
    return null;
  }
}

function sameCursor(item: CanonicalLifeOsProjection, key: CursorKey): boolean {
  return (
    item.publishedAt === key.publishedAt &&
    item.canonicalItemId === key.canonicalItemId &&
    item.engine === key.engine &&
    item.tenant.slug === key.slug
  );
}

/**
 * HTTP pagination over assembleLifeOsStream order.
 * Does not replace that order and does not store a registry.
 */
export function pageLifeOsExperience(
  pages: CanonicalLifeOsProjection[][],
  input: { limit: number; cursor: string | null },
): { ok: true; items: CanonicalLifeOsProjection[]; nextCursor: string | null } | { ok: false } {
  const total = pages.reduce((n, page) => n + page.length, 0);
  const ordered = assembleLifeOsStream(pages, { limit: Math.max(total, 1) });
  let start = 0;
  if (input.cursor) {
    const key = decodeCursor(input.cursor);
    if (!key) return { ok: false };
    const at = ordered.findIndex((item) => sameCursor(item, key));
    if (at < 0) return { ok: false };
    start = at + 1;
  }
  const items = ordered.slice(start, start + input.limit);
  const last = items[items.length - 1];
  const more = start + items.length < ordered.length;
  return {
    ok: true,
    items,
    nextCursor: more && last ? encodeCursor(last) : null,
  };
}

export function findExperienceBySourceUrl(
  pages: CanonicalLifeOsProjection[][],
  url: string,
): CanonicalLifeOsProjection | null {
  const total = pages.reduce((n, page) => n + page.length, 0);
  const ordered = assembleLifeOsStream(pages, { limit: Math.max(total, 1) });
  return ordered.find((item) => item.canonicalSourceUrl === url) ?? null;
}
