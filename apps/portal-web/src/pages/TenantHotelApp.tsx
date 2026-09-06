import { useEffect, useMemo, useState, type FormEvent } from "react";
import { BrowserRouter, Navigate, Route, Routes, useNavigate } from "react-router-dom";
import { BusinessHome } from "../components/BusinessHome";
import { emptyFulfillment, fulfillmentPayload, OrderFulfillment, type FulfillmentChoice } from "../components/OrderFulfillment";
import { TenantAppChrome } from "../components/TenantAppChrome";
import { portalApiBase } from "../lib/api";
import { TenantOwnerAdmin } from "./TenantOwnerAdmin";
import { TenantStaffDesk } from "./TenantStaffDesk";

type Room = { id: string; name: string; beds: string; nightlyMinor: number; housekeep: string; photoUrl?: string };
type MenuItem = { id: string; name: string; kind: "restaurant" | "bar" | "room_service"; amountMinor: number; description: string; available?: boolean };
type Booking = {
  id: string;
  roomName: string;
  guestName: string;
  guestEmail: string;
  checkIn: string;
  checkOut: string;
  nights: number;
  totalMinor: number;
  status: string;
};
type Order = {
  id: string;
  item: string;
  kind: string;
  quantity: number;
  amountMinor: number;
  guestName: string;
  roomName?: string;
  status: string;
};
type Staff = { id: string; name: string; email: string; role: "owner" | "front_desk" | "restaurant" | "bar" | "housekeeping" | "rider" };
type HotelPublic = {
  tenant: {
    displayName: string;
    subdomain: string;
    hostname: string;
    features: string[];
    branding: {
      name: string;
      primaryColor: string;
      logoUrl?: string;
      backgroundUrl?: string;
      heroTitle?: string;
      writeup?: string;
      phone?: string;
      email?: string;
      address?: string;
      dashboardStyle?: "console" | "greetings";
      testimonials?: Array<{ name: string; quote: string; visit: string }>;
      staffAppUrl?: string;
    };
    ownerHint?: string;
  };
  rooms: Room[];
  menu: MenuItem[];
  tables?: Array<{ id: string; name: string; seats: number }>;
};

function money(minor: number) {
  return `$${(minor / 100).toFixed(0)}`;
}

function staffKey(subdomain: string) {
  return `hotel.staff.${subdomain}`;
}

function guestKey(subdomain: string) {
  return `hotel.guest.${subdomain}`;
}

async function readJson(res: Response) {
  const body = await res.json();
  if (!res.ok) throw new Error(body.message || "Request failed");
  return body;
}

