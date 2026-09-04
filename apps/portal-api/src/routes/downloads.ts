import type { FastifyInstance, FastifyReply, FastifyRequest } from "fastify";
import { OS_DOWNLOADS } from "@lifeos-portal/shared";
import { config } from "../config.js";
import { downloadArtifact, resolveDownload } from "../services/downloads.js";

function downloadsOpen() {
  return config.allowGuestDownloads || !config.enableTrustId;
}

async function sendDownload(req: FastifyRequest, reply: FastifyReply) {
  const { osId } = req.params as { osId: string };
  const os = resolveDownload(osId);
  if (!os) return reply.code(404).send({ error: "not_found", message: "Unknown OS download." });
  const body = downloadArtifact(os);
  return reply
    .header("Content-Type", "application/octet-stream")
    .header("Content-Disposition", `attachment; filename="${os.filename}"`)
    .header("Cache-Control", "no-store")
    .send(body);
}

export async function registerDownloadRoutes(app: FastifyInstance) {
  const list = async () => ({
    downloads: OS_DOWNLOADS.map((row) => ({
      ...row,
      href: `/downloads/${row.osId}`,
    })),
    public: downloadsOpen(),
  });

  app.get("/downloads", list);
  app.get("/app/downloads", list);
  app.get("/downloads/:osId", sendDownload);
  app.get("/app/downloads/:osId", sendDownload);
}
