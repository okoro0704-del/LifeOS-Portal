import { useEffect, useState } from "react";

export type GuestCartRoom = {
  key: string;
  kind: "room";
  roomId: string;
  name: string;
  beds: string;
  nightlyMinor: number;
};

export type GuestCartItem = {
  key: string;
  kind: "item";
  name: string;
  menuKind: string;
  quantity: number;
  amountMinor: number;
};

export type GuestCartLine = GuestCartRoom | GuestCartItem;

const EVENT = "lifeos-cart";
const memory = new Map<string, string>();

function cartKey(subdomain: string) {
  return `hotel.cart.${subdomain}`;
}

function readStore(key: string) {
  try {
    if (typeof localStorage?.getItem === "function") return localStorage.getItem(key);
  } catch {
    /* fall through */
  }
  return memory.get(key) ?? null;
}

function writeStore(key: string, value: string) {
  try {
    if (typeof localStorage?.setItem === "function") localStorage.setItem(key, value);
    else memory.set(key, value);
  } catch {
    memory.set(key, value);
  }
  if (typeof window !== "undefined") window.dispatchEvent(new Event(EVENT));
}

export function loadGuestCart(subdomain: string): GuestCartLine[] {
  try {
    const raw = readStore(cartKey(subdomain));
    if (!raw) return [];
    const parsed = JSON.parse(raw) as GuestCartLine[];
    return Array.isArray(parsed) ? parsed : [];
  } catch {
    return [];
  }
}

export function saveGuestCart(subdomain: string, lines: GuestCartLine[]) {
  writeStore(cartKey(subdomain), JSON.stringify(lines));
}

export function cartCount(lines: GuestCartLine[]) {
  return lines.reduce((sum, line) => sum + (line.kind === "item" ? line.quantity : 1), 0);
}

export function cartTotalMinor(lines: GuestCartLine[], nights = 1) {
  return lines.reduce((sum, line) => {
    if (line.kind === "room") return sum + line.nightlyMinor * Math.max(1, nights);
    return sum + line.amountMinor * line.quantity;
  }, 0);
}

export function addRoomToCart(
  subdomain: string,
  room: { id: string; name: string; beds: string; nightlyMinor: number },
) {
  const lines = loadGuestCart(subdomain);
  if (lines.some((line) => line.kind === "room" && line.roomId === room.id)) return lines;
  const next: GuestCartLine[] = [
    ...lines,
    {
      key: `room:${room.id}`,
      kind: "room",
      roomId: room.id,
      name: room.name,
      beds: room.beds,
      nightlyMinor: room.nightlyMinor,
    },
  ];
  saveGuestCart(subdomain, next);
  return next;
}

export function addItemToCart(
  subdomain: string,
  item: { name: string; kind: string; quantity: number; amountMinor: number },
) {
  const lines = loadGuestCart(subdomain);
  const next = lines.some((line) => line.kind === "item" && line.name === item.name)
    ? lines.map((line) =>
        line.kind === "item" && line.name === item.name
          ? { ...line, quantity: Math.min(12, line.quantity + item.quantity) }
          : line,
      )
    : [
        ...lines,
        {
          key: `item:${item.name}`,
          kind: "item" as const,
          name: item.name,
          menuKind: item.kind,
          quantity: item.quantity,
          amountMinor: item.amountMinor,
        },
      ];
  saveGuestCart(subdomain, next);
  return next;
}

export function removeCartLine(subdomain: string, key: string) {
  const next = loadGuestCart(subdomain).filter((line) => line.key !== key);
  saveGuestCart(subdomain, next);
  return next;
}

export function clearGuestCart(subdomain: string) {
  saveGuestCart(subdomain, []);
}

export function useGuestCart(subdomain: string) {
  const [lines, setLines] = useState<GuestCartLine[]>(() =>
    typeof localStorage === "undefined" ? [] : loadGuestCart(subdomain),
  );
  useEffect(() => {
    const sync = () => setLines(loadGuestCart(subdomain));
    sync();
    window.addEventListener("storage", sync);
    window.addEventListener(EVENT, sync);
    return () => {
      window.removeEventListener("storage", sync);
      window.removeEventListener(EVENT, sync);
    };
  }, [subdomain]);
  return { lines, count: cartCount(lines) };
}
