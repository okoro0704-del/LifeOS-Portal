import { useEffect, useState, type FormEvent } from "react";
import { GreetingsHeader } from "../components/GreetingsHeader";
import { emptyFulfillment, fulfillmentLabel, fulfillmentPayload, OrderFulfillment, type FulfillmentChoice } from "../components/OrderFulfillment";
import { TenantAppChrome } from "../components/TenantAppChrome";
import { portalApiBase } from "../lib/api";

type Staff = { id: string; name: string; email: string; role: string };
type Branding = { name: string; primaryColor: string; dashboardStyle?: "console" | "greetings" };
type Order = {
  id: string;
  item: string;
  quantity: number;
  status: string;
  guestName: string;
  amountMinor: number;
  fulfillment?: string;
  tableName?: string;
  seats?: number;
  address?: string;
  lat?: number;
  lng?: number;
  note?: string;
  createdAt?: string;
};
type Room = { id: string; name: string; beds: string; housekeep: string; nightlyMinor?: number; photoUrl?: string };
type MenuItem = { id: string; name: string; kind: string; amountMinor: number; description?: string; available?: boolean };
type SeatTable = { id: string; name: string; seats: number };
type Booking = { id: string; roomName: string; guestName: string; guestEmail?: string; checkIn: string; checkOut: string; status: string; note?: string };
type Supply = {
  id: string;
  item: string;
  quantity: number;
  note: string;
  fromRole: string;
  fromStaffName: string;
  toDepartment: string;
  status: string;
};
type RoomCounts = { ready: number; occupied: number; dirty: number; cleaning: number; total: number };

function money(minor: number) {
  return `$${(minor / 100).toFixed(0)}`;
}

function ticketAge(createdAt?: string) {
  if (!createdAt) return "";
  const minutes = Math.max(0, Math.round((Date.now() - Date.parse(createdAt)) / 60000));
  if (minutes < 1) return "just in";
  if (minutes < 60) return `${minutes}m`;
  return `${Math.floor(minutes / 60)}h ${minutes % 60}m`;
}

function todayStamp() {
  return new Date().toISOString().slice(0, 10);
}

async function readJson(res: Response) {
  const body = await res.json();
  if (!res.ok) throw new Error(body.message || "Request failed");
  return body;
}

export function TenantStaffDesk({
  subdomain,
  branding,
  hotel,
  kitchen,
}: {
  subdomain: string;
  branding: Branding;
  hotel: boolean;
  kitchen: boolean;
}) {
  const [session, setSession] = useState<{ token: string; staff: Staff } | null>(null);
  useEffect(() => {
    try {
      const raw = localStorage.getItem(`dept.staff.${subdomain}`);
      if (raw) setSession(JSON.parse(raw) as { token: string; staff: Staff });
    } catch {
      setSession(null);
    }
  }, [subdomain]);

  function signOut() {
    localStorage.removeItem(`dept.staff.${subdomain}`);
    setSession(null);
  }

  if (!session) {
    return (
      <div className="tap tap-boot" style={{ ["--tap-accent" as string]: branding.primaryColor }}>
        <StaffLogin
          branding={branding}
          subdomain={subdomain}
          onLogin={(next) => {
            localStorage.setItem(`dept.staff.${subdomain}`, JSON.stringify(next));
            setSession(next);
          }}
        />
      </div>
    );
  }

  const desk = (
    <StaffBoard
      subdomain={subdomain}
      hotel={hotel}
      kitchen={kitchen}
      session={session}
      onLogout={signOut}
    />
  );

  if (branding.dashboardStyle === "greetings") {
    return (
      <div className="tap greet-shell" style={{ ["--tap-accent" as string]: branding.primaryColor }}>
        <GreetingsHeader name={session.staff.name} brand={branding.name} role={session.staff.role} onLogout={signOut} />
        <div className="tap-body">{desk}</div>
      </div>
    );
  }

  return (
    <TenantAppChrome
      brand={branding.name}
      accent={branding.primaryColor}
      titles={{ "/staff": session.staff.role.replaceAll("_", " ") }}
      tabs={[{ to: "/staff", label: "Board", icon: "staff" }]}
    >
      {desk}
    </TenantAppChrome>
  );
}

