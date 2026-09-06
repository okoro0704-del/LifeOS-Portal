import { featuresForVertical, tenantDeliverables } from "@lifeos-portal/shared";
import { newId, randomToken, hashSecret } from "../lib/crypto.js";
import { HttpError } from "../lib/http.js";
import { hashPassword, verifyPassword } from "../lib/password.js";
import type { PortalInstall, PortalStore } from "../store.js";
import { publicBranding, type StaffActivity } from "./tenant-site.js";

export type HotelStaffRole = "owner" | "front_desk" | "restaurant" | "bar" | "housekeeping" | "rider" | "kitchen" | "storekeeper";
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
  photoUrls?: string[];
  details?: string;
  services?: string[];
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
  note?: string;
};

export type HotelMenuItem = {
  id: string;
  name: string;
  kind: HotelOrderKind;
  amountMinor: number;
  description: string;
  photoUrl?: string;
  available?: boolean;
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
  note?: string;
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

export type SupplyDepartment = "stores" | "owner" | "housekeeping" | "kitchen";
export type SupplyStatus = "requested" | "approved" | "fulfilled" | "rejected";
export type SupplyRequest = {
  id: string;
  item: string;
  quantity: number;
  note: string;
  fromRole: string;
  fromStaffName: string;
  toDepartment: SupplyDepartment;
  status: SupplyStatus;
  createdAt: string;
};

export type HotelProperty = {
  subdomain: string;
  rooms: HotelRoom[];
  bookings: HotelBooking[];
  orders: HotelOrder[];
  menu: HotelMenuItem[];
  tables: HotelTable[];
  supplies: SupplyRequest[];
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
  {
    name: "Deluxe King",
    beds: "1 king",
    nightlyMinor: 18000,
    housekeep: "ready",
    details: "A quiet king room with a writing desk, blackout drapes, and city light at night.",
    services: ["Wi-Fi", "King bed", "Room service", "Ensuite shower", "Work desk"],
  },
  {
    name: "Twin Garden",
    beds: "2 twins",
    nightlyMinor: 14000,
    housekeep: "ready",
    details: "Two twin beds facing the garden. Good for friends or a short work trip.",
    services: ["Wi-Fi", "Garden view", "Twin beds", "Daily housekeeping"],
  },
  {
    name: "Junior Suite",
    beds: "1 king + sofa",
    nightlyMinor: 26000,
    housekeep: "ready",
    details: "A sitting area and a king bed. Space to take a call without sitting on the bed.",
    services: ["Wi-Fi", "Sitting area", "Room service", "Mini fridge", "Bathtub"],
  },
  {
    name: "Standard Queen",
    beds: "1 queen",
    nightlyMinor: 11000,
    housekeep: "ready",
    details: "A compact queen room for one or two. Fast to check in, easy to sleep.",
    services: ["Wi-Fi", "Queen bed", "Ensuite", "Air conditioning"],
  },
  {
    name: "Family Twin",
    beds: "2 queens",
    nightlyMinor: 20000,
    housekeep: "ready",
    details: "Two queen beds for a family stay. Extra towels and a cot on request.",
    services: ["Wi-Fi", "Two queen beds", "Family space", "Room service", "Cot on request"],
  },
  {
    name: "Executive King",
    beds: "1 king",
    nightlyMinor: 22000,
    housekeep: "ready",
    details: "A higher floor king room with a larger desk and a rain shower.",
    services: ["Wi-Fi", "King bed", "Rain shower", "Work desk", "Late checkout on request"],
  },
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
    supplies: [],
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
          supplies: stored.supplies ?? [],
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

function sortOrders<T extends { status: string; createdAt: string }>(orders: T[]) {
  const rank: Record<string, number> = { received: 0, preparing: 1, ready: 2, delivered: 3 };
  return [...orders].sort(
    (a, b) => (rank[a.status] ?? 9) - (rank[b.status] ?? 9) || Date.parse(a.createdAt) - Date.parse(b.createdAt),
  );
}

function roomCounts(rooms: HotelRoom[]) {
  return {
    ready: rooms.filter((room) => room.housekeep === "ready").length,
    occupied: rooms.filter((room) => room.housekeep === "occupied").length,
    dirty: rooms.filter((room) => room.housekeep === "dirty").length,
    cleaning: rooms.filter((room) => room.housekeep === "cleaning").length,
    total: rooms.length,
  };
}

function visibleSupplies(staff: HotelStaff, supplies: SupplyRequest[]) {
  if (staff.role === "owner") return supplies;
  if (staff.role === "storekeeper") return supplies.filter((row) => row.toDepartment === "stores" || row.toDepartment === "kitchen");
  if (staff.role === "kitchen") return supplies.filter((row) => row.toDepartment === "kitchen" || row.fromRole === "restaurant" || row.fromRole === "kitchen");
  if (staff.role === "housekeeping") return supplies.filter((row) => row.toDepartment === "housekeeping");
  return supplies.filter((row) => row.fromRole === staff.role);
}

export function hotelOpsPayload(install: PortalInstall, staff: HotelStaff, store?: PortalStore) {
  const row = requireProperty(install, store);
  const supplies = visibleSupplies(staff, row.supplies ?? []);
  if (staff.role === "front_desk") {
    return {
      staff: publicStaff(staff),
      desk: "front_desk",
      rooms: row.rooms,
      bookings: row.bookings,
      roomCounts: roomCounts(row.rooms),
      orders: [],
      menu: [],
      tables: [],
      supplies: [],
    };
  }
  if (staff.role === "restaurant" || staff.role === "kitchen") {
    return {
      staff: publicStaff(staff),
      desk: staff.role,
      rooms: [],
      bookings: [],
      orders: sortOrders(row.orders.filter((item) => item.kind === "restaurant" || item.kind === "room_service")),
      menu: row.menu.filter((item) => item.kind === "restaurant" || item.kind === "room_service"),
      tables: row.tables,
      supplies,
    };
  }
  if (staff.role === "storekeeper") {
    return {
      staff: publicStaff(staff),
      desk: "storekeeper",
      rooms: [],
      bookings: [],
      orders: [],
      menu: [],
      tables: [],
      supplies,
    };
  }
  if (staff.role === "bar") {
    return {
      staff: publicStaff(staff),
      desk: "bar",
      rooms: [],
      bookings: [],
      orders: sortOrders(row.orders.filter((item) => item.kind === "bar")),
      menu: row.menu.filter((item) => item.kind === "bar"),
      tables: row.tables,
      supplies,
    };
  }
  if (staff.role === "housekeeping") {
    return {
      staff: publicStaff(staff),
      desk: "housekeeping",
      rooms: row.rooms,
      bookings: [],
      roomCounts: roomCounts(row.rooms),
      orders: [],
      menu: [],
      tables: [],
      supplies,
    };
  }
  if (staff.role === "rider") {
    return {
      staff: publicStaff(staff),
      desk: "rider",
      rooms: [],
      bookings: [],
      orders: sortOrders(
        row.orders.filter((item) => item.fulfillment === "takeaway" && (item.status === "ready" || item.status === "delivered")),
      ),
      menu: [],
      tables: [],
      supplies: [],
    };
  }
  return {
    staff: publicStaff(staff),
    desk: "owner",
    rooms: row.rooms,
    bookings: row.bookings,
    orders: sortOrders(row.orders),
    menu: row.menu,
    tables: row.tables,
    team: row.staff.map(publicStaff),
    activity: row.activity.slice(0, 80),
    roomCounts: roomCounts(row.rooms),
    supplies: row.supplies ?? [],
    analytics: hotelAnalytics(row),
  };
}

export function hotelAnalytics(row: HotelProperty) {
  const counts = roomCounts(row.rooms);
  const occupancyPct = counts.total ? Math.round((counts.occupied / counts.total) * 100) : 0;
  const roomRevenueMinor = row.bookings.reduce((sum, item) => sum + item.totalMinor, 0);
  const foodRevenueMinor = row.orders
    .filter((item) => item.kind === "restaurant" || item.kind === "room_service")
    .reduce((sum, item) => sum + item.amountMinor, 0);
  const drinkRevenueMinor = row.orders.filter((item) => item.kind === "bar").reduce((sum, item) => sum + item.amountMinor, 0);
  const today = new Date().toISOString().slice(0, 10);
  return {
    occupancyPct,
    roomsReady: counts.ready,
    roomsOccupied: counts.occupied,
    roomsDirty: counts.dirty,
    roomsTotal: counts.total,
    arrivals: row.bookings.filter((item) => item.checkIn === today || item.status === "confirmed").length,
    inHouse: row.bookings.filter((item) => item.status === "checked_in").length,
    departures: row.bookings.filter((item) => item.checkOut === today || item.status === "checked_out").length,
    stays: row.bookings.length,
    roomRevenueMinor,
    foodRevenueMinor,
    drinkRevenueMinor,
    openTickets: row.orders.filter((item) => item.status !== "delivered").length,
    deliveredTickets: row.orders.filter((item) => item.status === "delivered").length,
    walkInOrders: row.orders.filter((item) => item.fulfillment !== "takeaway").length,
    takeawayOrders: row.orders.filter((item) => item.fulfillment === "takeaway").length,
    supplyOpen: (row.supplies ?? []).filter((item) => item.status === "requested" || item.status === "approved").length,
    adrMinor: counts.occupied ? Math.round(roomRevenueMinor / Math.max(1, row.bookings.length)) : 0,
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
  input: { roomId: string; guestName: string; guestEmail: string; checkIn: string; checkOut: string; note?: string },
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
    note: input.note,
  };
  room.housekeep = "occupied";
  row.bookings.unshift(booking);
  logHotelActivity(row, { name: booking.guestName, role: "guest" }, "booking.create", `${booking.roomName} · ${booking.checkIn} → ${booking.checkOut}`);
  save(store, install, row);
  return booking;
}

export function bookHotelRooms(
  install: PortalInstall,
  input: { roomIds: string[]; guestName: string; guestEmail: string; checkIn: string; checkOut: string; note?: string },
  store?: PortalStore,
) {
  const ids = [...new Set(input.roomIds.map((id) => id.trim()).filter(Boolean))];
  if (!ids.length) throw new HttpError("Pick at least one room.", 400, "invalid_body");
  const row = requireProperty(install, store);
  for (const roomId of ids) {
    const room = row.rooms.find((item) => item.id === roomId);
    if (!room || room.housekeep !== "ready") throw new HttpError(`${room?.name ?? "A room"} is not available.`, 409, "room_unavailable");
  }
  return ids.map((roomId) => bookHotelRoom(install, { ...input, roomId }, store));
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
    note?: string;
    placedBy?: "guest" | "staff";
    actor?: HotelStaff;
  },
  store?: PortalStore,
) {
  const row = requireProperty(install, store);
  const quantity = Math.max(1, Math.min(12, input.quantity ?? 1));
  const menuItem = row.menu.find((item) => item.name === input.item.trim());
  if (menuItem && menuItem.available === false) throw new HttpError(`${menuItem.name} is 86'd tonight.`, 409, "item_unavailable");
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
    note: input.note,
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

function applyRoomCatalog(
  room: HotelRoom,
  input: {
    photoUrl?: string;
    photoUrls?: string[];
    details?: string;
    services?: string[];
  },
) {
  const photos = [...(input.photoUrls ?? [])];
  if (input.photoUrl && !photos.includes(input.photoUrl)) photos.unshift(input.photoUrl);
  const cleaned = photos.map((url) => url.trim()).filter(Boolean).slice(0, 6);
  if (cleaned.length) {
    room.photoUrls = cleaned;
    room.photoUrl = cleaned[0];
  } else if (input.photoUrl === "" || input.photoUrls) {
    delete room.photoUrl;
    delete room.photoUrls;
  }
  if (input.details !== undefined) room.details = input.details.trim();
  if (input.services !== undefined) {
    room.services = input.services.map((item) => item.trim()).filter(Boolean).slice(0, 16);
  }
}

export function upsertHotelRoom(
  install: PortalInstall,
  input: {
    id?: string;
    name: string;
    beds: string;
    nightlyMinor: number;
    photoUrl?: string;
    photoUrls?: string[];
    details?: string;
    services?: string[];
    housekeep?: HotelHousekeep;
  },
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
    applyRoomCatalog(room, input);
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
  };
  applyRoomCatalog(room, input);
  row.rooms.unshift(room);
  logHotelActivity(row, actor, "room.create", room.name);
  save(store, install, row);
  return room;
}

export function upsertHotelMenuItem(
  install: PortalInstall,
  input: { id?: string; name: string; kind: HotelOrderKind; amountMinor: number; description: string; photoUrl?: string; available?: boolean },
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
    if (input.available !== undefined) item.available = input.available;
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
    available: input.available,
  };
  row.menu.unshift(item);
  logHotelActivity(row, actor, "menu.create", item.name);
  save(store, install, row);
  return item;
}

