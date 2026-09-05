import { useEffect, useState, type FormEvent } from "react";
import { GreetingsHeader } from "../components/GreetingsHeader";
import { TenantAppChrome } from "../components/TenantAppChrome";
import { portalApiBase } from "../lib/api";
import { readImageDataUrl } from "../lib/images";

type Staff = { id: string; name: string; email: string; role: string };
type Branding = { name: string; primaryColor: string; dashboardStyle?: "console" | "greetings" };
type Order = { id: string; item: string; quantity: number; status: string; guestName: string; amountMinor: number };
type Room = { id: string; name: string; beds: string; housekeep: string; nightlyMinor?: number; photoUrl?: string };
type MenuItem = { id: string; name: string; kind: string; amountMinor: number };

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
  const [menu, setMenu] = useState<MenuItem[]>([]);
  const [error, setError] = useState<string | null>(null);
  const [guestName, setGuestName] = useState("");
  const [guestEmail, setGuestEmail] = useState("");
  const [item, setItem] = useState("");
  const [photoRoom, setPhotoRoom] = useState("");

  async function load() {
    const res = await fetch(`${portalApiBase}/public/tenants/${encodeURIComponent(subdomain)}/ops`, { headers });
    const body = await res.json();
    if (res.status === 401) return onLogout();
    if (!res.ok) throw new Error(body.message || "Could not load board");
    setOrders(body.orders ?? []);
    setRooms(body.rooms ?? []);
    setMenu(body.menu ?? []);
    if (!item && (body.menu?.[0]?.name as string | undefined)) setItem(body.menu[0].name);
  }

  useEffect(() => {
    void load().catch((err) => setError(err.message));
  }, [subdomain, session.token]);

  async function setStatus(orderId: string, status: string) {
    await readJson(
      await fetch(`${portalApiBase}/public/tenants/${encodeURIComponent(subdomain)}/orders/${orderId}/status`, {
        method: "POST",
        headers,
        body: JSON.stringify({ status }),
      }),
    );
    await load();
  }

  async function createOrder(event: FormEvent) {
    event.preventDefault();
    await readJson(
      await fetch(`${portalApiBase}/public/tenants/${encodeURIComponent(subdomain)}/orders`, {
        method: "POST",
        headers,
        body: JSON.stringify({
          item,
          guestName: guestName || "Walk-in",
          guestEmail: guestEmail || undefined,
        }),
      }),
    );
    setGuestName("");
    await load();
  }

  return (
    <div data-testid="staff-board">
      <p className="lead">
        {session.staff.role.replaceAll("_", " ")} · {session.staff.name}
      </p>
      {error ? <p className="banner-error">{error}</p> : null}

      <form className="form tap-form" onSubmit={(e) => void createOrder(e)}>
        <h3>Create order for a client</h3>
        <label>
          Client name
          <input value={guestName} onChange={(e) => setGuestName(e.target.value)} required />
        </label>
        <label>
          Client email
          <input type="email" value={guestEmail} onChange={(e) => setGuestEmail(e.target.value)} />
        </label>
        <label>
          Item
          <select value={item} onChange={(e) => setItem(e.target.value)}>
            {menu.map((row) => (
              <option key={row.id} value={row.name}>
                {row.name}
              </option>
            ))}
          </select>
        </label>
        <button className="btn btn-primary" type="submit">
          Place order
        </button>
      </form>

      {hotel && (session.staff.role === "front_desk" || session.staff.role === "housekeeping") ? (
        <form
          className="form tap-form"
          onSubmit={(e) => {
            e.preventDefault();
            const room = rooms.find((row) => row.id === photoRoom);
            if (!room) return;
            void (async () => {
              await readJson(
                await fetch(`${portalApiBase}/public/tenants/${encodeURIComponent(subdomain)}/catalog/rooms`, {
                  method: "POST",
                  headers,
                  body: JSON.stringify({
                    id: room.id,
                    name: room.name,
                    beds: room.beds,
                    nightlyMinor: room.nightlyMinor ?? 10000,
                    photoUrl: room.photoUrl,
                  }),
                }),
              );
              await load();
            })();
          }}
        >
          <h3>Room photo</h3>
          <label>
            Room
            <select value={photoRoom} onChange={(e) => setPhotoRoom(e.target.value)}>
              <option value="">Choose a room</option>
              {rooms.map((room) => (
                <option key={room.id} value={room.id}>
                  {room.name}
                </option>
              ))}
            </select>
          </label>
          <label>
            Photo
            <input
              type="file"
              accept="image/*"
              onChange={(e) => {
                const file = e.target.files?.[0];
                const room = rooms.find((row) => row.id === photoRoom);
                if (!file || !room) return;
                void readImageDataUrl(file).then((photoUrl) => {
                  room.photoUrl = photoUrl;
                  setRooms([...rooms]);
                });
              }}
            />
          </label>
          <button className="btn btn-primary" type="submit" disabled={!photoRoom}>
            Save room photo
          </button>
        </form>
      ) : null}

      <h3>Tickets</h3>
      <ul className="list">
        {orders.length === 0 ? <li className="muted">No tickets.</li> : null}
        {orders.map((order) => (
          <li key={order.id}>
            <strong>
              {order.item} × {order.quantity}
            </strong>
            <span className="muted">
              {order.guestName} · {order.status}
            </span>
            <span className="deliverable-links">
              <button className="btn btn-ghost" type="button" onClick={() => void setStatus(order.id, "preparing")}>
                Preparing
              </button>
              <button className="btn btn-ghost" type="button" onClick={() => void setStatus(order.id, "ready")}>
                Ready
              </button>
              <button className="btn btn-primary" type="button" onClick={() => void setStatus(order.id, kitchen ? "delivered" : "delivered")}>
                Done
              </button>
            </span>
          </li>
        ))}
      </ul>
    </div>
  );
}