function StaffLogin({
  branding,
  subdomain,
  onLogin,
}: {
  branding: Branding;
  subdomain: string;
  onLogin: (session: { token: string; staff: Staff }) => void;
}) {
  const [email, setEmail] = useState("");
  const [password, setPassword] = useState("");
  const [error, setError] = useState<string | null>(null);
  async function submit(event: FormEvent) {
    event.preventDefault();
    try {
      const body = await readJson(
        await fetch(`${portalApiBase}/public/tenants/${encodeURIComponent(subdomain)}/staff/login`, {
          method: "POST",
          headers: { "Content-Type": "application/json" },
          body: JSON.stringify({ email, password, surface: "staff" }),
        }),
      );
      onLogin({ token: body.token, staff: body.staff });
    } catch (err) {
      setError(err instanceof Error ? err.message : "Could not sign in");
    }
  }
  return (
    <form className="form tap-form" onSubmit={(e) => void submit(e)}>
      <p className="tap-hero">{branding.name} staff</p>
      <p className="lead">Use the email and password your owner handed you.</p>
      {error ? <p className="banner-error">{error}</p> : null}
      <label>
        Staff email
        <input type="email" value={email} onChange={(e) => setEmail(e.target.value)} required />
      </label>
      <label>
        Password
        <input type="password" value={password} onChange={(e) => setPassword(e.target.value)} required />
      </label>
      <button className="btn btn-primary" type="submit">
        Open my board
      </button>
    </form>
  );
}

function StaffBoard({
  subdomain,
  hotel,
  kitchen,
  session,
  onLogout,
}: {
  subdomain: string;
  hotel: boolean;
  kitchen: boolean;
  session: { token: string; staff: Staff };
  onLogout: () => void;
}) {
  const headers = { "Content-Type": "application/json", "X-Hotel-Staff": session.token };
  const [orders, setOrders] = useState<Order[]>([]);
  const [rooms, setRooms] = useState<Room[]>([]);
  const [bookings, setBookings] = useState<Booking[]>([]);
  const [menu, setMenu] = useState<MenuItem[]>([]);
  const [tables, setTables] = useState<SeatTable[]>([]);
  const [supplies, setSupplies] = useState<Supply[]>([]);
  const [counts, setCounts] = useState<RoomCounts | null>(null);
  const [error, setError] = useState<string | null>(null);
  const role = session.staff.role;

  async function load() {
    const res = await fetch(`${portalApiBase}/public/tenants/${encodeURIComponent(subdomain)}/ops`, { headers });
    const body = await res.json();
    if (res.status === 401) return onLogout();
    if (!res.ok) throw new Error(body.message || "Could not load board");
    setOrders(body.orders ?? []);
    setRooms(body.rooms ?? []);
    setBookings(body.bookings ?? []);
    setMenu(body.menu ?? []);
    setTables(body.tables ?? []);
    setSupplies(body.supplies ?? []);
    setCounts(body.roomCounts ?? null);
  }

  useEffect(() => {
    void load().catch((err) => setError(err.message));
  }, [subdomain, session.token]);

  return (
    <div className="staff-desk" data-testid="staff-board" data-role={role}>
      <p className="eyebrow">{role.replaceAll("_", " ")}</p>
      <h2>{session.staff.name}</h2>
      {error ? <p className="banner-error">{error}</p> : null}
      {role === "front_desk" ? (
        <FrontDeskBoard
          subdomain={subdomain}
          headers={headers}
          rooms={rooms}
          bookings={bookings}
          counts={counts}
          onDone={() => void load()}
        />
      ) : null}
      {role === "restaurant" || role === "counter" || role === "kitchen" || role === "bar" ? (
        <RestaurantBoard
          subdomain={subdomain}
          headers={headers}
          hotel={hotel}
          kitchen={kitchen || role === "kitchen"}
          bar={role === "bar"}
          menu={menu}
          tables={tables}
          orders={orders}
          supplies={supplies}
          onDone={() => void load()}
        />
      ) : null}
      {role === "housekeeping" ? (
        <HousekeepBoard subdomain={subdomain} headers={headers} rooms={rooms} counts={counts} onDone={() => void load()} />
      ) : null}
      {role === "storekeeper" ? (
        <StorekeeperBoard subdomain={subdomain} headers={headers} supplies={supplies} onDone={() => void load()} />
      ) : null}
      {role === "rider" ? <RiderBoard subdomain={subdomain} headers={headers} orders={orders} onDone={() => void load()} /> : null}
    </div>
  );
}