export function createHotelSupply(
  install: PortalInstall,
  actor: HotelStaff,
  input: { item: string; quantity?: number; note?: string; toDepartment?: SupplyDepartment },
  store?: PortalStore,
) {
  if (actor.role === "front_desk" || actor.role === "rider" || actor.role === "storekeeper") {
    throw new HttpError("This dashboard is not assigned to you.", 403, "forbidden");
  }
  const row = requireProperty(install, store);
  const request: SupplyRequest = {
    id: newId("sup"),
    item: input.item.trim(),
    quantity: Math.max(1, Math.min(200, input.quantity ?? 1)),
    note: input.note?.trim() ?? "",
    fromRole: actor.role,
    fromStaffName: actor.name,
    toDepartment: input.toDepartment ?? (actor.role === "housekeeping" ? "housekeeping" : "kitchen"),
    status: "requested",
    createdAt: new Date().toISOString(),
  };
  row.supplies = row.supplies ?? [];
  row.supplies.unshift(request);
  logHotelActivity(row, actor, "supply.request", `${request.item} × ${request.quantity} → ${request.toDepartment}`);
  save(store, install, row);
  return request;
}

export function updateHotelSupply(
  install: PortalInstall,
  actor: HotelStaff,
  requestId: string,
  status: SupplyStatus,
  store?: PortalStore,
) {
  const row = requireProperty(install, store);
  const request = (row.supplies ?? []).find((item) => item.id === requestId);
  if (!request) throw new HttpError("Supply request not found.", 404, "not_found");
  if (
    actor.role !== "owner" &&
    actor.role !== "storekeeper" &&
    !(actor.role === "housekeeping" && request.toDepartment === "housekeeping")
  ) {
    throw new HttpError("This dashboard is not assigned to you.", 403, "forbidden");
  }
  request.status = status;
  logHotelActivity(row, actor, `supply.${status}`, `${request.item} × ${request.quantity}`);
  save(store, install, row);
  return request;
}

export function assertStaffRole(staff: HotelStaff, roles: HotelStaffRole[]) {
  if (staff.role === "owner") return;
  if (!roles.includes(staff.role)) throw new HttpError("This dashboard is not assigned to you.", 403, "forbidden");
}

export const DEFAULT_HOTEL_OWNER_PASSWORD = DEFAULT_OWNER_PASSWORD;