export function TenantHotelApp({ subdomain, basename }: { subdomain: string; basename: string }) {
  const [data, setData] = useState<HotelPublic | null>(null);
  const [error, setError] = useState<string | null>(null);

  async function refresh() {
    const res = await fetch(`${portalApiBase}/public/tenants/${encodeURIComponent(subdomain)}`);
    if (!res.ok) throw new Error("This hotel is not ready.");
    setData((await res.json()) as HotelPublic);
    setError(null);
  }

  useEffect(() => {
    void refresh().catch((err) => setError(err instanceof Error ? err.message : "Could not load hotel."));
  }, [subdomain]);

  useEffect(() => {
    if (typeof navigator !== "undefined" && "serviceWorker" in navigator) {
      void navigator.serviceWorker.register("/sw.js").catch(() => undefined);
    }
  }, []);

  const color = data?.tenant.branding.primaryColor ?? "#0d7a6f";
  const style = useMemo(() => ({ ["--los-accent" as string]: color }), [color]);

  if (error) {
    return (
      <div className="tap tap-boot" style={style}>
        <p className="banner-error">{error}</p>
      </div>
    );
  }
  if (!data) {
    return (
      <div className="tap tap-boot" style={style}>
        <p className="muted">Opening {subdomain}…</p>
      </div>
    );
  }

  return (
    <div className="hotel-app" style={style} data-testid="hotel-tenant-app">
      <BrowserRouter basename={basename}>
        <Routes>
          <Route
            path="/admin"
            element={
              <TenantOwnerAdmin
                subdomain={subdomain}
                branding={data.tenant.branding}
                verticalId="hotel"
                ownerHint={data.tenant.ownerHint}
                hotel
              />
            }
          />
          <Route
            path="/staff"
            element={<TenantStaffDesk subdomain={subdomain} branding={data.tenant.branding} hotel kitchen={false} />}
          />
          <Route
            path="/*"
            element={
              <TenantAppChrome
                brand={data.tenant.branding.name}
                accent={color}
                titles={{
                  "/": "Home",
                  "/rooms": "Rooms",
                  "/food": "Food",
                  "/drinks": "Drinks",
                  "/activities": "Activities",
                  "/stay": "Activities",
                }}
                tabs={[
                  { to: "/", label: "Home", icon: "home" },
                  { to: "/rooms", label: "Rooms", icon: "stay" },
                  { to: "/food", label: "Food", icon: "food" },
                  { to: "/drinks", label: "Drinks", icon: "drink" },
                  { to: "/activities", label: "Activities", icon: "activity" },
                ]}
              >
                <Routes>
                  <Route path="/" element={<HotelHome data={data} />} />
                  <Route
                    path="/rooms"
                    element={<GuestRooms data={data} subdomain={subdomain} onDone={() => void refresh()} />}
                  />
                  <Route
                    path="/food"
                    element={<GuestMenu data={data} subdomain={subdomain} kind="restaurant" onDone={() => void refresh()} />}
                  />
                  <Route
                    path="/drinks"
                    element={<GuestMenu data={data} subdomain={subdomain} kind="bar" onDone={() => void refresh()} />}
                  />
                  <Route path="/activities" element={<GuestStay data={data} subdomain={subdomain} />} />
                  <Route path="/stay" element={<Navigate to="/activities" replace />} />
                  <Route path="*" element={<Navigate to="/" replace />} />
                </Routes>
              </TenantAppChrome>
            }
          />
        </Routes>
      </BrowserRouter>
    </div>
  );
}

function useGuestIdentity(subdomain: string) {
  const [guestName, setGuestName] = useState("");
  const [guestEmail, setGuestEmail] = useState("");
  useEffect(() => {
    try {
      const raw = localStorage.getItem(guestKey(subdomain));
      if (!raw) return;
      const parsed = JSON.parse(raw) as { name?: string; email?: string };
      setGuestName(parsed.name ?? "");
      setGuestEmail(parsed.email ?? "");
    } catch {
      /* ignore */
    }
  }, [subdomain]);
  function remember(name: string, email: string) {
    setGuestName(name);
    setGuestEmail(email);
    localStorage.setItem(guestKey(subdomain), JSON.stringify({ name, email }));
  }
  return { guestName, guestEmail, setGuestName, setGuestEmail, remember };
}

function GuestIdentity({
  guestName,
  guestEmail,
  setGuestName,
  setGuestEmail,
}: {
  guestName: string;
  guestEmail: string;
  setGuestName: (value: string) => void;
  setGuestEmail: (value: string) => void;
}) {
  return (
    <form className="form" onSubmit={(e) => e.preventDefault()}>
      <label>
        Your name
        <input value={guestName} onChange={(e) => setGuestName(e.target.value)} required />
      </label>
      <label>
        Email
        <input type="email" value={guestEmail} onChange={(e) => setGuestEmail(e.target.value)} required />
      </label>
    </form>
  );
}

