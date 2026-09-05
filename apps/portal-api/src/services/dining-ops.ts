import { featuresForVertical, tenantDeliverables } from "@lifeos-portal/shared";
import { newId, randomToken, hashSecret } from "../lib/crypto.js";
import { HttpError } from "../lib/http.js";
import { hashPassword, verifyPassword } from "../lib/password.js";
import type { PortalInstall, PortalStore } from "../store.js";
import { publicBranding, type StaffActivity } from "./tenant-site.js";

export type DiningStaffRole = "owner" | "kitchen" | "counter" | "rider";
export type DiningKind = "food" | "drink";
export type DiningOrderStatus = "received" | "preparing" | "ready" | "delivered";

export type DiningMenuItem = {
  id: string;
  name: string;
  kind: DiningKind;
  amountMinor: number;
  description: string;
  photoUrl?: string;
};

export type DiningOrder = {
  id: string;
  item: string;
  kind: DiningKind;
  quantity: number;
  amountMinor: number;
  guestName: string;
  guestEmail?: string;
  tableName?: string;
  address?: string;
  status: DiningOrderStatus;
  createdAt: string;
  placedBy?: "guest" | "staff";
};

export type DiningTable = { id: string; name: string; seats: number };

export type DiningStaff = {
  id: string;
  name: string;
  email: string;
  passwordHash: string;
  role: DiningStaffRole;
  createdAt: string;
};

type DiningProperty = {
  subdomain: string;
  verticalId: string;
  menu: DiningMenuItem[];
  tables: DiningTable[];
  orders: DiningOrder[];
  staff: DiningStaff[];
  sessions: Array<{ tokenHash: string; staffId: string; expiresAt: string }>;
  activity: StaffActivity[];
};

const properties = new Map<string, DiningProperty>();
export const DEFAULT_DINING_OWNER_PASSWORD = "venue-owner";

const RESTAURANT_MENU: Array<Omit<DiningMenuItem, "id">> = [
  { name: "Jollof platter", kind: "food", amountMinor: 4500, description: "Smoky rice, plantain, and stew" },
  { name: "Grilled catch", kind: "food", amountMinor: 6200, description: "Day catch with greens" },
  { name: "Club sandwich", kind: "food", amountMinor: 3500, description: "Chicken, bacon, and fries" },
  { name: "Pepper soup", kind: "food", amountMinor: 2800, description: "Goat or catfish" },
  { name: "Lager", kind: "drink", amountMinor: 1500, description: "Draft pint" },
  { name: "Chapman", kind: "drink", amountMinor: 1800, description: "House cooler" },
  { name: "Red wine", kind: "drink", amountMinor: 3200, description: "Glass" },
  { name: "Still water", kind: "drink", amountMinor: 800, description: "75cl" },
];

const KITCHEN_MENU: Array<Omit<DiningMenuItem, "id">> = [
  { name: "Ofada rice", kind: "food", amountMinor: 3800, description: "Ayamase and boiled egg" },
  { name: "Asun tacos", kind: "food", amountMinor: 3200, description: "Peppered goat, home wrap" },
  { name: "Moi moi box", kind: "food", amountMinor: 1800, description: "Steamed bean pudding" },
  { name: "Suya tray", kind: "food", amountMinor: 4200, description: "Beef, onion, and yaji" },
  { name: "Zobo", kind: "drink", amountMinor: 1000, description: "Cold hibiscus" },
  { name: "Ginger beer", kind: "drink", amountMinor: 1200, description: "House brew" },
];

function publicStaff(staff: DiningStaff) {
  return { id: staff.id, name: staff.name, email: staff.email, role: staff.role, createdAt: staff.createdAt };
}

function save(store: PortalStore | undefined, install: PortalInstall, row: DiningProperty) {
  properties.set(row.subdomain, row);
  store?.updateInstall(install.id, { diningOps: row });
}