function FrontDeskBoard({
  subdomain,
  headers,
  rooms,
  bookings,
  counts,
  onDone,
}: {
  subdomain: string;
  headers: Record<string, string>;
  rooms: Room[];
  bookings: Booking[];
  counts: RoomCounts | null;
  onDone: () => void;
}) {
  const ready = rooms.filter((room) => room.housekeep === "ready");
  const today = todayStamp();
  const [guestName, setGuestName] = useState("");
  const [guestEmail, setGuestEmail] = useState("");
  const [roomIds, setRoomIds] = useState<string[]>([]);
  const [checkIn, setCheckIn] = useState(today);
  const [checkOut, setCheckOut] = useState("");
  const [note, setNote] = useState("");
  const [query, setQuery] = useState("");
  const [notice, setNotice] = useState<string | null>(null);
  const occupancy = counts?.total ? Math.round(((counts.occupied ?? 0) / counts.total) * 100) : 0;
  const arrivals = bookings.filter((row) => row.checkIn === today && row.status !== "checked_out");
  const departures = bookings.filter((row) => row.checkOut === today && row.status === "checked_in");
  const inHouse = bookings.filter((row) => row.status === "checked_in");
  const shown = bookings.filter((row) => {
    const hay = `${row.guestName} ${row.guestEmail ?? ""} ${row.roomName} ${row.note ?? ""}`.toLowerCase();
    return !query.trim() || hay.includes(query.trim().toLowerCase());
  });

  function toggleRoom(id: string) {
    setRoomIds((current) => (current.includes(id) ? current.filter((roomId) => roomId !== id) : [...current, id]));
  }

  async function stay(bookingId: string, status: "checked_in" | "checked_out") {
    await readJson(
      await fetch(`${portalApiBase}/public/tenants/${encodeURIComponent(subdomain)}/bookings/${bookingId}/status`, {
        method: "POST",
        headers,
        body: JSON.stringify({ status }),
      }),
    );
    onDone();
  }

  async function walkIn(event: FormEvent) {
    event.preventDefault();
    setNotice(null);
    try {
      await readJson(
        await fetch(`${portalApiBase}/public/tenants/${encodeURIComponent(subdomain)}/bookings`, {
          method: "POST",
          headers,
          body: JSON.stringify({ roomIds, guestName, guestEmail, checkIn, checkOut, note: note || undefined }),
        }),
      );
      setGuestName("");
      setNote("");
      setRoomIds([]);
      setNotice(`${roomIds.length} room stay is on the board.`);
      onDone();
    } catch (err) {
      setNotice(err instanceof Error ? err.message : "Could not book");
    }
  }

  return (
    <div data-testid="front-desk-board">
      <div className="today-stats">
        <span>{occupancy}% occupancy</span>
        <span>{counts?.ready ?? ready.length} ready</span>
        <span>{arrivals.length} arrivals</span>
        <span>{departures.length} departures</span>
        <span>{inHouse.length} in house</span>
        <span>{counts?.dirty ?? 0} dirty</span>
      </div>
      {notice ? <p className={notice.includes("board") ? "banner-ok" : "banner-error"}>{notice}</p> : null}
      <h3>Arrivals today</h3>
      <ul className="list">
        {arrivals.length === 0 ? <li className="muted">No arrivals on the sheet.</li> : null}
        {arrivals.map((booking) => (
          <li key={`arr-${booking.id}`}>
            <strong>
              {booking.guestName} · {booking.roomName}
            </strong>
            <span className="muted">
              {booking.status.replaceAll("_", " ")}
              {booking.note ? ` · ${booking.note}` : ""}
            </span>
            {booking.status === "confirmed" ? (
              <button className="btn btn-primary" type="button" onClick={() => void stay(booking.id, "checked_in")}>
                Check in
              </button>
            ) : null}
          </li>
        ))}
      </ul>
      <h3>Departures today</h3>
      <ul className="list">
        {departures.length === 0 ? <li className="muted">No departures due.</li> : null}
        {departures.map((booking) => (
          <li key={`dep-${booking.id}`}>
            <strong>
              {booking.guestName} · {booking.roomName}
            </strong>
            <button className="btn btn-ghost" type="button" onClick={() => void stay(booking.id, "checked_out")}>
              Check out
            </button>
          </li>
        ))}
      </ul>
      <label>
        Find a guest
        <input value={query} onChange={(e) => setQuery(e.target.value)} placeholder="Name, email, room, note" />
      </label>
      <h3>Stay board</h3>
      <ul className="list">
        {shown.length === 0 ? <li className="muted">No stays match.</li> : null}
        {shown.map((booking) => (
          <li key={booking.id}>
            <strong>
              {booking.guestName} · {booking.roomName}
            </strong>
            <span className="muted">
              {booking.status.replaceAll("_", " ")} · {booking.checkIn} → {booking.checkOut}
              {booking.note ? ` · ${booking.note}` : ""}
            </span>
            <span className="deliverable-links">
              {booking.status === "confirmed" ? (
                <button className="btn btn-primary" type="button" onClick={() => void stay(booking.id, "checked_in")}>
                  Check in
                </button>
              ) : null}
              {booking.status === "checked_in" ? (
                <button className="btn btn-ghost" type="button" onClick={() => void stay(booking.id, "checked_out")}>
                  Check out
                </button>
              ) : null}
            </span>
          </li>
        ))}
      </ul>
      <h3>Room rack</h3>
      <ul className="list">
        {rooms.map((room) => (
          <li key={room.id}>
            <strong>{room.name}</strong>
            <span className="muted">
              {room.beds} · {room.housekeep.replaceAll("_", " ")}
              {room.nightlyMinor ? ` · ${money(room.nightlyMinor)} / night` : ""}
            </span>
          </li>
        ))}
      </ul>
      <form className="form tap-form" onSubmit={(e) => void walkIn(e)}>
        <h3>Walk-in stay</h3>
        <p className="hint">A guest can take more than one room on the same folio.</p>
        <label>
          Guest name
          <input value={guestName} onChange={(e) => setGuestName(e.target.value)} required />
        </label>
        <label>
          Email
          <input type="email" value={guestEmail} onChange={(e) => setGuestEmail(e.target.value)} required />
        </label>
        <fieldset>
          <legend>Ready rooms</legend>
          {ready.length === 0 ? <p className="muted">No cleaned rooms.</p> : null}
          {ready.map((room) => (
            <label key={room.id} className="hint">
              <input type="checkbox" checked={roomIds.includes(room.id)} onChange={() => toggleRoom(room.id)} /> {room.name} · {room.beds}
            </label>
          ))}
        </fieldset>
        <label>
          Check in
          <input type="date" value={checkIn} onChange={(e) => setCheckIn(e.target.value)} required />
        </label>
        <label>
          Check out
          <input type="date" value={checkOut} onChange={(e) => setCheckOut(e.target.value)} required />
        </label>
        <label>
          Note
          <input value={note} onChange={(e) => setNote(e.target.value)} placeholder="Late arrival, extra bed, VIP" />
        </label>
        <button className="btn btn-primary" type="submit" disabled={!ready.length || !roomIds.length}>
          Book {roomIds.length || ""} walk-in
        </button>
      </form>
    </div>
  );
}

