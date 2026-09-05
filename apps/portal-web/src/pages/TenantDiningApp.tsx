import { useEffect, useState, type FormEvent } from "react";
import { BrowserRouter, Navigate, Route, Routes } from "react-router-dom";
import { TenantAppChrome } from "../components/TenantAppChrome";
import { portalApiBase } from "../lib/api";

type MenuItem = { id: string; name: string; kind: "food" | "drink"; amountMinor: number; description: string };
type Order = {
  id: string;
  item: string;
  kind: string;
  quantity: number;
  amountMinor: number;
  guestName: string;
  tableName?: string;
  address?: string;
  status: string;
};
type Staff = { id: string; name: string; email: string; role: "owner" | "kitchen" | "counter" | "rider" };
type DiningPublic = {
  tenant: {
    displayName: string;
    subdomain: string;
    hostname: string;
    verticalId?: string;
    branding: { name: string; primaryColor: string };
    ownerHint?: string;
    mode: "restaurant" | "kitchen";
  };
  menu: MenuItem[];
  tables: Array<{ id: string; name: string; seats: number }>;
};

function normalizeDining(body: DiningPublic): DiningPublic {
  const kitchen = body.tenant?.mode === "kitchen" || body.tenant?.verticalId === "local_food";
  return {
    tenant: {
      displayName: body.tenant?.displayName ?? "Kitchen",
      subdomain: body.tenant?.subdomain ?? "",
      hostname: body.tenant?.hostname ?? "",
      verticalId: body.tenant?.verticalId,
      branding: {
        name: body.tenant?.branding?.name ?? body.tenant?.displayName ?? "Kitchen",
        primaryColor: body.tenant?.branding?.primaryColor ?? (kitchen ? "#e85d04" : "#7c3aed"),
      },
      ownerHint: body.tenant?.ownerHint,
      mode: kitchen ? "kitchen" : "restaurant",
    },
    menu: Array.isArray(body.menu) ? body.menu : [],
    tables: Array.isArray(body.tables) ? body.tables : [],
  };
}

function money(minor: number) {
  return `$${(minor / 100).toFixed(0)}`;
}

async function readJson(res: Response) {
  const body = await res.json();
  if (!res.ok) throw new Error(body.message || "Request failed");
  return body;
}

function guestKey(subdomain: string) {
  return `dining.guest.${subdomain}`;
}

export function TenantDiningApp({ subdomain, basename }: { subdomain: string; basename: string }) {
  const [data, setData] = useState<DiningPublic | null>(null);
  const [error, setError] = useState<string | null>(null);

  async function refresh() {
    const res = await fetch(`${portalApiBase}/public/tenants/${encodeURIComponent(subdomain)}`);
    if (!res.ok) throw new Error("This kitchen is not ready.");
    setData(normalizeDining((await res.json()) as DiningPublic));
  }

  useEffect(() => {
    void refresh().catch((err) => setError(err instanceof Error ? err.message : "Could not load."));
  }, [subdomain]);

  useEffect(() => {
    if (typeof navigator !== "undefined" && "serviceWorker" in navigator) {
      void navigator.serviceWorker.register("/sw.js").catch(() => undefined);
    }
  }, []);

  if (error) return <div className="tap tap-boot"><p className="banner-error">{error}</p></div>;
  if (!data) return <div className="tap tap-boot"><p className="muted">Opening {subdomain}…</p></div>;

  const kitchen = data.tenant.mode === "kitchen";
  const titles = {
    "/": kitchen ? "Home kitchen" : "Dining room",
    "/menu": "Menu",
    "/drinks": "Drinks",
    "/orders": "My orders",
    "/admin": "Staff",
  };

  return (
    <div data-testid="dining-tenant-app">
      <BrowserRouter basename={basename}>
        <TenantAppChrome
          brand={data.tenant.branding.name}
          accent={data.tenant.branding.primaryColor}
          titles={titles}
          tabs={[
            { to: "/", label: "Home", icon: "home" },
            { to: "/menu", label: "Menu", icon: "food" },
            { to: "/drinks", label: "Drinks", icon: "drink" },
            { to: "/orders", label: "Orders", icon: "stay" },
            { to: "/admin", label: "Staff", icon: "staff" },
          ]}
        >
          <Routes>
            <Route path="/" element={<DiningHome data={data} subdomain={subdomain} onDone={() => void refresh()} />} />
            <Route path="/menu" element={<DiningMenu data={data} subdomain={subdomain} kind="food" />} />
            <Route path="/drinks" element={<DiningMenu data={data} subdomain={subdomain} kind="drink" />} />
            <Route path="/orders" element={<DiningOrders data={data} subdomain={subdomain} />} />
            <Route path="/admin" element={<DiningStaff data={data} subdomain={subdomain} />} />
            <Route path="*" element={<Navigate to="/" replace />} />
          </Routes>
        </TenantAppChrome>
      </BrowserRouter>
    </div>
  );
}

