import { featuresForVertical, tenantDeliverables } from "@lifeos-portal/shared";
import { newId, randomToken, hashSecret } from "../lib/crypto.js";
import { HttpError } from "../lib/http.js";
import { hashPassword, verifyPassword } from "../lib/password.js";
import type { PortalInstall, PortalStore } from "../store.js";
import { publicBranding, type StaffActivity } from "./tenant-site.js";

export type HotelStaffRole = "owner" | "front_desk" | "restaurant" | "bar" | "housekeeping" | "rider";
export type OrderFulfillment = "walk_in" | "takeaway";
export type HotelHousekeep = "ready" | "occupied" | "dirty" | "cleaning";
export type HotelOrderKind = "restaurant" | "bar" | "room_service";
export type HotelOrderStatus = "received" | "preparing" | "ready" | "delivered";
export type HotelBookingStatus = "confirmed" | "checked_in" | "checked_out";

export type HotelRoom = {
  id: string;
  name: string;
  beds: string;
  nightlyMinor: number;
  housekeep: HotelHousekeep;
  photoUrl?: string;
};

export type HotelBooking = {
  id: string;
  roomId: string;
  roomName: string;
  guestName: string;
  guestEmail: string;
  checkIn: string;
  checkOut: string;
  nights: number;
  totalMinor: number;
  status: HotelBookingStatus;
  createdAt: string;
};

export type HotelMenuItem = {
  id: string;
  name: string;
  kind: HotelOrderKind;
  amountMinor: number;
  description: string;
  photoUrl?: string;
};

export type HotelOrder = {
  id: string;
  item: string;
  kind: HotelOrderKind;
  quantity: number;
  amountMinor: number;
  roomName?: string;
  guestName: string;
  guestEmail?: string;
  fulfillment?: OrderFulfillment;
  tableName?: string;
  seats?: number;
  address?: string;
  lat?: number;
  lng?: number;
  status: HotelOrderStatus;
  createdAt: string;
  placedBy?: "guest" | "staff";
};

export type HotelStaff = {
  id: string;
  name: string;
  email: string;
  passwordHash: string;
  role: HotelStaffRole;
  createdAt: string;
};

export type HotelStaffSession = {
  tokenHash: string;
  staffId: string;
  expiresAt: string;
};

export type HotelTable = { id: string; name: string; seats: number };

export type HotelProperty = {
  subdomain: string;
  rooms: HotelRoom[];
  bookings: HotelBooking[];
  orders: HotelOrder[];
  menu: HotelMenuItem[];
  tables: HotelTable[];
  staff: HotelStaff[];
  sessions: HotelStaffSession[];
  activity: StaffActivity[];
};

export type HotelOwnerSeed = {
  email?: string;
  name?: string;
  password?: string;
};

const properties = new Map<string, HotelProperty>();
const DEFAULT_OWNER_PASSWORD = "hotel-owner";

const SEED_ROOMS: Array<Omit<HotelRoom, "id">> = [
  { name: "Deluxe King", beds: "1 king", nightlyMinor: 18000, housekeep: "ready" },
  { name: "Twin Garden", beds: "2 twins", nightlyMinor: 14000, housekeep: "ready" },
  { name: "Junior Suite", beds: "1 king + sofa", nightlyMinor: 26000, housekeep: "ready" },
  { name: "Standard Queen", beds: "1 queen", nightlyMinor: 11000, housekeep: "ready" },
  { name: "Family Twin", beds: "2 queens", nightlyMinor: 20000, housekeep: "ready" },
  { name: "Executive King", beds: "1 king", nightlyMinor: 22000, housekeep: "ready" },
];

const SEED_MENU: Array<Omit<HotelMenuItem, "id">> = [
  { name: "Club sandwich", kind: "restaurant", amountMinor: 3500, description: "Chicken, bacon, and fries" },
  { name: "Continental breakfast", kind: "restaurant", amountMinor: 2800, description: "Eggs, toast, fruit, and tea" },
  { name: "Grilled catch", kind: "restaurant", amountMinor: 6200, description: "Day catch with jollof rice" },
  { name: "Jollof platter", kind: "restaurant", amountMinor: 4500, description: "Smoky rice, plantain, and stew" },
  { name: "Still water", kind: "bar", amountMinor: 800, description: "Chilled 75cl" },
  { name: "Lager", kind: "bar", amountMinor: 1500, description: "Draft pint" },
  { name: "Red wine", kind: "bar", amountMinor: 3200, description: "House glass" },
  { name: "Mojito", kind: "bar", amountMinor: 2800, description: "Mint, lime, rum" },
  { name: "Ginger beer", kind: "bar", amountMinor: 1200, description: "Non-alcoholic" },
  { name: "Late-night soup", kind: "room_service", amountMinor: 2400, description: "Pepper soup to the room" },
];