function RestaurantBoard({
  subdomain,
  headers,
  hotel,
  kitchen,
  bar,
  menu,
  tables,
  orders,
  supplies,
  onDone,
}: {
  subdomain: string;
  headers: Record<string, string>;
  hotel: boolean;
  kitchen: boolean;
  bar: boolean;
  menu: MenuItem[];
  tables: SeatTable[];
  orders: Order[];
  supplies: Supply[];
  onDone: () => void;
}) {
  const [guestName, setGuestName] = useState("");
  const [guestEmail, setGuestEmail] = useState("");
  const [item, setItem] = useState(menu[0]?.name ?? "");
  const [qty, setQty] = useState("1");
  const [note, setNote] = useState("");
  const [sort, setSort] = useState<"all" | "received" | "preparing" | "ready" | "delivered">("all");
  const [fulfillment, setFulfillment] = useState<FulfillmentChoice>(() => emptyFulfillment(tables));
  const [supplyItem, setSupplyItem] = useState("");
  const [supplyQty, setSupplyQty] = useState("1");
  const [supplyNote, setSupplyNote] = useState("");
  const [notice, setNotice] = useState<string | null>(null);
  const shown = sort === "all" ? orders : orders.filter((row) => row.status === sort);
  const covers = orders.filter((row) => row.status !== "delivered").reduce((sum, row) => sum + (row.seats || row.quantity || 1), 0);

  useEffect(() => {
    if (!item && menu[0]?.name) setItem(menu[0].name);
    setFulfillment((current) => (current.tableName || current.address ? current : emptyFulfillment(tables)));
  }, [menu, tables]);

  async function orderForGuest(event: FormEvent) {
    event.preventDefault();
    setNotice(null);
    try {
      await readJson(
        await fetch(`${portalApiBase}/public/tenants/${encodeURIComponent(subdomain)}/orders`, {
          method: "POST",
          headers,
          body: JSON.stringify({
            item,
            quantity: Math.max(1, Number(qty) || 1),
            note: note || undefined,
            guestName: guestName || "Walk-in",
            guestEmail: guestEmail || undefined,
            kind: hotel ? (bar ? "bar" : "restaurant") : kitchen && !bar ? "food" : undefined,
            ...fulfillmentPayload(fulfillment),
          }),
        }),
      );
      setGuestName("");
      setNote("");
      setQty("1");
      setNotice("Guest order is in the kitchen.");
      onDone();
    } catch (err) {
      setNotice(err instanceof Error ? err.message : "Could not order");
    }
  }

  async function setStatus(orderId: string, status: string) {
    await readJson(
      await fetch(`${portalApiBase}/public/tenants/${encodeURIComponent(subdomain)}/orders/${orderId}/status`, {
        method: "POST",
        headers,
        body: JSON.stringify({ status }),
      }),
    );
    onDone();
  }

  async function toggleEightySix(row: MenuItem) {
    try {
      await readJson(
        await fetch(`${portalApiBase}/public/tenants/${encodeURIComponent(subdomain)}/catalog/items`, {
          method: "POST",
          headers,
          body: JSON.stringify({
            id: row.id,
            name: row.name,
            kind: row.kind,
            amountMinor: row.amountMinor,
            description: row.description ?? row.name,
            available: row.available === false,
          }),
        }),
      );
      setNotice(row.available === false ? `${row.name} is back on.` : `${row.name} is 86'd.`);
      onDone();
    } catch (err) {
      setNotice(err instanceof Error ? err.message : "Could not update plate");
    }
  }

  async function requestKitchen(event: FormEvent) {
    event.preventDefault();
    setNotice(null);
    try {
      await readJson(
        await fetch(`${portalApiBase}/public/tenants/${encodeURIComponent(subdomain)}/supplies`, {
          method: "POST",
          headers,
          body: JSON.stringify({
            item: supplyItem,
            quantity: Number(supplyQty) || 1,
            note: supplyNote,
            toDepartment: "kitchen",
          }),
        }),
      );
      setSupplyItem("");
      setSupplyNote("");
      setNotice("Kitchen and the storekeeper have the request.");
      onDone();
    } catch (err) {
      setNotice(err instanceof Error ? err.message : "Could not request");
    }
  }

  return (
    <div data-testid="restaurant-board">
      <div className="today-stats">
        <span>{orders.filter((row) => row.status !== "delivered").length} open tickets</span>
        <span>{covers} covers</span>
        <span>{menu.filter((row) => row.available === false).length} 86'd</span>
        <span>{supplies.filter((row) => row.status === "requested").length} kitchen requests</span>
      </div>
      {notice ? (
        <p className={notice.includes("kitchen") || notice.includes("86") || notice.includes("back") ? "banner-ok" : "banner-error"}>
          {notice}
        </p>
      ) : null}
      <h3>{bar ? "Drinks on the board" : "Food on the board"}</h3>
      <div className="cards">
        {menu.map((row) => (
          <article className="card tap-card" key={row.id}>
            <p className="eyebrow">{row.kind.replaceAll("_", " ")}</p>
            <h2>{row.name}</h2>
            <p className="muted">
              {money(row.amountMinor)}
              {row.available === false ? " · 86'd" : ""}
            </p>
            <button className="btn btn-ghost" type="button" onClick={() => setItem(row.name)}>
              Order this for a guest
            </button>
            <button className="btn btn-ghost" type="button" onClick={() => void toggleEightySix(row)}>
              {row.available === false ? "Put back on" : "86 tonight"}
            </button>
          </article>
        ))}
      </div>
      <form className="form tap-form" onSubmit={(e) => void orderForGuest(e)}>
        <h3>Order for a guest</h3>
        <label>
          Guest name
          <input value={guestName} onChange={(e) => setGuestName(e.target.value)} required />
        </label>
        <label>
          Email
          <input type="email" value={guestEmail} onChange={(e) => setGuestEmail(e.target.value)} />
        </label>
        <OrderFulfillment tables={tables} value={fulfillment} onChange={setFulfillment} />
        <label>
          Plate
          <select value={item} onChange={(e) => setItem(e.target.value)}>
            {menu.filter((row) => row.available !== false).map((row) => (
              <option key={row.id} value={row.name}>
                {row.name}
              </option>
            ))}
          </select>
        </label>
        <label>
          Quantity
          <input type="number" min={1} max={12} value={qty} onChange={(e) => setQty(e.target.value)} />
        </label>
        <label>
          Allergy or note
          <input value={note} onChange={(e) => setNote(e.target.value)} placeholder="No peanuts, extra spice" />
        </label>
        <button className="btn btn-primary" type="submit">
          Send to kitchen
        </button>
      </form>
      <h3>Incoming orders</h3>
      <div className="fulfillment-tabs">
        {(["all", "received", "preparing", "ready", "delivered"] as const).map((key) => (
          <button key={key} type="button" className={sort === key ? "active" : ""} onClick={() => setSort(key)}>
            {key === "all" ? "Sorted board" : key}
          </button>
        ))}
      </div>
      <ul className="list">
        {shown.length === 0 ? <li className="muted">No tickets in this lane.</li> : null}
        {shown.map((order) => (
          <li key={order.id}>
            <strong>
              {order.item} × {order.quantity}
            </strong>
            <span className="muted">
              {order.guestName} · {order.status} · {ticketAge(order.createdAt)} · {fulfillmentLabel(order)}
              {order.note ? ` · ${order.note}` : ""}
            </span>
            <span className="deliverable-links">
              <button className="btn btn-ghost" type="button" onClick={() => void setStatus(order.id, "preparing")}>
                Prep
              </button>
              <button className="btn btn-ghost" type="button" onClick={() => void setStatus(order.id, "ready")}>
                Ready
              </button>
              <button className="btn btn-primary" type="button" onClick={() => void setStatus(order.id, "delivered")}>
                Done
              </button>
            </span>
          </li>
        ))}
      </ul>
      {kitchen && !bar ? (
        <>
          <h3>Kitchen requisitions</h3>
          <p className="hint">Restaurant requests land here. The storekeeper issues the stock.</p>
        </>
      ) : null}
      <form className="form tap-form" onSubmit={(e) => void requestKitchen(e)}>
        <h3>{kitchen && !bar ? "Ask the storekeeper" : "Request items from kitchen"}</h3>
        <p className="hint">Kitchen and the storekeeper see this. Front desk does not.</p>
        <label>
          Item
          <input value={supplyItem} onChange={(e) => setSupplyItem(e.target.value)} placeholder="Rice, oil, chicken" required />
        </label>
        <label>
          Quantity
          <input value={supplyQty} onChange={(e) => setSupplyQty(e.target.value)} />
        </label>
        <label>
          Note
          <input value={supplyNote} onChange={(e) => setSupplyNote(e.target.value)} placeholder="Needed for dinner service" />
        </label>
        <button className="btn btn-primary" type="submit">
          Send to kitchen
        </button>
      </form>
      <ul className="list">
        {supplies.length === 0 ? <li className="muted">No kitchen requests yet.</li> : null}
        {supplies.map((row) => (
          <li key={row.id}>
            <strong>
              {row.item} × {row.quantity}
            </strong>
            <span className="muted">
              {row.status} · {row.toDepartment}
              {row.note ? ` · ${row.note}` : ""}
            </span>
          </li>
        ))}
      </ul>
    </div>
  );
}