function useGuest(subdomain: string) {
  const [guestName, setGuestName] = useState("");
  const [guestEmail, setGuestEmail] = useState("");
  const [tableName, setTableName] = useState("");
  const [address, setAddress] = useState("");
  useEffect(() => {
    try {
      const raw = localStorage.getItem(guestKey(subdomain));
      if (!raw) return;
      const parsed = JSON.parse(raw) as { name?: string; email?: string; tableName?: string; address?: string };
      setGuestName(parsed.name ?? "");
      setGuestEmail(parsed.email ?? "");
      setTableName(parsed.tableName ?? "");
      setAddress(parsed.address ?? "");
    } catch {
      /* ignore */
    }
  }, [subdomain]);
  function remember() {
    localStorage.setItem(guestKey(subdomain), JSON.stringify({ name: guestName, email: guestEmail, tableName, address }));
  }
  return { guestName, guestEmail, tableName, address, setGuestName, setGuestEmail, setTableName, setAddress, remember };
}

function GuestFields({
  guest,
  kitchen,
  tables,
}: {
  guest: ReturnType<typeof useGuest>;
  kitchen: boolean;
  tables: DiningPublic["tables"];
}) {
  return (
    <form className="form tap-form" onSubmit={(e) => e.preventDefault()}>
      <label>
        Your name
        <input value={guest.guestName} onChange={(e) => guest.setGuestName(e.target.value)} />
      </label>
      <label>
        Email
        <input type="email" value={guest.guestEmail} onChange={(e) => guest.setGuestEmail(e.target.value)} />
      </label>
      {kitchen ? (
        <label>
          Delivery address
          <input value={guest.address} onChange={(e) => guest.setAddress(e.target.value)} placeholder="Street, estate, landmark" />
        </label>
      ) : (
        <label>
          Table
          <select value={guest.tableName} onChange={(e) => guest.setTableName(e.target.value)}>
            <option value="">Walk-in / takeaway</option>
            {tables.map((table) => (
              <option key={table.id} value={table.name}>
                {table.name} · {table.seats} seats
              </option>
            ))}
          </select>
        </label>
      )}
    </form>
  );
}

function DiningHome({
  data,
  subdomain,
  onDone,
}: {
  data: DiningPublic;
  subdomain: string;
  onDone: () => void;
}) {
  const guest = useGuest(subdomain);
  const featured = data.menu.slice(0, 4);
  return (
    <div className="tap-home">
      <p className="tap-hero">{data.tenant.mode === "kitchen" ? "Home kitchen, plated for the street." : "Sit, scan the board, eat."}</p>
      <GuestFields guest={guest} kitchen={data.tenant.mode === "kitchen"} tables={data.tables} />
      <section className="cards">
        {featured.map((item) => (
          <MenuCard key={item.id} item={item} subdomain={subdomain} guest={guest} onDone={onDone} />
        ))}
      </section>
    </div>
  );
}

function DiningMenu({
  data,
  subdomain,
  kind,
}: {
  data: DiningPublic;
  subdomain: string;
  kind: "food" | "drink";
}) {
  const guest = useGuest(subdomain);
  const items = data.menu.filter((item) => item.kind === kind);
  return (
    <div>
      <GuestFields guest={guest} kitchen={data.tenant.mode === "kitchen"} tables={data.tables} />
      <section className="cards" data-testid="dining-menu">
        {items.map((item) => (
          <MenuCard key={item.id} item={item} subdomain={subdomain} guest={guest} />
        ))}
      </section>
    </div>
  );
}