function HotelHome({ data }: { data: HotelPublic }) {
  const brand = data.tenant.branding;
  return (
    <div data-testid="hotel-home">
      <BusinessHome
        name={brand.name}
        logoUrl={brand.logoUrl}
        backgroundUrl={brand.backgroundUrl}
        heroTitle={brand.heroTitle}
        writeup={brand.writeup}
        quotesEyebrow="From guests who stayed here"
        phone={brand.phone}
        email={brand.email}
        address={brand.address}
        story={`${brand.name} is a stay for people who want a real room, a plated dinner, and a quiet night — booked from this phone, not a brochure.`}
        primaryCta={{ to: "/rooms", label: "Book a room" }}
        secondaryCta={{ to: "/food", label: "Order food" }}
        testimonials={brand.testimonials ?? []}
      />
    </div>
  );
}

function GuestRooms({
  data,
  subdomain,
  onDone,
}: {
  data: HotelPublic;
  subdomain: string;
  onDone: () => void;
}) {
  const identity = useGuestIdentity(subdomain);
  const [checkIn, setCheckIn] = useState("");
  const [checkOut, setCheckOut] = useState("");
  const [busy, setBusy] = useState(false);
  const [notice, setNotice] = useState<string | null>(null);
  const [filter, setFilter] = useState<"ready" | "all">("ready");
  const [picked, setPicked] = useState<string[]>([]);

  const rooms = data.rooms.filter((room) => (filter === "ready" ? room.housekeep === "ready" : true));

  async function book(roomId?: string) {
    setBusy(true);
    setNotice(null);
    try {
      identity.remember(identity.guestName, identity.guestEmail);
      const body = await readJson(
        await fetch(`${portalApiBase}/public/tenants/${encodeURIComponent(subdomain)}/bookings`, {
          method: "POST",
          headers: { "Content-Type": "application/json" },
          body: JSON.stringify({
            roomIds: roomId ? [roomId] : picked,
            guestName: identity.guestName,
            guestEmail: identity.guestEmail,
            checkIn,
            checkOut,
          }),
        }),
      );
      const count = (body.bookings as unknown[] | undefined)?.length ?? 1;
      setNotice(`${count} room(s) reserved. Open Activities to check in.`);
      setPicked([]);
      onDone();
    } catch (err) {
      setNotice(err instanceof Error ? err.message : "Could not book");
    } finally {
      setBusy(false);
    }
  }

  return (
    <main className="page">
      <p className="eyebrow">Rooms</p>
      <h2>Scan available rooms and book</h2>
      <p className="lead">
        {data.tenant.branding.name} rooms, restaurant, bar, self check-in, and housekeeping — not the
        hospitality suite.
      </p>
      {notice ? <p className={notice.includes("reserved") ? "banner-ok" : "banner-error"}>{notice}</p> : null}
      <GuestIdentity {...identity} />
      <form className="form" onSubmit={(e) => e.preventDefault()}>
        <label>
          Check-in
          <input type="date" value={checkIn} onChange={(e) => setCheckIn(e.target.value)} required />
        </label>
        <label>
          Check-out
          <input type="date" value={checkOut} onChange={(e) => setCheckOut(e.target.value)} required />
        </label>
        <label>
          Show
          <select value={filter} onChange={(e) => setFilter(e.target.value as "ready" | "all")}>
            <option value="ready">Ready to book</option>
            <option value="all">All rooms</option>
          </select>
        </label>
      </form>
      <section className="cards" data-testid="hotel-rooms">
        {rooms.length === 0 ? <p className="muted">No rooms match this filter.</p> : null}
        {rooms.map((room) => (
          <article className="card tap-card" key={room.id}>
            {room.photoUrl ? <img className="catalog-photo" src={room.photoUrl} alt={room.name} /> : null}
            <p className="eyebrow">{room.housekeep}</p>
            <h2>{room.name}</h2>
            <p className="muted">
              {room.beds} · {money(room.nightlyMinor)} / night
            </p>
            <label className="hint">
              <input
                type="checkbox"
                checked={picked.includes(room.id)}
                disabled={room.housekeep !== "ready"}
                onChange={() =>
                  setPicked((current) =>
                    current.includes(room.id) ? current.filter((id) => id !== room.id) : [...current, room.id],
                  )
                }
              />{" "}
              Add to stay
            </label>
            <button
              className="btn btn-primary"
              disabled={
                busy ||
                room.housekeep !== "ready" ||
                !identity.guestName ||
                !identity.guestEmail ||
                !checkIn ||
                !checkOut
              }
              onClick={() => void book(room.id)}
            >
              {room.housekeep === "ready" ? "Book this room" : room.housekeep}
            </button>
          </article>
        ))}
        {picked.length > 0 ? (
          <button
            className="btn btn-primary"
            disabled={busy || !identity.guestName || !identity.guestEmail || !checkIn || !checkOut}
            onClick={() => void book()}
          >
            Book {picked.length} rooms together
          </button>
        ) : null}
      </section>
    </main>
  );
}