function StorekeeperBoard({
  subdomain,
  headers,
  supplies,
  onDone,
}: {
  subdomain: string;
  headers: Record<string, string>;
  supplies: Supply[];
  onDone: () => void;
}) {
  const [notice, setNotice] = useState<string | null>(null);
  const open = supplies.filter((row) => row.status === "requested" || row.status === "approved");
  const done = supplies.filter((row) => row.status === "fulfilled" || row.status === "rejected");

  async function mark(id: string, status: "approved" | "fulfilled" | "rejected") {
    try {
      await readJson(
        await fetch(`${portalApiBase}/public/tenants/${encodeURIComponent(subdomain)}/supplies/${id}/status`, {
          method: "POST",
          headers,
          body: JSON.stringify({ status }),
        }),
      );
      setNotice("Store log updated.");
      onDone();
    } catch (err) {
      setNotice(err instanceof Error ? err.message : "Could not update");
    }
  }

  return (
    <div data-testid="storekeeper-board">
      <div className="today-stats">
        <span>{open.length} open requests</span>
        <span>{done.filter((row) => row.status === "fulfilled").length} fulfilled</span>
      </div>
      {notice ? <p className="banner-ok">{notice}</p> : null}
      <h3>Kitchen and store requests</h3>
      <p className="hint">Restaurant and kitchen pull items here. Approve, then mark fulfilled when issued.</p>
      <ul className="list">
        {open.length === 0 ? <li className="muted">No open store requests.</li> : null}
        {open.map((row) => (
          <li key={row.id}>
            <strong>
              {row.item} × {row.quantity}
            </strong>
            <span className="muted">
              {row.fromStaffName} · {row.fromRole.replaceAll("_", " ")} → {row.toDepartment} · {row.status}
              {row.note ? ` · ${row.note}` : ""}
            </span>
            <span className="deliverable-links">
              {row.status === "requested" ? (
                <button className="btn btn-ghost" type="button" onClick={() => void mark(row.id, "approved")}>
                  Approve
                </button>
              ) : null}
              <button className="btn btn-primary" type="button" onClick={() => void mark(row.id, "fulfilled")}>
                Issue stock
              </button>
              <button className="btn btn-ghost" type="button" onClick={() => void mark(row.id, "rejected")}>
                Reject
              </button>
            </span>
          </li>
        ))}
      </ul>
      <h3>Issued</h3>
      <ul className="list">
        {done.length === 0 ? <li className="muted">Nothing issued yet.</li> : null}
        {done.map((row) => (
          <li key={row.id}>
            <strong>
              {row.item} × {row.quantity}
            </strong>
            <span className="muted">{row.status}</span>
          </li>
        ))}
      </ul>
    </div>
  );
}