function MenuCard({
  item,
  subdomain,
  guest,
  onDone,
}: {
  item: MenuItem;
  subdomain: string;
  guest: ReturnType<typeof useGuest>;
  onDone?: () => void;
}) {
  const [busy, setBusy] = useState(false);
  const [notice, setNotice] = useState<string | null>(null);
  async function order() {
    setBusy(true);
    setNotice(null);
    guest.remember();
    try {
      await readJson(
        await fetch(`${portalApiBase}/public/tenants/${encodeURIComponent(subdomain)}/orders`, {
          method: "POST",
          headers: { "Content-Type": "application/json" },
          body: JSON.stringify({
            item: item.name,
            kind: item.kind,
            guestName: guest.guestName || "Guest",
            guestEmail: guest.guestEmail || undefined,
            tableName: guest.tableName || undefined,
            address: guest.address || undefined,
          }),
        }),
      );
      setNotice(`${item.name} is in the kitchen.`);
      onDone?.();
    } catch (err) {
      setNotice(err instanceof Error ? err.message : "Could not order");
    } finally {
      setBusy(false);
    }
  }
  return (
    <article className="card tap-card">
      <p className="eyebrow">{item.kind}</p>
      <h2>{item.name}</h2>
      <p className="muted">
        {item.description} · {money(item.amountMinor)}
      </p>
      {notice ? <p className={notice.includes("kitchen") ? "banner-ok" : "banner-error"}>{notice}</p> : null}
      <button className="btn btn-primary" disabled={busy} onClick={() => void order()}>
        Order
      </button>
    </article>
  );
}

function DiningOrders({ data, subdomain }: { data: DiningPublic; subdomain: string }) {
  const guest = useGuest(subdomain);
  const [orders, setOrders] = useState<Order[]>([]);
  const [notice, setNotice] = useState<string | null>(null);

  async function load() {
    if (!guest.guestEmail) return;
    const res = await fetch(
      `${portalApiBase}/public/tenants/${encodeURIComponent(subdomain)}/stay?email=${encodeURIComponent(guest.guestEmail)}`,
    );
    const body = await res.json();
    if (!res.ok) throw new Error(body.message || "Could not load orders");
    setOrders(body.orders ?? []);
  }

  useEffect(() => {
    if (guest.guestEmail) void load().catch((err) => setNotice(err.message));
  }, [guest.guestEmail, subdomain]);

  return (
    <div>
      <p className="lead">Track tickets for {data.tenant.branding.name}.</p>
      <GuestFields guest={guest} kitchen={data.tenant.mode === "kitchen"} tables={data.tables} />
      <button
        className="btn btn-ghost"
        type="button"
        onClick={() => {
          guest.remember();
          void load().catch((err) => setNotice(err.message));
        }}
      >
        Find my orders
      </button>
      {notice ? <p className="banner-error">{notice}</p> : null}
      <ul className="list">
        {orders.length === 0 ? <li className="muted">No tickets yet.</li> : null}
        {orders.map((order) => (
          <li key={order.id}>
            <strong>
              {order.item} × {order.quantity}
            </strong>
            <span className="muted">
              {order.status} · {money(order.amountMinor)}
            </span>
          </li>
        ))}
      </ul>
    </div>
  );
}

function DiningStaff({ data, subdomain }: { data: DiningPublic; subdomain: string }) {
  const [session, setSession] = useState<{ token: string; staff: Staff } | null>(null);
  useEffect(() => {
    try {
      const raw = localStorage.getItem(`dining.staff.${subdomain}`);
      if (raw) setSession(JSON.parse(raw) as { token: string; staff: Staff });
    } catch {
      setSession(null);
    }
  }, [subdomain]);

  if (!session) {
    return (
      <DiningLogin
        data={data}
        subdomain={subdomain}
        onLogin={(next) => {
          localStorage.setItem(`dining.staff.${subdomain}`, JSON.stringify(next));
          setSession(next);
        }}
      />
    );
  }
  return (
    <DiningDesk
      data={data}
      subdomain={subdomain}
      session={session}
      onLogout={() => {
        localStorage.removeItem(`dining.staff.${subdomain}`);
        setSession(null);
      }}
    />
  );
}