function nightsBetween(checkIn: string, checkOut: string) {
  const start = Date.parse(checkIn);
  const end = Date.parse(checkOut);
  if (!Number.isFinite(start) || !Number.isFinite(end) || end <= start) {
    throw new HttpError("Check-out must be after check-in.", 400, "invalid_dates");
  }
  return Math.max(1, Math.round((end - start) / 86_400_000));
}

function publicStaff(staff: HotelStaff) {
  return { id: staff.id, name: staff.name, email: staff.email, role: staff.role, createdAt: staff.createdAt };
}

function save(store: PortalStore | undefined, install: PortalInstall, row: HotelProperty) {
  properties.set(row.subdomain, row);
  if (store) store.updateInstall(install.id, { hotelOps: row });
}

function seedTables(): HotelTable[] {
  return ["T1", "T2", "T3", "T4", "T5", "T6"].map((name, i) => ({
    id: newId("tbl"),
    name,
    seats: i < 2 ? 2 : i < 4 ? 4 : 6,
  }));
}

function emptyProperty(slug: string, seed?: HotelOwnerSeed): HotelProperty {
  const email = (seed?.email ?? `owner@${slug}.getlifeos.app`).trim().toLowerCase();
  return {
    subdomain: slug,
    rooms: SEED_ROOMS.map((room) => ({ ...room, id: newId("rm") })),
    bookings: [],
    orders: [],
    menu: SEED_MENU.map((item) => ({ ...item, id: newId("mn") })),
    tables: seedTables(),
    staff: [
      {
        id: newId("hst"),
        name: seed?.name?.trim() || "Hotel owner",
        email,
        passwordHash: hashPassword(seed?.password?.trim() || DEFAULT_OWNER_PASSWORD),
        role: "owner",
        createdAt: new Date().toISOString(),
      },
    ],
    sessions: [],
    activity: [],
  };
}

export function seedHotelProperty(install: PortalInstall, store?: PortalStore, seed?: HotelOwnerSeed) {
  if (install.verticalId !== "hotel") return;
  const slug = install.subdomain.toLowerCase();
  if (properties.has(slug)) return;
  const stored = install.hotelOps as HotelProperty | undefined;
  const row =
    stored && Array.isArray(stored.rooms)
      ? {
          subdomain: slug,
          rooms: stored.rooms,
          bookings: stored.bookings ?? [],
          orders: stored.orders ?? [],
          menu: stored.menu?.length ? stored.menu : SEED_MENU.map((item) => ({ ...item, id: newId("mn") })),
          tables: stored.tables?.length ? stored.tables : seedTables(),
          staff: stored.staff?.length ? stored.staff : emptyProperty(slug, seed).staff,
          sessions: stored.sessions ?? [],
          activity: stored.activity ?? [],
        }
      : emptyProperty(slug, seed);
  save(store, install, row);
}

function property(subdomain: string) {
  return properties.get(subdomain.toLowerCase());
}

function requireProperty(install: PortalInstall, store?: PortalStore) {
  seedHotelProperty(install, store);
  const row = property(install.subdomain);
  if (!row) throw new HttpError("Hotel is not ready.", 404, "not_found");
  return row;
}

export function hotelAppPayload(install: PortalInstall, store?: PortalStore) {
  const row = requireProperty(install, store);
  const deliverables = tenantDeliverables(install.subdomain, install.customDomain);
  return {
    tenant: {
      subdomain: install.subdomain,
      displayName: install.displayName,
      verticalId: install.verticalId,
      osId: install.osId,
      hostname: deliverables.hostname,
      guestAppUrl: deliverables.guestApp.url,
      adminDashboardUrl: deliverables.adminDashboard.url,
      status: install.status,
      branding: publicBranding(
        install,
        row.bookings.map((item) => ({ name: item.guestName, visit: `Stayed in ${item.roomName}` })).concat(
          row.orders.map((item) => ({ name: item.guestName, visit: `Ordered ${item.item}` })),
        ),
      ),
      features: featuresForVertical(install.osId, install.verticalId),
      ownerHint: row.staff.find((staff) => staff.role === "owner")?.email ?? `owner@${row.subdomain}.getlifeos.app`,
      staffAppUrl: deliverables.staffApp.url,
    },
    rooms: row.rooms,
    menu: row.menu,
    tables: row.tables,
  };
}

