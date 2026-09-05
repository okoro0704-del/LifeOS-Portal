import { useEffect, useMemo, useState, type FormEvent } from "react";
import { BrowserRouter, Navigate, Route, Routes, useNavigate } from "react-router-dom";
import { TenantAppChrome } from "../components/TenantAppChrome";
import { portalApiBase } from "../lib/api";

type Room = { id: string; name: string; beds: string; nightlyMinor: number; housekeep: string };
type MenuItem = { id: string; name: string; kind: "restaurant" | "bar" | "room_service"; amountMinor: number; description: string };
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
type Staff = { id: string; name: string; email: string; role: "owner" | "front_desk" | "restaurant" | "bar" | "housekeeping" };
type HotelPublic = {
  tenant: {
    displayName: string;
    subdomain: string;
    hostname: string;
    features: string[];
    branding: { name: string; primaryColor: string };
    ownerHint?: string;
  };
  rooms: Room[];
  menu: MenuItem[];
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
        <TenantAppChrome
          brand={data.tenant.branding.name}
          accent={color}
          titles={{
            "/": "Rooms",
            "/food": "Food",
            "/drinks": "Drinks",
            "/stay": "My stay",
            "/admin": "Staff",
          }}
          tabs={[
            { to: "/", label: "Rooms", icon: "stay" },
            { to: "/food", label: "Food", icon: "food" },
            { to: "/drinks", label: "Drinks", icon: "drink" },
            { to: "/stay", label: "Stay", icon: "home" },
            { to: "/admin", label: "Staff", icon: "staff" },
          ]}
        >
          <Routes>
            <Route path="/" element={<GuestRooms data={data} subdomain={subdomain} onDone={() => void refresh()} />} />
            <Route
              path="/food"
              element={<GuestMenu data={data} subdomain={subdomain} kind="restaurant" onDone={() => void refresh()} />}
            />
            <Route
              path="/drinks"
              element={<GuestMenu data={data} subdomain={subdomain} kind="bar" onDone={() => void refresh()} />}
            />
            <Route path="/stay" element={<GuestStay data={data} subdomain={subdomain} />} />
            <Route path="/admin" element={<StaffGate data={data} subdomain={subdomain} />} />
            <Route path="*" element={<Navigate to="/" replace />} />
          </Routes>
        </TenantAppChrome>
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

  const rooms = data.rooms.filter((room) => (filter === "ready" ? room.housekeep === "ready" : true));

  async function book(roomId: string) {
    setBusy(true);
    setNotice(null);
    try {
      identity.remember(identity.guestName, identity.guestEmail);
      const body = await readJson(
        await fetch(`${portalApiBase}/public/tenants/${encodeURIComponent(subdomain)}/bookings`, {
          method: "POST",
          headers: { "Content-Type": "application/json" },
          body: JSON.stringify({
            roomId,
            guestName: identity.guestName,
            guestEmail: identity.guestEmail,
            checkIn,
            checkOut,
          }),
        }),
      );
      setNotice(`Room reserved for ${body.booking.nights} night(s). Use My stay to check in.`);
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
          <article className="card" key={room.id}>
            <p className="eyebrow">{room.housekeep}</p>
            <h2>{room.name}</h2>
            <p className="muted">
              {room.beds} · {money(room.nightlyMinor)} / night
            </p>
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
              {room.housekeep === "ready" ? "Book room" : room.housekeep}
            </button>
          </article>
        ))}
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
  const [busy, setBusy] = useState(false);
  const [notice, setNotice] = useState<string | null>(null);
  const items = data.menu.filter((item) => item.kind === kind || item.kind === "room_service");

  async function order(item: MenuItem) {
    setBusy(true);
    setNotice(null);
    try {
      identity.remember(identity.guestName, identity.guestEmail);
      await readJson(
        await fetch(`${portalApiBase}/public/tenants/${encodeURIComponent(subdomain)}/orders`, {
          method: "POST",
          headers: { "Content-Type": "application/json" },
          body: JSON.stringify({
            item: item.name,
            kind: item.kind,
            quantity: 1,
            guestName: identity.guestName || "Guest",
            guestEmail: identity.guestEmail || undefined,
          }),
        }),
      );
      setNotice(`${item.name} is on the way.`);
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
      <p className="lead">Kitchen and bar tickets go to the matching staff dashboard.</p>
      {notice ? <p className={notice.includes("on the way") ? "banner-ok" : "banner-error"}>{notice}</p> : null}
      <GuestIdentity {...identity} />
      <section className="cards">
        {items.map((item) => (
          <article className="card" key={item.id}>
            <p className="eyebrow">{item.kind.replaceAll("_", " ")}</p>
            <h2>{item.name}</h2>
            <p className="muted">
              {item.description} · {money(item.amountMinor)}
            </p>
            <button className="btn btn-primary" disabled={busy} onClick={() => void order(item)}>
              {kind === "bar" ? "Order drink" : "Order food"}
            </button>
          </article>
        ))}
      </section>
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
      <p className="eyebrow">My stay</p>
      <h2>Self check-in and check-out</h2>
      <p className="lead">Use the email on your reservation. Front desk can also check you in.</p>
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

function StaffGate({ data, subdomain }: { data: HotelPublic; subdomain: string }) {
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
