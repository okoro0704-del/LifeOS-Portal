import Fastify, { type FastifyInstance } from "fastify";
import helmet from "@fastify/helmet";
import rateLimit from "@fastify/rate-limit";
import { z } from "zod";
import {
  KERNEL_SERVICE_NAME,
  channelState,
  deliverableFromStation,
  type KernelHealth,
} from "@lifeos-portal/offline-kernel";
import { KernelStore } from "./store.js";

const VERSION = process.env.npm_package_version || "0.1.0";

function serviceToken(): string {
  return (
    process.env.OFFLINE_KERNEL_SERVICE_TOKEN ||
    process.env.INTERNAL_PROVISION_TOKEN ||
    process.env.WHITE_LABEL_SECRET ||
    ""
  );
}

function requireServiceAuth(header: string | undefined): boolean {
  const expected = serviceToken();
  if (!expected) return process.env.NODE_ENV !== "production";
  if (!header?.startsWith("Bearer ")) return false;
  return header.slice(7) === expected;
}

export async function buildOfflineKernelApp(store = new KernelStore()): Promise<FastifyInstance> {
  const app = Fastify({
    trustProxy: true,
    logger: process.env.NODE_ENV !== "test",
  });

  await app.register(helmet, {
    global: true,
    contentSecurityPolicy: process.env.NODE_ENV === "production",
    hsts:
      process.env.NODE_ENV === "production"
        ? { maxAge: 31_536_000, includeSubDomains: true, preload: true }
        : false,
    frameguard: { action: "deny" },
  });
  await app.register(rateLimit, {
    global: true,
    max: process.env.NODE_ENV === "production" ? 300 : 10_000,
    timeWindow: "1 minute",
  });

  const healthBody = (): KernelHealth => ({
    service: KERNEL_SERVICE_NAME,
    status: store.ok ? "ok" : "degraded",
    database: store.ok,
    scheduler: true,
    version: VERSION,
    ready: store.ok,
  });

  app.get("/health", async () => healthBody());
  app.get("/ready", async (_req, reply) => {
    const body = healthBody();
    if (!body.ready) return reply.code(503).send(body);
    return body;
  });

  app.post("/v1/stations", async (req, reply) => {
    if (!requireServiceAuth(req.headers.authorization)) {
      return reply.code(401).send({ error: "unauthorized" });
    }
    const body = z
      .object({
        ownerId: z.string().min(1),
        slug: z.string().min(2),
        tvEnabled: z.boolean().optional(),
        radioEnabled: z.boolean().optional(),
      })
      .parse(req.body);
    const station = store.provision(body);
    return reply.code(201).send(station);
  });

  app.get("/v1/stations/by-slug/:slug", async (req, reply) => {
    const { slug } = req.params as { slug: string };
    const station = store.getBySlug(slug);
    if (!station) return reply.code(404).send({ error: "not_found" });
    return station;
  });

  app.get("/v1/stations/:stationId", async (req, reply) => {
    const { stationId } = req.params as { stationId: string };
    const station = store.getStation(stationId) || store.getBySlug(stationId);
    if (!station) return reply.code(404).send({ error: "not_found" });
    return station;
  });

  app.get("/v1/stations/:stationId/tv", async (req, reply) => {
    const { stationId } = req.params as { stationId: string };
    const station = store.getStation(stationId) || store.getBySlug(stationId);
    if (!station) return reply.code(404).send({ error: "not_found" });
    return channelState(station, "TV", store.versions(station.id));
  });

  app.get("/v1/stations/:stationId/radio", async (req, reply) => {
    const { stationId } = req.params as { stationId: string };
    const station = store.getStation(stationId) || store.getBySlug(stationId);
    if (!station) return reply.code(404).send({ error: "not_found" });
    return channelState(station, "RADIO", store.versions(station.id));
  });

  app.get("/v1/stations/:stationId/schedule", async (req, reply) => {
    const { stationId } = req.params as { stationId: string };
    const q = req.query as { channel?: string };
    const station = store.getStation(stationId) || store.getBySlug(stationId);
    if (!station) return reply.code(404).send({ error: "not_found" });
    const channel = q.channel === "TV" || q.channel === "RADIO" ? q.channel : undefined;
    return { programs: store.programsFor(station.id, channel) };
  });

  app.post("/v1/stations/:stationId/programs", async (req, reply) => {
    if (!requireServiceAuth(req.headers.authorization)) {
      return reply.code(401).send({ error: "unauthorized" });
    }
    const { stationId } = req.params as { stationId: string };
    const station = store.getStation(stationId) || store.getBySlug(stationId);
    if (!station) return reply.code(404).send({ error: "not_found" });
    const body = z
      .object({
        programs: z.array(
          z.object({
            id: z.string().optional(),
            channelType: z.enum(["TV", "RADIO"]),
            kind: z.enum(["CONTENT", "LIVE", "REPLAY", "ADVERTISEMENT", "PLAYLIST", "PRESENTER_SEGMENT"]),
            title: z.string().min(1),
            assetId: z.string().nullable().optional(),
            mediaUrl: z.string().nullable().optional(),
            coverUrl: z.string().nullable().optional(),
            durationMs: z.number().optional(),
            startMinute: z.number().nullable().optional(),
            sponsored: z.boolean().optional(),
            order: z.number().optional(),
          }),
        ),
      })
      .parse(req.body);
    const programs = store.addPrograms(station.id, body.programs);
    return reply.code(201).send({ programs });
  });

  app.post("/v1/stations/:stationId/playlists", async (req, reply) => {
    if (!requireServiceAuth(req.headers.authorization)) {
      return reply.code(401).send({ error: "unauthorized" });
    }
    const { stationId } = req.params as { stationId: string };
    const station = store.getStation(stationId) || store.getBySlug(stationId);
    if (!station) return reply.code(404).send({ error: "not_found" });
    const body = z
      .object({
        id: z.string().min(1),
        channelType: z.enum(["TV", "RADIO"]),
        title: z.string().min(1),
        itemIds: z.array(z.string()),
      })
      .parse(req.body);
    return reply.code(201).send(store.upsertPlaylist(station.id, body));
  });

  app.post("/v1/stations/:stationId/publish", async (req, reply) => {
    if (!requireServiceAuth(req.headers.authorization)) {
      return reply.code(401).send({ error: "unauthorized" });
    }
    const { stationId } = req.params as { stationId: string };
    const station = store.getStation(stationId) || store.getBySlug(stationId);
    if (!station) return reply.code(404).send({ error: "not_found" });
    return store.publish(station.id);
  });

  app.get("/v1/stations/:stationId/package", async (req, reply) => {
    const { stationId } = req.params as { stationId: string };
    const station = store.getStation(stationId) || store.getBySlug(stationId);
    if (!station) return reply.code(404).send({ error: "not_found" });
    const pkg = store.getPackage(station.id);
    if (!pkg) return reply.code(404).send({ error: "not_found" });
    return pkg;
  });

  app.get("/v1/stations/:stationId/deliverables", async (req, reply) => {
    const { stationId } = req.params as { stationId: string };
    const station = store.getStation(stationId) || store.getBySlug(stationId);
    const d = deliverableFromStation(station);
    return {
      space: station ? "ACTIVE" : "NOT_PROVISIONED",
      app: station ? "ACTIVE" : "NOT_PROVISIONED",
      diginews: station ? "ACTIVE" : "NOT_PROVISIONED",
      digipedia: station ? "ACTIVE" : "NOT_PROVISIONED",
      tv: d.tv,
      radio: d.radio,
      stationId: d.stationId,
    };
  });

  app.post("/v1/reconcile/consumption", async (req, reply) => {
    if (!requireServiceAuth(req.headers.authorization)) {
      return reply.code(401).send({ error: "unauthorized" });
    }
    const body = z
      .object({
        events: z.array(
          z.object({
            stationId: z.string(),
            channelType: z.enum(["TV", "RADIO"]),
            programId: z.string().nullable(),
            assetId: z.string().nullable(),
            deviceId: z.string(),
            offsetMs: z.number(),
            watchedMs: z.number(),
            offline: z.boolean(),
            at: z.string(),
          }),
        ),
      })
      .parse(req.body);
    return { accepted: store.reconcile(body.events) };
  });

  return app;
}