export function guestStayPayload(install: PortalInstall, guestEmail: string, store?: PortalStore) {
  const row = requireProperty(install, store);
  const email = guestEmail.trim().toLowerCase();
  return {
    bookings: row.bookings.filter((item) => item.guestEmail === email),
    orders: row.orders.filter((item) => item.guestEmail === email),
  };
}

export function hotelOpsPayload(install: PortalInstall, staff: HotelStaff, store?: PortalStore) {
  const row = requireProperty(install, store);
  const orders =
    staff.role === "restaurant"
      ? row.orders.filter((item) => item.kind === "restaurant" || item.kind === "room_service")
      : staff.role === "bar"
        ? row.orders.filter((item) => item.kind === "bar")
        : staff.role === "rider"
          ? row.orders.filter((item) => item.fulfillment === "takeaway" && (item.status === "ready" || item.status === "delivered"))
          : row.orders;
  return {
    staff: publicStaff(staff),
    rooms: row.rooms,
    bookings: row.bookings,
    orders,
    menu: row.menu,
    tables: row.tables,
    team: staff.role === "owner" ? row.staff.map(publicStaff) : undefined,
    activity: staff.role === "owner" ? row.activity.slice(0, 80) : undefined,
  };
}

function logHotelActivity(
  row: HotelProperty,
  actor: { id?: string; name: string; role: string },
  action: string,
  detail: string,
) {
  row.activity.unshift({
    id: newId("act"),
    at: new Date().toISOString(),
    staffId: actor.id ?? "guest",
    staffName: actor.name,
    role: actor.role,
    action,
    detail,
  });
  row.activity = row.activity.slice(0, 200);
}

export function bookHotelRoom(
  install: PortalInstall,
  input: { roomId: string; guestName: string; guestEmail: string; checkIn: string; checkOut: string },
  store?: PortalStore,
) {
  const row = requireProperty(install, store);
  const room = row.rooms.find((item) => item.id === input.roomId);
  if (!room || room.housekeep !== "ready") {
    throw new HttpError("That room is not available.", 409, "room_unavailable");
  }
  const nights = nightsBetween(input.checkIn, input.checkOut);
  const booking: HotelBooking = {
    id: newId("bkg"),
    roomId: room.id,
    roomName: room.name,
    guestName: input.guestName.trim(),
    guestEmail: input.guestEmail.trim().toLowerCase(),
    checkIn: input.checkIn,
    checkOut: input.checkOut,
    nights,
    totalMinor: room.nightlyMinor * nights,
    status: "confirmed",
    createdAt: new Date().toISOString(),
  };
  room.housekeep = "occupied";
  row.bookings.unshift(booking);
  logHotelActivity(row, { name: booking.guestName, role: "guest" }, "booking.create", `${booking.roomName} · ${booking.checkIn} → ${booking.checkOut}`);
  save(store, install, row);
  return booking;
}

export function placeHotelOrder(
  install: PortalInstall,
  input: {
    item: string;
    quantity?: number;
    guestName: string;
    guestEmail?: string;
    roomName?: string;
    kind?: HotelOrderKind;
    fulfillment?: OrderFulfillment;
    tableName?: string;
    seats?: number;
    address?: string;
    lat?: number;
    lng?: number;
    placedBy?: "guest" | "staff";
    actor?: HotelStaff;
  },
  store?: PortalStore,
) {
  const row = requireProperty(install, store);
  const quantity = Math.max(1, Math.min(12, input.quantity ?? 1));
  const menuItem = row.menu.find((item) => item.name === input.item.trim());
  const kind = input.kind ?? menuItem?.kind ?? "room_service";
  const fulfillment =
    input.fulfillment ?? (input.address || input.lat != null ? "takeaway" : "walk_in");
  if (fulfillment === "walk_in" && input.fulfillment === "walk_in" && row.tables.length && !input.tableName?.trim()) {
    throw new HttpError("Pick a table and chairs for a walk-in order.", 400, "table_required");
  }
  if (fulfillment === "takeaway" && !input.address?.trim() && (input.lat == null || input.lng == null)) {
    throw new HttpError("Takeaway needs a written address or a live map pin.", 400, "location_required");
  }
  const order: HotelOrder = {
    id: newId("ord"),
    item: input.item.trim(),
    kind,
    quantity,
    amountMinor: (menuItem?.amountMinor ?? 2500) * quantity,
    roomName: input.roomName,
    guestName: input.guestName.trim(),
    guestEmail: input.guestEmail?.trim().toLowerCase(),
    fulfillment,
    tableName: input.tableName,
    seats: input.seats,
    address: input.address,
    lat: input.lat,
    lng: input.lng,
    status: "received",
    createdAt: new Date().toISOString(),
    placedBy: input.placedBy ?? (input.actor ? "staff" : "guest"),
  };
  row.orders.unshift(order);
  logHotelActivity(
    row,
    input.actor ?? { name: order.guestName, role: "guest" },
    "order.create",
    `${order.item} for ${order.guestName}`,
  );
  save(store, install, row);
  return order;
}

