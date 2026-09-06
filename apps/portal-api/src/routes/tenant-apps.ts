import type { FastifyInstance, FastifyReply, FastifyRequest } from "fastify";
import { z } from "zod";
import type { PortalStore } from "../store.js";
import type { DistributorClient } from "../services/distributor.js";
import { HttpError } from "../lib/http.js";
import { findInstallByHost, updateTenantSite } from "../services/tenant-site.js";
import {
  assertDiningRole,
  createDiningStaff,
  createDiningSupply,
  diningAppPayload,
  diningOpsPayload,
  diningStaffFromToken,
  diningStayPayload,
  isDiningVertical,
  loginDiningStaff,
  placeDiningOrder,
  updateDiningOrderStatus,
  updateDiningSupply,
  upsertDiningMenuItem,
} from "../services/dining-ops.js";
import {
  assertStaffRole,
  bookHotelRoom,
  createHotelStaff,
  createHotelSupply,
  guestSelfCheck,
  guestStayPayload,
  hotelAppPayload,
  hotelOpsPayload,
  loginHotelStaff,
  placeHotelOrder,
  staffFromToken,
  updateHotelBookingStatus,
  updateHotelOrderStatus,
  updateHotelSupply,
  updateRoomHousekeep,
  upsertHotelMenuItem,
  upsertHotelRoom,
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

const imageField = z
  .string()
  .max(700_000)
  .refine((value) => value.startsWith("data:image/") || /^https?:\/\//i.test(value));
const fqdn = z
  .string()
  .min(4)
  .regex(/^[a-z0-9]([a-z0-9-]*[a-z0-9])?(\.[a-z0-9]([a-z0-9-]*[a-z0-9])?)+$/i);

export async function registerTenantAppRoutes(
  app: FastifyInstance,
  store: PortalStore,
  distributor?: DistributorClient,
) {
  app.get("/public/tenants/resolve", async (req, reply) => {
    const host = String((req.query as { host?: string }).host ?? req.hostname ?? "");
    const row = findInstallByHost(store, host);
    if (!row || row.status !== "ready" || row.suspended) {
      return reply.code(404).send({ error: "not_found", message: "Tenant app is not ready." });
    }
    return { tenant: { subdomain: row.subdomain, verticalId: row.verticalId } };
  });

  app.get("/public/tenants/:subdomain", async (req, reply) => {
    const { subdomain } = req.params as { subdomain: string };
    const row = store.getInstallBySubdomain(subdomain.toLowerCase());
    if (!row || row.status !== "ready" || row.suspended) {
      return reply.code(404).send({ error: "not_found", message: "Tenant app is not ready." });
    }
    if (row.verticalId === "hotel") return hotelAppPayload(row, store);
    if (isDiningVertical(row.verticalId)) return diningAppPayload(row, store);
    return { tenant: toPublicTenantApp(row) };
  });

  function readyInstall(subdomain: string) {
    const row = store.getInstallBySubdomain(subdomain.toLowerCase());
    if (!row || row.status !== "ready" || row.suspended) {
      throw new HttpError("Tenant app is not ready.", 404, "not_found");
    }
    return row;
  }

  function hotelInstall(subdomain: string, readyOnly = true) {
    const row = store.getInstallBySubdomain(subdomain.toLowerCase());
    if (!row || row.verticalId !== "hotel" || (readyOnly && (row.status !== "ready" || row.suspended))) {
      throw new HttpError("Hotel is not ready.", 404, "not_found");
    }
    return row;
  }

  function staffToken(req: FastifyRequest) {
    const header = req.headers["x-hotel-staff"];
    return typeof header === "string" ? header : undefined;
  }

  function sendHotelError(reply: FastifyReply, err: unknown) {
    if (err instanceof HttpError) return reply.code(err.statusCode).send({ error: err.code, message: err.message });
    throw err;
  }

  app.get("/public/tenants/:subdomain/stay", async (req, reply) => {
    try {
      const { subdomain } = req.params as { subdomain: string };
      const email = z.string().email().parse((req.query as { email?: string }).email);
      const row = readyInstall(subdomain);
      if (isDiningVertical(row.verticalId)) return diningStayPayload(row, email, store);
      return guestStayPayload(hotelInstall(subdomain), email, store);
    } catch (err) {
      return sendHotelError(reply, err);
    }
  });

  app.post("/public/tenants/:subdomain/bookings", async (req, reply) => {
    try {
      const { subdomain } = req.params as { subdomain: string };
      const body = z
        .object({
          roomId: z.string().min(1),
          guestName: z.string().min(1),
          guestEmail: z.string().email(),
          checkIn: z.string().min(8),
          checkOut: z.string().min(8),
        })
        .parse(req.body);
      return reply.code(201).send({ booking: bookHotelRoom(hotelInstall(subdomain), body, store) });
    } catch (err) {
      return sendHotelError(reply, err);
    }
  });

  app.post("/public/tenants/:subdomain/orders", async (req, reply) => {
    try {
      const { subdomain } = req.params as { subdomain: string };
      const row = store.getInstallBySubdomain(subdomain.toLowerCase());
      if (!row || row.status !== "ready") throw new HttpError("Tenant app is not ready.", 404, "not_found");
      if (isDiningVertical(row.verticalId)) {
        const body = z
          .object({
            item: z.string().min(1),
            quantity: z.number().int().positive().max(12).optional(),
            guestName: z.string().min(1),
            guestEmail: z.string().email().optional(),
            tableName: z.string().optional(),
            address: z.string().optional(),
            seats: z.number().int().positive().max(20).optional(),
            fulfillment: z.enum(["walk_in", "takeaway"]).optional(),
            lat: z.number().min(-90).max(90).optional(),
            lng: z.number().min(-180).max(180).optional(),
            kind: z.enum(["food", "drink"]).optional(),
          })
          .parse(req.body);
        const actor = staffToken(req) ? diningStaffFromToken(row, staffToken(req), store) : undefined;
        return reply.code(201).send({ order: placeDiningOrder(row, { ...body, actor }, store) });
      }
      const body = z
        .object({
          item: z.string().min(1),
          quantity: z.number().int().positive().max(12).optional(),
          guestName: z.string().min(1),
          guestEmail: z.string().email().optional(),
          roomName: z.string().optional(),
          tableName: z.string().optional(),
          address: z.string().optional(),
          seats: z.number().int().positive().max(20).optional(),
          fulfillment: z.enum(["walk_in", "takeaway"]).optional(),
          lat: z.number().min(-90).max(90).optional(),
          lng: z.number().min(-180).max(180).optional(),
          kind: z.enum(["restaurant", "bar", "room_service"]).optional(),
        })
        .parse(req.body);
      const hotel = hotelInstall(subdomain);
      const actor = staffToken(req) ? staffFromToken(hotel, staffToken(req), store) : undefined;
      return reply.code(201).send({ order: placeHotelOrder(hotel, { ...body, actor }, store) });
    } catch (err) {
      return sendHotelError(reply, err);
    }
  });

  app.post("/public/tenants/:subdomain/stay/check-in", async (req, reply) => {
    try {
      const { subdomain } = req.params as { subdomain: string };
      const body = z
        .object({
          guestEmail: z.string().email(),
          guestName: z.string().optional(),
          bookingId: z.string().optional(),
        })
        .parse(req.body);
      return { booking: guestSelfCheck(hotelInstall(subdomain), { ...body, status: "checked_in" }, store) };
    } catch (err) {
      return sendHotelError(reply, err);
    }
  });

  app.post("/public/tenants/:subdomain/stay/check-out", async (req, reply) => {
    try {
      const { subdomain } = req.params as { subdomain: string };
      const body = z
        .object({
          guestEmail: z.string().email(),
          guestName: z.string().optional(),
          bookingId: z.string().optional(),
        })
        .parse(req.body);
      return { booking: guestSelfCheck(hotelInstall(subdomain), { ...body, status: "checked_out" }, store) };
    } catch (err) {
      return sendHotelError(reply, err);
    }
  });

  app.post("/public/tenants/:subdomain/staff/login", async (req, reply) => {
    try {
      const { subdomain } = req.params as { subdomain: string };
      const row = readyInstall(subdomain);
      const body = z
        .object({ email: z.string().email(), password: z.string().min(1), surface: z.enum(["admin", "staff"]).optional() })
        .parse(req.body);
      if (isDiningVertical(row.verticalId)) return loginDiningStaff(row, body, store);
      return loginHotelStaff(hotelInstall(subdomain), body, store);
    } catch (err) {
      return sendHotelError(reply, err);
    }
  });

  app.get("/public/tenants/:subdomain/ops", async (req, reply) => {
    try {
      const { subdomain } = req.params as { subdomain: string };
      const row = readyInstall(subdomain);
      if (isDiningVertical(row.verticalId)) {
        const staff = diningStaffFromToken(row, staffToken(req), store);
        return diningOpsPayload(row, staff, store);
      }
      const hotel = hotelInstall(subdomain);
      const staff = staffFromToken(hotel, staffToken(req), store);
      return hotelOpsPayload(hotel, staff, store);
    } catch (err) {
      return sendHotelError(reply, err);
    }
  });

  app.post("/public/tenants/:subdomain/staff", async (req, reply) => {
    try {
      const { subdomain } = req.params as { subdomain: string };
      const row = readyInstall(subdomain);
      if (isDiningVertical(row.verticalId)) {
        const actor = diningStaffFromToken(row, staffToken(req), store);
        assertDiningRole(actor, ["owner"]);
        const body = z
          .object({
            name: z.string().min(1),
            email: z.string().email(),
            password: z.string().min(6),
            role: z.enum(["kitchen", "counter", "rider"]),
          })
          .parse(req.body);
        return reply.code(201).send({
          staff: createDiningStaff(row, body, store),
          loginUrl: diningAppPayload(row, store).tenant.staffAppUrl,
        });
      }
      const hotel = hotelInstall(subdomain);
      const actor = staffFromToken(hotel, staffToken(req), store);
      assertStaffRole(actor, ["owner"]);
      const body = z
        .object({
          name: z.string().min(1),
          email: z.string().email(),
          password: z.string().min(6),
          role: z.enum(["front_desk", "restaurant", "bar", "housekeeping", "rider"]),
        })
        .parse(req.body);
      return reply.code(201).send({
        staff: createHotelStaff(hotel, body, store),
        loginUrl: hotelAppPayload(hotel, store).tenant.staffAppUrl,
      });
    } catch (err) {
      return sendHotelError(reply, err);
    }
  });

  app.patch("/public/tenants/:subdomain/site", async (req, reply) => {
    try {
      const row = readyInstall((req.params as { subdomain: string }).subdomain);
      const actor = isDiningVertical(row.verticalId)
        ? diningStaffFromToken(row, staffToken(req), store)
        : staffFromToken(hotelInstall(row.subdomain), staffToken(req), store);
      if (actor.role !== "owner") throw new HttpError("Only the owner can edit the branded app.", 403, "forbidden");
      const body = z
        .object({
          logoUrl: imageField.optional(),
          primaryColor: z.string().max(20).optional(),
          backgroundUrl: imageField.optional(),
          heroTitle: z.string().max(80).optional(),
          writeup: z.string().max(2000).optional(),
          phone: z.string().max(40).optional(),
          email: z.string().email().optional().or(z.literal("")),
          address: z.string().max(200).optional(),
          dashboardStyle: z.enum(["console", "greetings"]).optional(),
          testimonials: z
            .array(z.object({ name: z.string().min(1).max(80), quote: z.string().min(1).max(280), visit: z.string().max(80) }))
            .max(3)
            .optional(),
        })
        .parse(req.body);
      return { site: updateTenantSite(row, body, store) };
    } catch (err) {
      return sendHotelError(reply, err);
    }
  });

  app.post("/public/tenants/:subdomain/catalog/rooms", async (req, reply) => {
    try {
      const hotel = hotelInstall((req.params as { subdomain: string }).subdomain);
      const actor = staffFromToken(hotel, staffToken(req), store);
      assertStaffRole(actor, ["front_desk"]);
      const body = z
        .object({
          id: z.string().optional(),
          name: z.string().min(1),
          beds: z.string().min(1),
          nightlyMinor: z.number().int().positive(),
          photoUrl: imageField.optional(),
          housekeep: z.enum(["ready", "occupied", "dirty", "cleaning"]).optional(),
        })
        .parse(req.body);
      return reply.code(body.id ? 200 : 201).send({ room: upsertHotelRoom(hotel, body, actor, store) });
    } catch (err) {
      return sendHotelError(reply, err);
    }
  });

  app.post("/public/tenants/:subdomain/catalog/items", async (req, reply) => {
    try {
      const row = readyInstall((req.params as { subdomain: string }).subdomain);
      if (isDiningVertical(row.verticalId)) {
        const actor = diningStaffFromToken(row, staffToken(req), store);
        assertDiningRole(actor, ["kitchen", "counter"]);
        const body = z
          .object({
            id: z.string().optional(),
            name: z.string().min(1),
            kind: z.enum(["food", "drink"]),
            amountMinor: z.number().int().positive(),
            description: z.string().max(240).optional(),
            photoUrl: imageField.optional(),
          })
          .parse(req.body);
        return reply
          .code(body.id ? 200 : 201)
          .send({ item: upsertDiningMenuItem(row, { ...body, description: body.description ?? "" }, actor, store) });
      }
      const hotel = hotelInstall(row.subdomain);
      const actor = staffFromToken(hotel, staffToken(req), store);
      assertStaffRole(actor, ["restaurant", "bar"]);
      const body = z
        .object({
          id: z.string().optional(),
          name: z.string().min(1),
          kind: z.enum(["restaurant", "bar", "room_service"]),
          amountMinor: z.number().int().positive(),
          description: z.string().max(240).optional(),
          photoUrl: imageField.optional(),
        })
        .parse(req.body);
      return reply
        .code(body.id ? 200 : 201)
        .send({ item: upsertHotelMenuItem(hotel, { ...body, description: body.description ?? "" }, actor, store) });
    } catch (err) {
      return sendHotelError(reply, err);
    }
  });

  app.post("/public/tenants/:subdomain/domain", async (req, reply) => {
    try {
      const row = readyInstall((req.params as { subdomain: string }).subdomain);
      const actor = isDiningVertical(row.verticalId)
        ? diningStaffFromToken(row, staffToken(req), store)
        : staffFromToken(hotelInstall(row.subdomain), staffToken(req), store);
      if (actor.role !== "owner") throw new HttpError("Only the owner can attach a domain.", 403, "forbidden");
      if (!distributor) throw new HttpError("Domain service is not ready.", 503, "unavailable");
      const body = z.object({ hostname: fqdn, purchase: z.boolean().optional() }).parse(req.body);
      const hostname = body.hostname.toLowerCase();
      if (store.getDomainByHostname(hostname)) throw new HttpError("Domain already attached", 409, "conflict");
      const provisioned = body.purchase
        ? await distributor.purchaseDomain({
            tenantId: row.distributorTenantId,
            subdomain: row.subdomain,
            domain: hostname,
          })
        : await distributor.provisionCustomDomain({
            tenantId: row.distributorTenantId,
            subdomain: row.subdomain,
            customDomain: hostname,
          });
      const domain = store.createDomain({
        installId: row.id,
        distributorTenantId: row.distributorTenantId,
        domainId: provisioned.domainId,
        kind: "custom",
        hostname,
        cnameTarget: provisioned.cnameTarget,
        dnsRecords: provisioned.dnsRecords,
        dnsStatus: provisioned.dnsStatus === "ACTIVE" ? "ACTIVE" : "PENDING",
        sslStatus: provisioned.sslStatus === "ACTIVE" ? "ACTIVE" : "PENDING",
        purchased: Boolean(body.purchase),
      });
      store.updateInstall(row.id, { customDomain: hostname, domainId: provisioned.domainId });
      return reply.code(201).send({
        domain,
        verification: { cnameTarget: provisioned.cnameTarget, dnsRecords: provisioned.dnsRecords },
      });
    } catch (err) {
      return sendHotelError(reply, err);
    }
  });

  app.post("/public/tenants/:subdomain/bookings/:bookingId/status", async (req, reply) => {
    try {
      const { subdomain, bookingId } = req.params as { subdomain: string; bookingId: string };
      const row = hotelInstall(subdomain, false);
      const actor = staffFromToken(row, staffToken(req), store);
      assertStaffRole(actor, ["front_desk"]);
      const body = z.object({ status: z.enum(["confirmed", "checked_in", "checked_out"]) }).parse(req.body);
      return { booking: updateHotelBookingStatus(row, bookingId, body.status, store) };
    } catch (err) {
      return sendHotelError(reply, err);
    }
  });

  app.post("/public/tenants/:subdomain/orders/:orderId/status", async (req, reply) => {
    try {
      const { subdomain, orderId } = req.params as { subdomain: string; orderId: string };
      const ready = readyInstall(subdomain);
      if (isDiningVertical(ready.verticalId)) {
        const actor = diningStaffFromToken(ready, staffToken(req), store);
        assertDiningRole(actor, ["kitchen", "counter", "rider"]);
        const body = z.object({ status: z.enum(["received", "preparing", "ready", "delivered"]) }).parse(req.body);
        return { order: updateDiningOrderStatus(ready, orderId, body.status, store) };
      }
      const row = hotelInstall(subdomain);
      const actor = staffFromToken(row, staffToken(req), store);
      const body = z.object({ status: z.enum(["received", "preparing", "ready", "delivered"]) }).parse(req.body);
      const ops = hotelOpsPayload(row, actor, store);
      const order = ops.orders.find((item) => item.id === orderId);
      if (!order) throw new HttpError("Order not found.", 404, "not_found");
      if (actor.role === "restaurant") assertStaffRole(actor, ["restaurant"]);
      if (actor.role === "bar") assertStaffRole(actor, ["bar"]);
      if (actor.role === "housekeeping" || actor.role === "front_desk") {
        throw new HttpError("This dashboard is not assigned to you.", 403, "forbidden");
      }
      return { order: updateHotelOrderStatus(row, orderId, body.status, store) };
    } catch (err) {
      return sendHotelError(reply, err);
    }
  });

  app.post("/public/tenants/:subdomain/supplies", async (req, reply) => {
    try {
      const { subdomain } = req.params as { subdomain: string };
      const ready = readyInstall(subdomain);
      const body = z
        .object({
          item: z.string().min(1),
          quantity: z.number().int().positive().max(200).optional(),
          note: z.string().max(280).optional(),
          toDepartment: z.enum(["stores", "owner", "housekeeping"]).optional(),
        })
        .parse(req.body);
      if (isDiningVertical(ready.verticalId)) {
        const actor = diningStaffFromToken(ready, staffToken(req), store);
        return reply.code(201).send({ supply: createDiningSupply(ready, actor, body, store) });
      }
      const hotel = hotelInstall(subdomain);
      const actor = staffFromToken(hotel, staffToken(req), store);
      return reply.code(201).send({ supply: createHotelSupply(hotel, actor, body, store) });
    } catch (err) {
      return sendHotelError(reply, err);
    }
  });

  app.post("/public/tenants/:subdomain/supplies/:requestId/status", async (req, reply) => {
    try {
      const { subdomain, requestId } = req.params as { subdomain: string; requestId: string };
      const ready = readyInstall(subdomain);
      const body = z.object({ status: z.enum(["requested", "approved", "fulfilled", "rejected"]) }).parse(req.body);
      if (isDiningVertical(ready.verticalId)) {
        const actor = diningStaffFromToken(ready, staffToken(req), store);
        return { supply: updateDiningSupply(ready, actor, requestId, body.status, store) };
      }
      const hotel = hotelInstall(subdomain);
      const actor = staffFromToken(hotel, staffToken(req), store);
      return { supply: updateHotelSupply(hotel, actor, requestId, body.status, store) };
    } catch (err) {
      return sendHotelError(reply, err);
    }
  });

  app.post("/public/tenants/:subdomain/rooms/:roomId/housekeep", async (req, reply) => {
    try {
      const { subdomain, roomId } = req.params as { subdomain: string; roomId: string };
      const row = hotelInstall(subdomain);
      const actor = staffFromToken(row, staffToken(req), store);
      assertStaffRole(actor, ["housekeeping"]);
      const body = z.object({ housekeep: z.enum(["ready", "occupied", "dirty", "cleaning"]) }).parse(req.body);
      return { room: updateRoomHousekeep(row, roomId, body.housekeep, store) };
    } catch (err) {
      return sendHotelError(reply, err);
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
    return sendTenantPage(req, reply, subdomain, "admin", false);
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
    return sendTenantPage(req, reply, subdomain, "admin", true);
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