function GuestMenu({
  data,
  subdomain,
  kind,
  onDone,
}: {
  data: HotelPublic;
  subdomain: string;
  kind: "restaurant" | "bar";
  onDone: () => void;
}) {
  const identity = useGuestIdentity(subdomain);
  const tables = data.tables ?? [];
  const [fulfillment, setFulfillment] = useState<FulfillmentChoice>(() => emptyFulfillment(tables));
  const [busy, setBusy] = useState(false);
  const [notice, setNotice] = useState<string | null>(null);
  const [qty, setQty] = useState<Record<string, number>>({});
  const [bag, setBag] = useState<Array<{ item: string; kind: string; quantity: number }>>([]);
  const items = data.menu.filter((item) => item.available !== false && (item.kind === kind || item.kind === "room_service"));

  function quantity(id: string) {
    return qty[id] ?? 1;
  }

  function addToBag(item: MenuItem) {
    const quantityValue = quantity(item.id);
    setBag((current) => [...current, { item: item.name, kind: item.kind, quantity: quantityValue }]);
    setNotice(`${quantityValue} × ${item.name} added to the order.`);
  }

  async function placeBag() {
    if (!bag.length) return;
    setBusy(true);
    setNotice(null);
    try {
      identity.remember(identity.guestName, identity.guestEmail);
      await readJson(
        await fetch(`${portalApiBase}/public/tenants/${encodeURIComponent(subdomain)}/orders`, {
          method: "POST",
          headers: { "Content-Type": "application/json" },
          body: JSON.stringify({
            items: bag,
            guestName: identity.guestName || "Guest",
            guestEmail: identity.guestEmail || undefined,
            ...fulfillmentPayload(fulfillment),
          }),
        }),
      );
      setNotice(`${bag.length} item(s) sent to the kitchen.`);
      setBag([]);
      onDone();
    } catch (err) {
      setNotice(err instanceof Error ? err.message : "Could not order");
    } finally {
      setBusy(false);
    }
  }

  return (
    <main className="page">
      <p className="eyebrow">{kind === "restaurant" ? "Restaurant" : "Bar"}</p>
      <h2>{kind === "restaurant" ? "Order food" : "Order drinks"}</h2>
      <p className="lead">Walk-in plates go to a table. Takeaway leaves with a rider after you pin a location. Add several items, then send the order.</p>
      {notice ? <p className={notice.includes("kitchen") || notice.includes("added") ? "banner-ok" : "banner-error"}>{notice}</p> : null}
      <GuestIdentity {...identity} />
      <OrderFulfillment tables={tables} value={fulfillment} onChange={setFulfillment} />
      <section className="cards">
        {items.map((item) => (
          <article className="card" key={item.id}>
            <p className="eyebrow">{item.kind.replaceAll("_", " ")}</p>
            <h2>{item.name}</h2>
            <p className="muted">
              {item.description} · {money(item.amountMinor)}
            </p>
            <label>
              Quantity
              <input
                type="number"
                min={1}
                max={20}
                value={quantity(item.id)}
                onChange={(e) => setQty((current) => ({ ...current, [item.id]: Math.max(1, Number(e.target.value) || 1) }))}
              />
            </label>
            <button className="btn btn-ghost" disabled={busy} onClick={() => addToBag(item)}>
              Add to order
            </button>
          </article>
        ))}
      </section>
      {bag.length ? (
        <div className="card">
          <p>
            <strong>{bag.length} item(s) in this order</strong>
          </p>
          <ul className="list">
            {bag.map((line, index) => (
              <li key={`${line.item}-${index}`}>
                {line.quantity} × {line.item}
              </li>
            ))}
          </ul>
          <button className="btn btn-primary" disabled={busy} onClick={() => void placeBag()}>
            Send order
          </button>
        </div>
      ) : null}
    </main>
  );
}