export function updateHotelBookingStatus(
  install: PortalInstall,
  bookingId: string,
  status: HotelBookingStatus,
  store?: PortalStore,
) {
  const row = requireProperty(install, store);
  const booking = row.bookings.find((item) => item.id === bookingId);
  if (!booking) throw new HttpError("Booking not found.", 404, "not_found");
  booking.status = status;
  const room = row.rooms.find((item) => item.id === booking.roomId);
  if (status === "checked_in" && room) room.housekeep = "occupied";
  if (status === "checked_out" && room) room.housekeep = "dirty";
  if (status === "confirmed" && room && room.housekeep === "dirty") room.housekeep = "occupied";
  logHotelActivity(row, { name: booking.guestName, role: "guest" }, `booking.${status}`, `${booking.roomName} · ${booking.guestName}`);
  save(store, install, row);
  return booking;
}

export function guestSelfCheck(
  install: PortalInstall,
  input: { guestEmail: string; guestName?: string; bookingId?: string; status: "checked_in" | "checked_out" },
  store?: PortalStore,
) {
  const row = requireProperty(install, store);
  const email = input.guestEmail.trim().toLowerCase();
  const booking = input.bookingId
    ? row.bookings.find((item) => item.id === input.bookingId && item.guestEmail === email)
    : row.bookings.find(
        (item) =>
          item.guestEmail === email &&
          (input.status === "checked_in" ? item.status === "confirmed" : item.status === "checked_in"),
      );
  if (!booking) throw new HttpError("No matching stay was found.", 404, "not_found");
  if (input.guestName && booking.guestName.toLowerCase() !== input.guestName.trim().toLowerCase()) {
    throw new HttpError("Name does not match this stay.", 403, "forbidden");
  }
  return updateHotelBookingStatus(install, booking.id, input.status, store);
}

export function updateHotelOrderStatus(
  install: PortalInstall,
  orderId: string,
  status: HotelOrderStatus,
  store?: PortalStore,
) {
  const row = requireProperty(install, store);
  const order = row.orders.find((item) => item.id === orderId);
  if (!order) throw new HttpError("Order not found.", 404, "not_found");
  order.status = status;
  logHotelActivity(row, { name: order.guestName, role: "staff" }, `order.${status}`, `${order.item} · ${order.guestName}`);
  save(store, install, row);
  return order;
}

export function noteHotelActivity(
  install: PortalInstall,
  staff: HotelStaff,
  action: string,
  detail: string,
  store?: PortalStore,
) {
  const row = requireProperty(install, store);
  logHotelActivity(row, staff, action, detail);
  save(store, install, row);
}

export function updateRoomHousekeep(
  install: PortalInstall,
  roomId: string,
  housekeep: HotelHousekeep,
  store?: PortalStore,
) {
  const row = requireProperty(install, store);
  const room = row.rooms.find((item) => item.id === roomId);
  if (!room) throw new HttpError("Room not found.", 404, "not_found");
  room.housekeep = housekeep;
  save(store, install, row);
  return room;
}

export function loginHotelStaff(
  install: PortalInstall,
  input: { email: string; password: string; surface?: "admin" | "staff" },
  store?: PortalStore,
) {
  const row = requireProperty(install, store);
  const staff = row.staff.find((item) => item.email === input.email.trim().toLowerCase());
  if (!staff || !verifyPassword(input.password, staff.passwordHash)) {
    throw new HttpError("Staff email or password is wrong.", 401, "unauthorized");
  }
  if (input.surface === "admin" && staff.role !== "owner") {
    throw new HttpError("Use the staff login URL handed to you.", 403, "forbidden");
  }
  if (input.surface === "staff" && staff.role === "owner") {
    throw new HttpError("Owners sign in on the admin dashboard.", 403, "forbidden");
  }
  const token = randomToken();
  row.sessions = row.sessions.filter((item) => Date.parse(item.expiresAt) > Date.now());
  row.sessions.push({
    tokenHash: hashSecret(token),
    staffId: staff.id,
    expiresAt: new Date(Date.now() + 12 * 60 * 60 * 1000).toISOString(),
  });
  save(store, install, row);
  return { token, staff: publicStaff(staff) };
}