function HousekeepBoard({
  subdomain,
  headers,
  rooms,
  counts,
  onDone,
}: {
  subdomain: string;
  headers: Record<string, string>;
  rooms: Room[];
  counts: RoomCounts | null;
  onDone: () => void;
}) {
  async function mark(roomId: string, housekeep: string) {
    await readJson(
      await fetch(`${portalApiBase}/public/tenants/${encodeURIComponent(subdomain)}/rooms/${roomId}/housekeep`, {
        method: "POST",
        headers,
        body: JSON.stringify({ housekeep }),
      }),
    );
    onDone();
  }
  return (
    <div>
      <div className="today-stats">
        <span>{counts?.dirty ?? 0} dirty</span>
        <span>{counts?.cleaning ?? 0} cleaning</span>
        <span>{counts?.ready ?? 0} ready</span>
      </div>
      <ul className="list">
        {rooms.map((room) => (
          <li key={room.id}>
            <strong>{room.name}</strong>
            <span className="muted">{room.housekeep}</span>
            <span className="deliverable-links">
              <button className="btn btn-ghost" type="button" onClick={() => void mark(room.id, "cleaning")}>
                Cleaning
              </button>
              <button className="btn btn-primary" type="button" onClick={() => void mark(room.id, "ready")}>
                Ready
              </button>
            </span>
          </li>
        ))}
      </ul>
    </div>
  );
}