function GuestStay({ data, subdomain }: { data: HotelPublic; subdomain: string }) {
  const identity = useGuestIdentity(subdomain);
  const [bookings, setBookings] = useState<Booking[]>([]);
  const [orders, setOrders] = useState<Order[]>([]);
  const [notice, setNotice] = useState<string | null>(null);

  async function loadStay(email = identity.guestEmail) {
    if (!email) return;
    const res = await fetch(
      `${portalApiBase}/public/tenants/${encodeURIComponent(subdomain)}/stay?email=${encodeURIComponent(email)}`,
    );
    const body = await res.json();
    if (!res.ok) throw new Error(body.message || "Could not load stay");
    setBookings(body.bookings ?? []);
    setOrders(body.orders ?? []);
  }

  useEffect(() => {
    if (identity.guestEmail) void loadStay(identity.guestEmail).catch(() => undefined);
  }, [identity.guestEmail, subdomain]);

  async function check(status: "check-in" | "check-out", bookingId: string) {
    setNotice(null);
    try {
      identity.remember(identity.guestName, identity.guestEmail);
      await readJson(
        await fetch(`${portalApiBase}/public/tenants/${encodeURIComponent(subdomain)}/stay/${status}`, {
          method: "POST",
          headers: { "Content-Type": "application/json" },
          body: JSON.stringify({
            guestEmail: identity.guestEmail,
            guestName: identity.guestName,
            bookingId,
          }),
        }),
      );
      setNotice(status === "check-in" ? "You are checked in." : "You are checked out. Housekeeping will reset the room.");
      await loadStay();
    } catch (err) {
      setNotice(err instanceof Error ? err.message : "Could not update stay");
    }
  }

  return (
    <main className="page">
      <p className="eyebrow">Activities</p>
      <h2>Your bookings and orders</h2>
      <p className="lead">Every reservation and kitchen ticket for this stay lives here. Check in when you arrive.</p>
      {notice ? <p className={notice.includes("checked") ? "banner-ok" : "banner-error"}>{notice}</p> : null}
      <GuestIdentity {...identity} />
      <div className="actions">
        <button
          className="btn btn-ghost"
          type="button"
          onClick={() => {
            identity.remember(identity.guestName, identity.guestEmail);
            void loadStay(identity.guestEmail).catch((err) => setNotice(err.message));
          }}
        >
          Find my stay
        </button>
      </div>
      <h3>Reservations at {data.tenant.branding.name}</h3>
      <ul className="list">
        {bookings.length === 0 ? <li className="muted">No stay found for this email.</li> : null}
        {bookings.map((booking) => (
          <li key={booking.id}>
            <strong>
              {booking.roomName} · {booking.status}
            </strong>
            <span className="muted">
              {booking.checkIn} → {booking.checkOut} · {money(booking.totalMinor)}
            </span>
            <span className="deliverable-links">
              {booking.status === "confirmed" ? (
                <button className="btn btn-primary" type="button" onClick={() => void check("check-in", booking.id)}>
                  Self check-in
                </button>
              ) : null}
              {booking.status === "checked_in" ? (
                <button className="btn btn-ghost" type="button" onClick={() => void check("check-out", booking.id)}>
                  Self check-out
                </button>
              ) : null}
            </span>
          </li>
        ))}
      </ul>
      <h3>Orders</h3>
      <ul className="list">
        {orders.length === 0 ? <li className="muted">No food or drink orders yet.</li> : null}
        {orders.map((order) => (
          <li key={order.id}>
            <strong>
              {order.item} × {order.quantity}
            </strong>
            <span className="muted">
              {order.kind} · {order.status} · {money(order.amountMinor)}
            </span>
          </li>
        ))}
      </ul>
    </main>
  );
}

