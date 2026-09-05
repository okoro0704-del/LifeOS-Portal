import { featuresForVertical, tenantDeliverables } from "@lifeos-portal/shared";
import { newId } from "../lib/crypto.js";
import { HttpError } from "../lib/http.js";
import type { PortalInstall } from "../store.js";

export type HotelRoom = {
  id: string;
  name: string;
  beds: string;
  nightlyMinor: number;
  available: boolean;
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
  status: "confirmed" | "checked_in" | "checked_out";
  createdAt: string;
};

export type HotelOrder = {
  id: string;
  item: string;
  quantity: number;
  amountMinor: number;
  roomName?: string;
  guestName: string;
  status: "received" | "preparing" | "delivered";
  createdAt: string;
};

type HotelProperty = {
  subdomain: string;
  rooms: HotelRoom[];
  bookings: HotelBooking[];
  orders: HotelOrder[];
};

const properties = new Map<string, HotelProperty>();

const SEED_ROOMS: Array<Omit<HotelRoom, "id" | "available">> = [
  { name: "Deluxe King", beds: "1 king", nightlyMinor: 18000 },
  { name: "Twin Garden", beds: "2 twins", nightlyMinor: 14000 },
  { name: "Junior Suite", beds: "1 king + sofa", nightlyMinor: 26000 },
  { name: "Standard Queen", beds: "1 queen", nightlyMinor: 11000 },
];

function nightsBetween(checkIn: string, checkOut: string) {
  const start = Date.parse(checkIn);
  const end = Date.parse(checkOut);
  if (!Number.isFinite(start) || !Number.isFinite(end) || end <= start) {
    throw new HttpError("Check-out must be after check-in.", 400, "invalid_dates");
  }
  return Math.max(1, Math.round((end - start) / 86_400_000));
}

export function seedHotelProperty(install: PortalInstall) {
  if (install.verticalId !== "hotel") return;
  const slug = install.subdomain.toLowerCase();
  if (properties.has(slug)) return;
  properties.set(slug, {
    subdomain: slug,
    rooms: SEED_ROOMS.map((room) => ({ ...room, id: newId("rm"), available: true })),
    bookings: [],
    orders: [],
  });
}

function property(subdomain: string) {
  return properties.get(subdomain.toLowerCase());
}

export function hotelAppPayload(install: PortalInstall) {
  seedHotelProperty(install);
  const slug = install.subdomain.toLowerCase();
  const row = property(slug);
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
      branding: {
        name: install.displayName,
        primaryColor: install.brandPrimaryColor ?? "#0d7a6f",
      },
      features: featuresForVertical(install.osId, install.verticalId),
    },
    rooms: row?.rooms ?? [],
    bookings: row?.bookings ?? [],
    orders: row?.orders ?? [],
  };
}

export function bookHotelRoom(
  install: PortalInstall,
  input: { roomId: string; guestName: string; guestEmail: string; checkIn: string; checkOut: string },
) {
  seedHotelProperty(install);
  const row = property(install.subdomain);
  if (!row) throw new HttpError("Hotel is not ready.", 404, "not_found");
  const room = row.rooms.find((item) => item.id === input.roomId);
  if (!room || !room.available) throw new HttpError("That room is not available.", 409, "room_unavailable");
  const nights = nightsBetween(input.checkIn, input.checkOut);
  const booking: HotelBooking = {
    id: newId("bkg"),
    roomId: room.id,
    roomName: room.name,
    guestName: input.guestName.trim(),
    guestEmail: input.guestEmail.trim(),
    checkIn: input.checkIn,
    checkOut: input.checkOut,
    nights,
    totalMinor: room.nightlyMinor * nights,
    status: "confirmed",
    createdAt: new Date().toISOString(),
  };
  room.available = false;
  row.bookings.unshift(booking);
  return booking;
}

export function placeHotelOrder(
  install: PortalInstall,
  input: { item: string; quantity?: number; guestName: string; roomName?: string },
) {
  seedHotelProperty(install);
  const row = property(install.subdomain);
  if (!row) throw new HttpError("Hotel is not ready.", 404, "not_found");
  const quantity = Math.max(1, Math.min(12, input.quantity ?? 1));
  const menu: Record<string, number> = {
    "Club sandwich": 3500,
    "Continental breakfast": 2800,
    "Grilled catch": 6200,
    "Still water": 800,
  };
  const item = input.item.trim();
  const amountMinor = (menu[item] ?? 2500) * quantity;
  const order: HotelOrder = {
    id: newId("ord"),
    item,
    quantity,
    amountMinor,
    roomName: input.roomName,
    guestName: input.guestName.trim(),
    status: "received",
    createdAt: new Date().toISOString(),
  };
  row.orders.unshift(order);
  return order;
}

export function updateHotelBookingStatus(install: PortalInstall, bookingId: string, status: HotelBooking["status"]) {
  const row = property(install.subdomain);
  const booking = row?.bookings.find((item) => item.id === bookingId);
  if (!booking) throw new HttpError("Booking not found.", 404, "not_found");
  booking.status = status;
  if (status === "checked_out") {
    const room = row?.rooms.find((item) => item.id === booking.roomId);
    if (room) room.available = true;
  }
  return booking;
}
