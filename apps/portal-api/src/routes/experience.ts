import type { FastifyInstance } from "fastify";
import { LIFEOS_STREAMING_PROJECTION_VERSION } from "@lifeos-portal/shared";
import type { PortalStore } from "../store.js";
import {
  eligibleProjections,
  experienceSourceInstalls,
  findExperienceBySourceUrl,
  pageLifeOsExperience,
  readPublicLifeOsSource,
  type LifeOsExperienceReader,
} from "../services/lifeos-experience.js";

function parseLimit(raw: unknown): number | null {
  if (raw === undefined) return 20;
  if (typeof raw !== "string" || !/^[1-9]\d*$/.test(raw)) return null;
  const n = Number(raw);
  if (n > 50) return null;
  return n;
}

/**
 * Read-only LifeOS streaming projection.
 * Items come from shared lifeos-streaming projectors. This route does not
 * own a content registry and does not feed GET /v1/directory.
 */
export async function registerExperienceRoutes(
  app: FastifyInstance,
  store: PortalStore,
  reader: LifeOsExperienceReader = readPublicLifeOsSource,
) {
  app.get("/v1/experience", async (req, reply) => {
    const q = (req.query ?? {}) as { limit?: unknown; cursor?: unknown; ref?: unknown };
    const limit = parseLimit(q.limit);
    if (limit === null) {
      return reply.code(400).send({ error: "invalid_limit" });
    }
    if (q.cursor !== undefined && typeof q.cursor !== "string") {
      return reply.code(400).send({ error: "invalid_cursor" });
    }
    if (q.ref !== undefined && (typeof q.ref !== "string" || !q.ref.startsWith("https://"))) {
      return reply.code(400).send({ error: "invalid_ref" });
    }

    const installs = experienceSourceInstalls(store.listAllInstalls());
    const sources = [];
    for (const row of installs) {
      sources.push(await reader(row));
    }
    const pages = eligibleProjections(sources);

    if (typeof q.ref === "string") {
      const item = findExperienceBySourceUrl(pages, q.ref);
      if (!item) return reply.code(404).send({ error: "not_found" });
      return {
        projectionVersion: LIFEOS_STREAMING_PROJECTION_VERSION,
        item,
      };
    }

    const page = pageLifeOsExperience(pages, {
      limit,
      cursor: typeof q.cursor === "string" ? q.cursor : null,
    });
    if (!page.ok) return reply.code(400).send({ error: "invalid_cursor" });
    return {
      projectionVersion: LIFEOS_STREAMING_PROJECTION_VERSION,
      items: page.items,
      nextCursor: page.nextCursor,
    };
  });
}