export function StaffGate({ data, subdomain }: { data: HotelPublic; subdomain: string }) {
  const [session, setSession] = useState<{ token: string; staff: Staff } | null>(null);

  useEffect(() => {
    try {
      const raw = localStorage.getItem(staffKey(subdomain));
      if (raw) setSession(JSON.parse(raw) as { token: string; staff: Staff });
    } catch {
      setSession(null);
    }
  }, [subdomain]);

  function signedIn(next: { token: string; staff: Staff }) {
    localStorage.setItem(staffKey(subdomain), JSON.stringify(next));
    setSession(next);
  }

  function signOut() {
    localStorage.removeItem(staffKey(subdomain));
    setSession(null);
  }

  if (!session) {
    return <StaffLogin data={data} subdomain={subdomain} onLogin={signedIn} />;
  }
  return <StaffDesk data={data} subdomain={subdomain} session={session} onLogout={signOut} />;
}

function StaffLogin({
  data,
  subdomain,
  onLogin,
}: {
  data: HotelPublic;
  subdomain: string;
  onLogin: (session: { token: string; staff: Staff }) => void;
}) {
  const [email, setEmail] = useState(data.tenant.ownerHint ?? "");
  const [password, setPassword] = useState("");
  const [error, setError] = useState<string | null>(null);
  const [busy, setBusy] = useState(false);

  async function submit(event: FormEvent) {
    event.preventDefault();
    setBusy(true);
    setError(null);
    try {
      const body = await readJson(
        await fetch(`${portalApiBase}/public/tenants/${encodeURIComponent(subdomain)}/staff/login`, {
          method: "POST",
          headers: { "Content-Type": "application/json" },
          body: JSON.stringify({ email, password }),
        }),
      );
      onLogin({ token: body.token, staff: body.staff });
    } catch (err) {
      setError(err instanceof Error ? err.message : "Could not sign in");
    } finally {
      setBusy(false);
    }
  }

  return (
    <main className="page">
      <p className="eyebrow">Staff login</p>
      <h2>{data.tenant.branding.name} dashboards</h2>
      <p className="lead">
        Each staff account opens only its assigned board. Owner creates front desk, restaurant, bar,
        and housekeeping.
      </p>
      {error ? <p className="banner-error">{error}</p> : null}
      <form className="form" onSubmit={(e) => void submit(e)}>
        <label>
          Staff email
          <input type="email" value={email} onChange={(e) => setEmail(e.target.value)} required />
        </label>
        <label>
          Password
          <input type="password" value={password} onChange={(e) => setPassword(e.target.value)} required />
        </label>
        <button className="btn btn-primary" disabled={busy} type="submit">
          {busy ? "Signing in…" : "Open my dashboard"}
        </button>
      </form>
      <p className="hint">
        First owner login uses the install email ({data.tenant.ownerHint}) and password{" "}
        <code>hotel-owner</code> unless you set one at install.
      </p>
    </main>
  );
}

