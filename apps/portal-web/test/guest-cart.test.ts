/** @vitest-environment jsdom */
import { afterEach, describe, expect, test } from "vitest";
import { addItemToCart, addRoomToCart, cartCount, cartTotalMinor, clearGuestCart, loadGuestCart, removeCartLine } from "../src/lib/guest-cart";

const sub = "cart-hotel";

afterEach(() => {
  clearGuestCart(sub);
});

describe("guest cart", () => {
  test("adds rooms and plates, then totals the stay", () => {
    addRoomToCart(sub, { id: "rm1", name: "Deluxe King", beds: "1 king", nightlyMinor: 18000 });
    addRoomToCart(sub, { id: "rm1", name: "Deluxe King", beds: "1 king", nightlyMinor: 18000 });
    addItemToCart(sub, { name: "Jollof platter", kind: "restaurant", quantity: 2, amountMinor: 4500 });
    addItemToCart(sub, { name: "Jollof platter", kind: "restaurant", quantity: 1, amountMinor: 4500 });
    const lines = loadGuestCart(sub);
    expect(lines.filter((line) => line.kind === "room")).toHaveLength(1);
    expect(cartCount(lines)).toBe(4);
    expect(cartTotalMinor(lines, 2)).toBe(18000 * 2 + 4500 * 3);
    removeCartLine(sub, "room:rm1");
    expect(loadGuestCart(sub).every((line) => line.kind === "item")).toBe(true);
    clearGuestCart(sub);
    expect(loadGuestCart(sub)).toEqual([]);
  });
});
