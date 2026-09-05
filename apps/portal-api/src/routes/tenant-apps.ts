import type { FastifyInstance, FastifyReply, FastifyRequest } from "fastify";
import { z } from "zod";
import type { PortalStore } from "../store.js";
import { HttpError } from "../lib/http.js";
import {
  bookHotelRoom,
  hotelAppPayload,
  placeHotelOrder,
  updateHotelBookingStatus,
} from "../services/hotel-ops.js";
import {
  pngIcon,
  tenantAppHtml,
  tenantAppScript,
  tenantAssetBase,
  tenantManifest,
  tenantServiceWorker,
  tenantSubdomainFromHost,
  toPublicTenantApp,
} from "../services/tenant-apps.js";

function surfaceFromQuery(req: FastifyRequest): "guest" | "admin" {
  const query = req.query as { surface?: string };
  return query.surface === "admin" ? "admin" : "guest";
}

function sendHtml(reply: FastifyReply, html: string) {
  return reply.type("text/html; charset=utf-8").send(html);
}

export async function registerTenantAppRoutes(app: FastifyInstance, store: PortalStore) {
  app.get("/public/tenants/:subdomain", async (req, reply) => {
    const { subdomain } = req.params as { subdomain: string };
    const row = store.getInstallBySubdomain(subdomain.toLowerCase());
    if (!row || row.status !== "ready" || row.suspended) {
      return reply.code(404).send({ error: "not_found", message: "Tenant app is not ready." });
    }
    if (row.verticalId === "hotel") return hotelAppPayload(row);
    return { tenant: toPublicTenantApp(row) };
  });

  app.post("/public/tenants/:subdomain/bookings", async (req, reply) => {
    const { subdomain } = req.params as { subdomain: string };
    const row = store.getInstallBySubdomain(subdomain.toLowerCase());
    if (!row || row.status !== "ready" || row.verticalId !== "hotel") {
      return reply.code(404).send({ error: "not_found", message: "Hotel is not ready." });
    }
    const body = z
      .object({
        roomId: z.string().min(1),
        guestName: z.string().min(1),
        guestEmail: z.string().email(),
        checkIn: z.string().min(8),
        checkOut: z.string().min(8),
      })
      .parse(req.body);
    try {
      return reply.code(201).send({ booking: bookHotelRoom(row, body) });
    } catch (err) {
      if (err instanceof HttpError) return reply.code(err.statusCode).send({ error: err.code, message: err.message });
      throw err;
    }
  });

  app.post("/public/tenants/:subdomain/orders", async (req, reply) => {
    const { subdomain } = req.params as { subdomain: string };
    const row = store.getInstallBySubdomain(subdomain.toLowerCase());
    if (!row || row.status !== "ready" || row.verticalId !== "hotel") {
      return reply.code(404).send({ error: "not_found", message: "Hotel is not ready." });
    }
    const body = z
      .object({
        item: z.string().min(1),
        quantity: z.number().int().positive().max(12).optional(),
        guestName: z.string().min(1),
        roomName: z.string().optional(),
      })
      .parse(req.body);
    try {
      return reply.code(201).send({ order: placeHotelOrder(row, body) });
    } catch (err) {
      if (err instanceof HttpError) return reply.code(err.statusCode).send({ error: err.code, message: err.message });
      throw err;
    }
  });

  app.post("/public/tenants/:subdomain/bookings/:bookingId/status", async (req, reply) => {
    const { subdomain, bookingId } = req.params as { subdomain: string; bookingId: string };
    const row = store.getInstallBySubdomain(subdomain.toLowerCase());
    if (!row || row.verticalId !== "hotel") return reply.code(404).send({ error: "not_found" });
    const body = z.object({ status: z.enum(["confirmed", "checked_in", "checked_out"]) }).parse(req.body);
    try {
      return { booking: updateHotelBookingStatus(row, bookingId, body.status) };
    } catch (err) {
      if (err instanceof HttpError) return reply.code(err.statusCode).send({ error: err.code, message: err.message });
      throw err;
    }
  });

  const sendTenantPage = async (
    req: FastifyRequest,
    reply: FastifyReply,
    subdomain: string,
    surface: "guest" | "admin",
    onTenantHost: boolean,
  ) => {
    const row = store.getInstallBySubdomain(subdomain.toLowerCase());
    if (!row || row.status !== "ready" || row.suspended) {
      return reply.code(404).type("text/html").send("<!doctype html><title>Not ready</title><p>This tenant app is not ready.</p>");
    }
    const tenant = toPublicTenantApp(row);
    return sendHtml(reply, tenantAppHtml({ tenant, surface, assetBase: tenantAssetBase(tenant.subdomain, onTenantHost) }));
  };

  app.get("/t/:subdomain", async (req, reply) => {
    const { subdomain } = req.params as { subdomain: string };
    return sendTenantPage(req, reply, subdomain, "guest", false);
  });
  app.get("/t/:subdomain/", async (req, reply) => {
    const { subdomain } = req.params as { subdomain: string };
    return sendTenantPage(req, reply, subdomain, "guest", false);
  });
  app.get("/t/:subdomain/admin", async (req, reply) => {
    const { subdomain } = req.params as { subdomain: string };
    return sendTenantPage(req, reply, subdomain, "admin", false);
  });
  app.get("/t/:subdomain/guest", async (req, reply) => {
    const { subdomain } = req.params as { subdomain: string };
    return reply.redirect(`/t/${encodeURIComponent(subdomain)}/`, 302);
  });
  app.get("/t/:subdomain/staff", async (req, reply) => {
    const { subdomain } = req.params as { subdomain: string };
    return reply.redirect(`/t/${encodeURIComponent(subdomain)}/admin`, 302);
  });
  app.get("/t/:subdomain/manifest.webmanifest", async (req, reply) => {
    const { subdomain } = req.params as { subdomain: string };
    const row = store.getInstallBySubdomain(subdomain.toLowerCase());
    if (!row || row.status !== "ready") return reply.code(404).send({ error: "not_found" });
    return reply
      .type("application/manifest+json")
      .send(tenantManifest({ tenant: toPublicTenantApp(row), surface: surfaceFromQuery(req), assetBase: tenantAssetBase(row.subdomain, false) }));
  });
  app.get("/t/:subdomain/sw.js", async (req, reply) => {
    const { subdomain } = req.params as { subdomain: string };
    return reply
      .header("Service-Worker-Allowed", `/t/${subdomain}/`)
      .type("text/javascript")
      .send(tenantServiceWorker(tenantAssetBase(subdomain, false)));
  });
  app.get("/t/:subdomain/tenant-app.js", async (_req, reply) => {
    return reply.type("text/javascript").send(tenantAppScript());
  });
  app.get("/t/:subdomain/icons/:size", async (req, reply) => {
    const { size } = req.params as { size: string };
    const px = size === "512.png" ? 512 : 192;
    return reply.type("image/png").send(pngIcon(px, [13, 122, 111]));
  });

  app.get("/", async (req, reply) => {
    const subdomain = tenantSubdomainFromHost(req.hostname);
    if (!subdomain) return reply.callNotFound();
    return sendTenantPage(req, reply, subdomain, "guest", true);
  });
  app.get("/admin", async (req, reply) => {
    const subdomain = tenantSubdomainFromHost(req.hostname);
    if (!subdomain) return reply.callNotFound();
    return sendTenantPage(req, reply, subdomain, "admin", true);
  });
  app.get("/guest", async (req, reply) => {
    const subdomain = tenantSubdomainFromHost(req.hostname);
    if (!subdomain) return reply.callNotFound();
    return reply.redirect("/", 302);
  });
  app.get("/staff", async (req, reply) => {
    const subdomain = tenantSubdomainFromHost(req.hostname);
    if (!subdomain) return reply.callNotFound();
    return reply.redirect("/admin", 302);
  });
  app.get("/manifest.webmanifest", async (req, reply) => {
    const subdomain = tenantSubdomainFromHost(req.hostname);
    if (!subdomain) return reply.callNotFound();
    const row = store.getInstallBySubdomain(subdomain);
    if (!row || row.status !== "ready") return reply.code(404).send({ error: "not_found" });
    return reply
      .type("application/manifest+json")
      .send(tenantManifest({ tenant: toPublicTenantApp(row), surface: surfaceFromQuery(req), assetBase: "" }));
  });
  app.get("/sw.js", async (req, reply) => {
    const subdomain = tenantSubdomainFromHost(req.hostname);
    if (!subdomain) return reply.callNotFound();
    return reply.header("Service-Worker-Allowed", "/").type("text/javascript").send(tenantServiceWorker(""));
  });
  app.get("/tenant-app.js", async (req, reply) => {
    if (!tenantSubdomainFromHost(req.hostname)) return reply.callNotFound();
    return reply.type("text/javascript").send(tenantAppScript());
  });
  app.get("/icons/:size", async (req, reply) => {
    if (!tenantSubdomainFromHost(req.hostname)) return reply.callNotFound();
    const { size } = req.params as { size: string };
    const px = size === "512.png" ? 512 : 192;
    return reply.type("image/png").send(pngIcon(px, [13, 122, 111]));
  });
}