function StaffDesk({
  data,
  subdomain,
  session,
  onLogout,
}: {
  data: HotelPublic;
  subdomain: string;
  session: { token: string; staff: Staff };
  onLogout: () => void;
}) {
  const [rooms, setRooms] = useState<Room[]>([]);
  const [bookings, setBookings] = useState<Booking[]>([]);
  const [orders, setOrders] = useState<Order[]>([]);
  const [team, setTeam] = useState<Staff[]>([]);
  const [error, setError] = useState<string | null>(null);
  const navigate = useNavigate();

  const headers = {
    "Content-Type": "application/json",
    "X-Hotel-Staff": session.token,
  };

  async function loadOps() {
    const res = await fetch(`${portalApiBase}/public/tenants/${encodeURIComponent(subdomain)}/ops`, { headers });
    const body = await res.json();
    if (res.status === 401) {
      onLogout();
      return;
    }
    if (!res.ok) throw new Error(body.message || "Could not load dashboard");
    setRooms(body.rooms ?? []);
    setBookings(body.bookings ?? []);
    setOrders(body.orders ?? []);
    setTeam(body.team ?? []);
  }

  useEffect(() => {
    void loadOps().catch((err) => setError(err instanceof Error ? err.message : "Dashboard failed"));
  }, [subdomain, session.token]);

  async function post(path: string, payload: unknown) {
    setError(null);
    await readJson(
      await fetch(`${portalApiBase}/public/tenants/${encodeURIComponent(subdomain)}${path}`, {
        method: "POST",
        headers,
        body: JSON.stringify(payload),
      }),
    );
    await loadOps();
  }

  const role = session.staff.role;
  const title =
    role === "owner"
      ? "Owner"
      : role === "front_desk"
        ? "Front desk"
        : role === "restaurant"
          ? "Restaurant"
          : role === "bar"
            ? "Bar"
            : "Housekeeping";

  return (
    <main className="page">
      <header className="page-head">
        <p className="eyebrow">{data.tenant.branding.name}</p>
        <h2>
          {title} · {session.staff.name}
        </h2>
        <p className="lead">This board only shows work assigned to {session.staff.role.replaceAll("_", " ")}.</p>
        <div className="actions">
          <button className="btn btn-ghost" type="button" onClick={onLogout}>
            Sign out
          </button>
          <button className="btn btn-ghost" type="button" onClick={() => navigate("/")}>
            Guest app
          </button>
        </div>
      </header>
      {error ? <p className="banner-error">{error}</p> : null}
      {role === "owner" ? (
        <OwnerStaffForm subdomain={subdomain} headers={headers} onCreated={() => void loadOps()} />
      ) : null}
      {role === "owner" && team.length ? (
        <>
          <h3>Staff</h3>
          <ul className="list">
            {team.map((member) => (
              <li key={member.id}>
                <strong>{member.name}</strong>
                <span className="muted">
                  {member.email} · {member.role.replaceAll("_", " ")}
                </span>
              </li>
            ))}
          </ul>
        </>
      ) : null}
      {role === "owner" || role === "front_desk" ? (
        <>
          <h3>Bookings and check-in</h3>
          <ul className="list">
            {bookings.length === 0 ? <li className="muted">No bookings yet.</li> : null}
            {bookings.map((booking) => (
              <li key={booking.id}>
                <strong>
                  {booking.guestName} · {booking.roomName}
                </strong>
                <span className="muted">
                  {booking.checkIn} → {booking.checkOut} · {booking.status} · {money(booking.totalMinor)}
                </span>
                <span className="deliverable-links">
                  <button
                    className="btn btn-ghost"
                    type="button"
                    onClick={() => void post(`/bookings/${booking.id}/status`, { status: "checked_in" })}
                  >
                    Check in
                  </button>
                  <button
                    className="btn btn-ghost"
                    type="button"
                    onClick={() => void post(`/bookings/${booking.id}/status`, { status: "checked_out" })}
                  >
                    Check out
                  </button>
                </span>
              </li>
            ))}
          </ul>
        </>
      ) : null}
      {role === "owner" || role === "restaurant" || role === "bar" ? (
        <>
          <h3>{role === "bar" ? "Bar tickets" : role === "restaurant" ? "Kitchen tickets" : "Food and drink tickets"}</h3>
          <ul className="list">
            {orders.length === 0 ? <li className="muted">No tickets yet.</li> : null}
            {orders.map((order) => (
              <li key={order.id}>
                <strong>
                  {order.item} × {order.quantity}
                </strong>
                <span className="muted">
                  {order.guestName} · {order.kind} · {order.status} · {money(order.amountMinor)}
                </span>
                <span className="deliverable-links">
                  <button
                    className="btn btn-ghost"
                    type="button"
                    onClick={() => void post(`/orders/${order.id}/status`, { status: "preparing" })}
                  >
                    Preparing
                  </button>
                  <button
                    className="btn btn-ghost"
                    type="button"
                    onClick={() => void post(`/orders/${order.id}/status`, { status: "ready" })}
                  >
                    Ready
                  </button>
                  <button
                    className="btn btn-ghost"
                    type="button"
                    onClick={() => void post(`/orders/${order.id}/status`, { status: "delivered" })}
                  >
                    Delivered
                  </button>
                </span>
              </li>
            ))}
          </ul>
        </>
      ) : null}
      {role === "owner" || role === "housekeeping" ? (
        <>
          <h3>Rooms to clean</h3>
          <ul className="list">
            {rooms.map((room) => (
              <li key={room.id}>
                <strong>{room.name}</strong>
                <span className="muted">
                  {room.beds} · {room.housekeep}
                </span>
                <span className="deliverable-links">
                  <button
                    className="btn btn-ghost"
                    type="button"
                    onClick={() => void post(`/rooms/${room.id}/housekeep`, { housekeep: "cleaning" })}
                  >
                    Cleaning
                  </button>
                  <button
                    className="btn btn-primary"
                    type="button"
                    onClick={() => void post(`/rooms/${room.id}/housekeep`, { housekeep: "ready" })}
                  >
                    Ready to book
                  </button>
                </span>
              </li>
            ))}
          </ul>
        </>
      ) : null}
    </main>
  );
}