export function staffFromToken(install: PortalInstall, token: string | undefined, store?: PortalStore) {
  if (!token) throw new HttpError("Staff login required.", 401, "unauthorized");
  const row = requireProperty(install, store);
  const session = row.sessions.find(
    (item) => item.tokenHash === hashSecret(token) && Date.parse(item.expiresAt) > Date.now(),
  );
  const staff = session ? row.staff.find((item) => item.id === session.staffId) : undefined;
  if (!staff) throw new HttpError("Staff login required.", 401, "unauthorized");
  return staff;
}

export function createHotelStaff(
  install: PortalInstall,
  input: { name: string; email: string; password: string; role: HotelStaffRole },
  store?: PortalStore,
) {
  const row = requireProperty(install, store);
  const email = input.email.trim().toLowerCase();
  if (row.staff.some((item) => item.email === email)) {
    throw new HttpError("That staff email is already in use.", 409, "conflict");
  }
  if (input.role === "owner") throw new HttpError("Create a department role, not another owner.", 400, "invalid_role");
  const staff: HotelStaff = {
    id: newId("hst"),
    name: input.name.trim(),
    email,
    passwordHash: hashPassword(input.password),
    role: input.role,
    createdAt: new Date().toISOString(),
  };
  row.staff.push(staff);
  const owner = row.staff.find((item) => item.role === "owner");
  if (owner) logHotelActivity(row, owner, "staff.create", `${staff.name} · ${staff.role}`);
  save(store, install, row);
  return publicStaff(staff);
}

export function upsertHotelRoom(
  install: PortalInstall,
  input: { id?: string; name: string; beds: string; nightlyMinor: number; photoUrl?: string; housekeep?: HotelHousekeep },
  actor: HotelStaff,
  store?: PortalStore,
) {
  const row = requireProperty(install, store);
  if (input.id) {
    const room = row.rooms.find((item) => item.id === input.id);
    if (!room) throw new HttpError("Room not found.", 404, "not_found");
    room.name = input.name.trim();
    room.beds = input.beds.trim();
    room.nightlyMinor = input.nightlyMinor;
    if (input.photoUrl !== undefined) room.photoUrl = input.photoUrl;
    if (input.housekeep) room.housekeep = input.housekeep;
    logHotelActivity(row, actor, "room.update", room.name);
    save(store, install, row);
    return room;
  }
  const room: HotelRoom = {
    id: newId("rm"),
    name: input.name.trim(),
    beds: input.beds.trim(),
    nightlyMinor: input.nightlyMinor,
    housekeep: input.housekeep ?? "ready",
    photoUrl: input.photoUrl,
  };
  row.rooms.unshift(room);
  logHotelActivity(row, actor, "room.create", room.name);
  save(store, install, row);
  return room;
}

export function upsertHotelMenuItem(
  install: PortalInstall,
  input: { id?: string; name: string; kind: HotelOrderKind; amountMinor: number; description: string; photoUrl?: string },
  actor: HotelStaff,
  store?: PortalStore,
) {
  const row = requireProperty(install, store);
  if (input.id) {
    const item = row.menu.find((rowItem) => rowItem.id === input.id);
    if (!item) throw new HttpError("Item not found.", 404, "not_found");
    item.name = input.name.trim();
    item.kind = input.kind;
    item.amountMinor = input.amountMinor;
    item.description = input.description.trim();
    if (input.photoUrl !== undefined) item.photoUrl = input.photoUrl;
    logHotelActivity(row, actor, "menu.update", item.name);
    save(store, install, row);
    return item;
  }
  const item: HotelMenuItem = {
    id: newId("mn"),
    name: input.name.trim(),
    kind: input.kind,
    amountMinor: input.amountMinor,
    description: input.description.trim(),
    photoUrl: input.photoUrl,
  };
  row.menu.unshift(item);
  logHotelActivity(row, actor, "menu.create", item.name);
  save(store, install, row);
  return item;
}

export function assertStaffRole(staff: HotelStaff, roles: HotelStaffRole[]) {
  if (staff.role === "owner") return;
  if (!roles.includes(staff.role)) throw new HttpError("This dashboard is not assigned to you.", 403, "forbidden");
}

export const DEFAULT_HOTEL_OWNER_PASSWORD = DEFAULT_OWNER_PASSWORD;