function emptyProperty(install: PortalInstall, seed?: { email?: string; name?: string; password?: string }): DiningProperty {
  const slug = install.subdomain.toLowerCase();
  const kitchen = install.verticalId === "local_food";
  return {
    subdomain: slug,
    verticalId: install.verticalId,
    menu: (kitchen ? KITCHEN_MENU : RESTAURANT_MENU).map((item) => ({ ...item, id: newId("mn") })),
    tables: kitchen
      ? []
      : ["T1", "T2", "T3", "T4", "T5", "T6"].map((name, i) => ({ id: newId("tbl"), name, seats: i < 2 ? 2 : 4 })),
    orders: [],
    staff: [
      {
        id: newId("dst"),
        name: seed?.name?.trim() || (kitchen ? "Kitchen owner" : "Restaurant owner"),
        email: (seed?.email ?? `owner@${slug}.getlifeos.app`).trim().toLowerCase(),
        passwordHash: hashPassword(seed?.password?.trim() || DEFAULT_DINING_OWNER_PASSWORD),
        role: "owner",
        createdAt: new Date().toISOString(),
      },
    ],
    sessions: [],
    activity: [],
  };
}

export function isDiningVertical(verticalId: string) {
  return verticalId === "restaurant" || verticalId === "local_food";
}

export function seedDiningProperty(
  install: PortalInstall,
  store?: PortalStore,
  seed?: { email?: string; name?: string; password?: string },
) {
  if (!isDiningVertical(install.verticalId)) return;
  const slug = install.subdomain.toLowerCase();
  if (properties.has(slug)) return;
  const stored = install.diningOps as DiningProperty | undefined;
  const row = stored?.menu?.length
    ? { ...stored, subdomain: slug, activity: stored.activity ?? [] }
    : emptyProperty(install, seed);
  save(store, install, row);
}

function requireProperty(install: PortalInstall, store?: PortalStore) {
  seedDiningProperty(install, store);
  const row = properties.get(install.subdomain.toLowerCase());
  if (!row) throw new HttpError("Dining app is not ready.", 404, "not_found");
  return row;
}

export function diningAppPayload(install: PortalInstall, store?: PortalStore) {
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
      branding: publicBranding(install),
      features: featuresForVertical(install.osId, install.verticalId),
      ownerHint: row.staff.find((staff) => staff.role === "owner")?.email ?? `owner@${row.subdomain}.getlifeos.app`,
      staffAppUrl: deliverables.staffApp.url,
      mode: install.verticalId === "local_food" ? "kitchen" : "restaurant",
    },
    menu: row.menu,
    tables: row.tables,
  };
}

export function diningStayPayload(install: PortalInstall, guestEmail: string, store?: PortalStore) {
  const row = requireProperty(install, store);
  const email = guestEmail.trim().toLowerCase();
  return { orders: row.orders.filter((item) => item.guestEmail === email) };
}

export function diningOpsPayload(install: PortalInstall, staff: DiningStaff, store?: PortalStore) {
  const row = requireProperty(install, store);
  const orders =
    staff.role === "kitchen"
      ? row.orders.filter((item) => item.kind === "food")
      : staff.role === "rider"
        ? row.orders.filter((item) => item.status === "ready" || item.status === "delivered")
        : row.orders;
  return {
    staff: publicStaff(staff),
    orders,
    menu: row.menu,
    tables: row.tables,
    team: staff.role === "owner" ? row.staff.map(publicStaff) : undefined,
    activity: staff.role === "owner" ? row.activity.slice(0, 80) : undefined,
  };
}

function logDiningActivity(row: DiningProperty, staff: DiningStaff, action: string, detail: string) {
  row.activity.unshift({
    id: newId("act"),
    at: new Date().toISOString(),
    staffId: staff.id,
    staffName: staff.name,
    role: staff.role,
    action,
    detail,
  });
  row.activity = row.activity.slice(0, 200);
}