function OwnerStaffForm({
  subdomain,
  headers,
  onCreated,
}: {
  subdomain: string;
  headers: Record<string, string>;
  onCreated: () => void;
}) {
  const [name, setName] = useState("");
  const [email, setEmail] = useState("");
  const [password, setPassword] = useState("");
  const [role, setRole] = useState<Staff["role"]>("front_desk");
  const [notice, setNotice] = useState<string | null>(null);

  async function submit(event: FormEvent) {
    event.preventDefault();
    setNotice(null);
    try {
      await readJson(
        await fetch(`${portalApiBase}/public/tenants/${encodeURIComponent(subdomain)}/staff`, {
          method: "POST",
          headers,
          body: JSON.stringify({ name, email, password, role }),
        }),
      );
      setName("");
      setEmail("");
      setPassword("");
      setNotice(`${role.replaceAll("_", " ")} account created. They can sign in on Staff.`);
      onCreated();
    } catch (err) {
      setNotice(err instanceof Error ? err.message : "Could not create staff");
    }
  }

  return (
    <section>
      <h3>Create staff</h3>
      {notice ? <p className={notice.includes("created") ? "banner-ok" : "banner-error"}>{notice}</p> : null}
      <form className="form" onSubmit={(e) => void submit(e)}>
        <label>
          Name
          <input value={name} onChange={(e) => setName(e.target.value)} required />
        </label>
        <label>
          Email
          <input type="email" value={email} onChange={(e) => setEmail(e.target.value)} required />
        </label>
        <label>
          Password
          <input type="password" value={password} onChange={(e) => setPassword(e.target.value)} minLength={6} required />
        </label>
        <label>
          Dashboard
          <select value={role} onChange={(e) => setRole(e.target.value as Staff["role"])}>
            <option value="front_desk">Front desk</option>
            <option value="restaurant">Restaurant</option>
            <option value="bar">Bar</option>
            <option value="housekeeping">Housekeeping</option>
          </select>
        </label>
        <button className="btn btn-primary" type="submit">
          Create staff
        </button>
      </form>
    </section>
  );
}