function DiningLogin({
  data,
  subdomain,
  onLogin,
}: {
  data: DiningPublic;
  subdomain: string;
  onLogin: (session: { token: string; staff: Staff }) => void;
}) {
  const [email, setEmail] = useState(data.tenant.ownerHint ?? "");
  const [password, setPassword] = useState("");
  const [error, setError] = useState<string | null>(null);
  async function submit(event: FormEvent) {
    event.preventDefault();
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
    }
  }
  return (
    <form className="form tap-form" onSubmit={(e) => void submit(e)}>
      <p className="lead">Kitchen, counter, and rider boards stay separate.</p>
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
        Open my dashboard
      </button>
      <p className="hint">
        First owner login uses {data.tenant.ownerHint} and password <code>venue-owner</code>.
      </p>
    </form>
  );
}

function DiningDesk({
  data,
  subdomain,
  session,
  onLogout,
}: {
  data: DiningPublic;
  subdomain: string;
  session: { token: string; staff: Staff };
  onLogout: () => void;
}) {
  const [orders, setOrders] = useState<Order[]>([]);
  const [team, setTeam] = useState<Staff[]>([]);
  const [error, setError] = useState<string | null>(null);
  const headers = { "Content-Type": "application/json", "X-Hotel-Staff": session.token };

  async function load() {
    const res = await fetch(`${portalApiBase}/public/tenants/${encodeURIComponent(subdomain)}/ops`, { headers });
    const body = await res.json();
    if (res.status === 401) return onLogout();
    if (!res.ok) throw new Error(body.message || "Could not load");
    setOrders(body.orders ?? []);
    setTeam(body.team ?? []);
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

  return (
    <div>
      <p className="lead">
        {session.staff.role.replaceAll("_", " ")} · {session.staff.name}
      </p>
      <button className="btn btn-ghost" type="button" onClick={onLogout}>
        Sign out
      </button>
      {error ? <p className="banner-error">{error}</p> : null}
      {session.staff.role === "owner" ? (
        <OwnerCreate kitchen={data.tenant.mode === "kitchen"} subdomain={subdomain} headers={headers} onCreated={() => void load()} />
      ) : null}
      {team.length ? (
        <ul className="list">
          {team.map((member) => (
            <li key={member.id}>
              <strong>{member.name}</strong>
              <span className="muted">
                {member.email} · {member.role}
              </span>
            </li>
          ))}
        </ul>
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
              {order.guestName} · {order.status} · {money(order.amountMinor)}
            </span>
            <span className="deliverable-links">
              <button className="btn btn-ghost" type="button" onClick={() => void setStatus(order.id, "preparing")}>
                Preparing
              </button>
              <button className="btn btn-ghost" type="button" onClick={() => void setStatus(order.id, "ready")}>
                Ready
              </button>
              <button className="btn btn-primary" type="button" onClick={() => void setStatus(order.id, "delivered")}>
                Delivered
              </button>
            </span>
          </li>
        ))}
      </ul>
    </div>
  );
}

function OwnerCreate({
  kitchen,
  subdomain,
  headers,
  onCreated,
}: {
  kitchen: boolean;
  subdomain: string;
  headers: Record<string, string>;
  onCreated: () => void;
}) {
  const [name, setName] = useState("");
  const [email, setEmail] = useState("");
  const [password, setPassword] = useState("");
  const [role, setRole] = useState(kitchen ? "kitchen" : "counter");
  const [notice, setNotice] = useState<string | null>(null);
  async function submit(event: FormEvent) {
    event.preventDefault();
    try {
      await readJson(
        await fetch(`${portalApiBase}/public/tenants/${encodeURIComponent(subdomain)}/staff`, {
          method: "POST",
          headers,
          body: JSON.stringify({ name, email, password, role }),
        }),
      );
      setNotice("Staff created.");
      onCreated();
    } catch (err) {
      setNotice(err instanceof Error ? err.message : "Could not create staff");
    }
  }
  return (
    <form className="form tap-form" onSubmit={(e) => void submit(e)}>
      <h3>Create staff</h3>
      {notice ? <p className={notice.includes("created") ? "banner-ok" : "banner-error"}>{notice}</p> : null}
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
        <select value={role} onChange={(e) => setRole(e.target.value)}>
          <option value="kitchen">Kitchen</option>
          {kitchen ? <option value="rider">Rider</option> : <option value="counter">Counter</option>}
        </select>
      </label>
      <button className="btn btn-primary" type="submit">
        Create staff
      </button>
    </form>
  );
}