function RiderBoard({
  subdomain,
  headers,
  orders,
  onDone,
}: {
  subdomain: string;
  headers: Record<string, string>;
  orders: Order[];
  onDone: () => void;
}) {
  async function delivered(orderId: string) {
    await readJson(
      await fetch(`${portalApiBase}/public/tenants/${encodeURIComponent(subdomain)}/orders/${orderId}/status`, {
        method: "POST",
        headers,
        body: JSON.stringify({ status: "delivered" }),
      }),
    );
    onDone();
  }
  return (
    <ul className="list">
      {orders.length === 0 ? <li className="muted">No takeaway tickets ready.</li> : null}
      {orders.map((order) => (
        <li key={order.id}>
          <strong>
            {order.item} × {order.quantity}
          </strong>
          <span className="muted">
            {order.guestName} · {fulfillmentLabel(order)}
          </span>
          {order.lat != null && order.lng != null ? (
            <a href={`https://www.openstreetmap.org/?mlat=${order.lat}&mlon=${order.lng}#map=16/${order.lat}/${order.lng}`} target="_blank" rel="noreferrer">
              Open map
            </a>
          ) : null}
          <button className="btn btn-primary" type="button" onClick={() => void delivered(order.id)}>
            Delivered
          </button>
        </li>
      ))}
    </ul>
  );
}