export function placeDiningOrder(
  install: PortalInstall,
  input: {
    item: string;
    quantity?: number;
    guestName: string;
    guestEmail?: string;
    tableName?: string;
    address?: string;
    kind?: DiningKind;
    actor?: DiningStaff;
  },
  store?: PortalStore,
) {
  const row = requireProperty(install, store);
  const menuItem = row.menu.find((item) => item.name === input.item.trim());
  const quantity = Math.max(1, Math.min(12, input.quantity ?? 1));
  const order: DiningOrder = {
    id: newId("ord"),
    item: input.item.trim(),
    kind: input.kind ?? menuItem?.kind ?? "food",
    quantity,
    amountMinor: (menuItem?.amountMinor ?? 2500) * quantity,
    guestName: input.guestName.trim(),
    guestEmail: input.guestEmail?.trim().toLowerCase(),
    tableName: input.tableName,
    address: input.address,
    status: "received",
    createdAt: new Date().toISOString(),
    placedBy: input.actor ? "staff" : "guest",
  };
  row.orders.unshift(order);
  if (input.actor) logDiningActivity(row, input.actor, "order.create", `${order.item} for ${order.guestName}`);
  save(store, install, row);
  return order;
}

export function updateDiningOrderStatus(
  install: PortalInstall,
  orderId: string,
  status: DiningOrderStatus,
  store?: PortalStore,
) {
  const row = requireProperty(install, store);
  const order = row.orders.find((item) => item.id === orderId);
  if (!order) throw new HttpError("Order not found.", 404, "not_found");
  order.status = status;
  save(store, install, row);
  return order;
}

export function loginDiningStaff(
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

export function diningStaffFromToken(install: PortalInstall, token: string | undefined, store?: PortalStore) {
  if (!token) throw new HttpError("Staff login required.", 401, "unauthorized");
  const row = requireProperty(install, store);
  const session = row.sessions.find(
    (item) => item.tokenHash === hashSecret(token) && Date.parse(item.expiresAt) > Date.now(),
  );
  const staff = session ? row.staff.find((item) => item.id === session.staffId) : undefined;
  if (!staff) throw new HttpError("Staff login required.", 401, "unauthorized");
  return staff;
}

export function createDiningStaff(
  install: PortalInstall,
  input: { name: string; email: string; password: string; role: DiningStaffRole },
  store?: PortalStore,
) {
  const row = requireProperty(install, store);
  const email = input.email.trim().toLowerCase();
  if (row.staff.some((item) => item.email === email)) throw new HttpError("That staff email is already in use.", 409, "conflict");
  if (input.role === "owner") throw new HttpError("Create a department role, not another owner.", 400, "invalid_role");
  if (install.verticalId === "restaurant" && input.role === "rider") {
    throw new HttpError("Restaurants use counter staff, not riders.", 400, "invalid_role");
  }
  if (install.verticalId === "local_food" && input.role === "counter") {
    throw new HttpError("Home kitchens use cook and rider roles.", 400, "invalid_role");
  }
  const staff: DiningStaff = {
    id: newId("dst"),
    name: input.name.trim(),
    email,
    passwordHash: hashPassword(input.password),
    role: input.role,
    createdAt: new Date().toISOString(),
  };
  row.staff.push(staff);
  const owner = row.staff.find((item) => item.role === "owner");
  if (owner) logDiningActivity(row, owner, "staff.create", `${staff.name} · ${staff.role}`);
  save(store, install, row);
  return publicStaff(staff);
}

export function upsertDiningMenuItem(
  install: PortalInstall,
  input: { id?: string; name: string; kind: DiningKind; amountMinor: number; description: string; photoUrl?: string },
  actor: DiningStaff,
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
    logDiningActivity(row, actor, "menu.update", item.name);
    save(store, install, row);
    return item;
  }
  const item: DiningMenuItem = {
    id: newId("mn"),
    name: input.name.trim(),
    kind: input.kind,
    amountMinor: input.amountMinor,
    description: input.description.trim(),
    photoUrl: input.photoUrl,
  };
  row.menu.unshift(item);
  logDiningActivity(row, actor, "menu.create", item.name);
  save(store, install, row);
  return item;
}

export function assertDiningRole(staff: DiningStaff, roles: DiningStaffRole[]) {
  if (staff.role === "owner") return;
  if (!roles.includes(staff.role)) throw new HttpError("This dashboard is not assigned to you.", 403, "forbidden");
}
