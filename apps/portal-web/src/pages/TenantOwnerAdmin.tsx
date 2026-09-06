import { useEffect, useState, type FormEvent } from "react";
import { AdminSiteShell, type AdminNavId } from "../components/AdminSiteShell";
import { portalApiBase } from "../lib/api";
import { readImageDataUrl } from "../lib/images";

type Quote = { name: string; quote: string; visit: string };
type Branding = {
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
  testimonials?: Quote[];
  staffAppUrl?: string;
};

type Staff = { id: string; name: string; email: string; role: string };
type Activity = { id: string; at: string; staffName: string; role: string; action: string; detail: string };
type CatalogItem = { id?: string; name: string; kind: string; amountMinor: number; description?: string; photoUrl?: string };
type Room = { id?: string; name: string; beds: string; nightlyMinor: number; photoUrl?: string; housekeep?: string };
type Booking = { id: string; roomName: string; guestName: string; checkIn: string; checkOut: string; status: string; totalMinor: number };
type Supply = {
  id: string;
  item: string;
  quantity: number;
  note: string;
  fromStaffName: string;
  toDepartment: string;
  status: string;
};
type Order = {
  id: string;
  item: string;
  quantity: number;
  guestName: string;
  status: string;
  amountMinor: number;
  kind?: string;
  fulfillment?: string;
  tableName?: string;
  seats?: number;
  address?: string;
};
function padQuotes(rows?: Quote[]): Quote[] {
  const next = (rows ?? []).slice(0, 3).map((row) => ({
    name: row.name ?? "",
    quote: row.quote ?? "",
    visit: row.visit ?? "",
  }));
  while (next.length < 3) next.push({ name: "", quote: "", visit: "" });
  return next;
}

async function readJson(res: Response) {
  const body = await res.json();
  if (!res.ok) throw new Error(body.message || "Request failed");
  return body;
}

export function TenantOwnerAdmin({
  subdomain,
  branding,
  verticalId,
  ownerHint,
  hotel,
}: {
  subdomain: string;
  branding: Branding;
  verticalId: string;
  ownerHint?: string;
  hotel: boolean;
}) {
  const [session, setSession] = useState<{ token: string; staff: Staff } | null>(null);
  useEffect(() => {
    try {
      const raw = localStorage.getItem(`owner.admin.${subdomain}`);
      if (raw) setSession(JSON.parse(raw) as { token: string; staff: Staff });
    } catch {
      setSession(null);
    }
  }, [subdomain]);

  if (!session) {
    return (
      <OwnerLogin
        branding={branding}
        ownerHint={ownerHint}
        subdomain={subdomain}
        onLogin={(next) => {
          localStorage.setItem(`owner.admin.${subdomain}`, JSON.stringify(next));
          setSession(next);
        }}
      />
    );
  }

  return (
    <OwnerDesk
      subdomain={subdomain}
      branding={branding}
      verticalId={verticalId}
      hotel={hotel}
      session={session}
      onLogout={() => {
        localStorage.removeItem(`owner.admin.${subdomain}`);
        setSession(null);
      }}
    />
  );
}

function OwnerLogin({
  branding,
  ownerHint,
  subdomain,
  onLogin,
}: {
  branding: Branding;
  ownerHint?: string;
  subdomain: string;
  onLogin: (session: { token: string; staff: Staff }) => void;
}) {
  const [email, setEmail] = useState(ownerHint ?? "");
  const [password, setPassword] = useState("");
  const [error, setError] = useState<string | null>(null);
  async function submit(event: FormEvent) {
    event.preventDefault();
    try {
      const body = await readJson(
        await fetch(`${portalApiBase}/public/tenants/${encodeURIComponent(subdomain)}/staff/login`, {
          method: "POST",
          headers: { "Content-Type": "application/json" },
          body: JSON.stringify({ email, password, surface: "admin" }),
        }),
      );
      onLogin({ token: body.token, staff: body.staff });
    } catch (err) {
      setError(err instanceof Error ? err.message : "Could not sign in");
    }
  }
  return (
    <div className="admin-site" style={{ ["--tap-accent" as string]: branding.primaryColor }} data-testid="admin-login">
      <header className="admin-site-top">
        <div className="admin-site-brand">
          {branding.logoUrl ? <img src={branding.logoUrl} alt="" /> : <span>{branding.name.slice(0, 1)}</span>}
          <div>
            <p>{branding.name}</p>
            <strong>Admin</strong>
          </div>
        </div>
      </header>
      <main className="admin-site-body">
        <form className="form tap-form admin-login-card" onSubmit={(e) => void submit(e)}>
          <p className="eyebrow">Owner sign in</p>
          <h2>{branding.name}</h2>
          <p className="lead">This page is the house website for owners. Staff use the separate login URL you hand them.</p>
          {error ? <p className="banner-error">{error}</p> : null}
          <label>
            Owner email
            <input type="email" value={email} onChange={(e) => setEmail(e.target.value)} required />
          </label>
          <label>
            Password
            <input type="password" value={password} onChange={(e) => setPassword(e.target.value)} required />
          </label>
          <button className="btn btn-primary" type="submit">
            Open admin
          </button>
        </form>
      </main>
    </div>
  );
}

function OwnerDesk({
  subdomain,
  branding,
  verticalId,
  hotel,
  session,
  onLogout,
}: {
  subdomain: string;
  branding: Branding;
  verticalId: string;
  hotel: boolean;
  session: { token: string; staff: Staff };
  onLogout: () => void;
}) {
  const headers = { "Content-Type": "application/json", "X-Hotel-Staff": session.token };
  const [panel, setPanel] = useState<AdminNavId>("today");
  const [heroTitle, setHeroTitle] = useState(branding.heroTitle ?? "");
  const [writeup, setWriteup] = useState(branding.writeup ?? "");
  const [phone, setPhone] = useState(branding.phone ?? "");
  const [email, setEmail] = useState(branding.email ?? "");
  const [address, setAddress] = useState(branding.address ?? "");
  const [color, setColor] = useState(branding.primaryColor);
  const [style, setStyle] = useState(branding.dashboardStyle ?? "console");
  const [logoUrl, setLogoUrl] = useState(branding.logoUrl ?? "");
  const [backgroundUrl, setBackgroundUrl] = useState(branding.backgroundUrl ?? "");
  const [quotes, setQuotes] = useState<Quote[]>(padQuotes(branding.testimonials));
  const [team, setTeam] = useState<Staff[]>([]);
  const [activity, setActivity] = useState<Activity[]>([]);
  const [bookings, setBookings] = useState<Booking[]>([]);
  const [orders, setOrders] = useState<Order[]>([]);
  const [rooms, setRooms] = useState<Room[]>([]);
  const [menu, setMenu] = useState<CatalogItem[]>([]);
  const [supplies, setSupplies] = useState<Supply[]>([]);
  const [analytics, setAnalytics] = useState<Record<string, number> | null>(null);
  const [notice, setNotice] = useState<string | null>(null);
  const [domain, setDomain] = useState("");
  const [handoff, setHandoff] = useState<string | null>(null);
  const staffUrl = branding.staffAppUrl ?? `${window.location.origin}/staff`;
  const inHouse = bookings.filter((row) => row.status === "checked_in").length;
  const arriving = bookings.filter((row) => row.status === "confirmed").length;
  const openTickets = orders.filter((row) => row.status !== "delivered").length;
  const dirtyRooms = rooms.filter((row) => row.housekeep === "dirty" || row.housekeep === "cleaning").length;

  async function load() {
    const res = await fetch(`${portalApiBase}/public/tenants/${encodeURIComponent(subdomain)}/ops`, { headers });
    const body = await res.json();
    if (res.status === 401) return onLogout();
    if (!res.ok) throw new Error(body.message || "Could not load admin");
    setTeam(body.team ?? []);
    setActivity(body.activity ?? []);
    setBookings(body.bookings ?? []);
    setOrders(body.orders ?? []);
    setRooms(body.rooms ?? []);
    setMenu(body.menu ?? []);
    setSupplies(body.supplies ?? []);
    setAnalytics(body.analytics ?? null);
  }

  useEffect(() => {
    void load().catch((err) => setNotice(err.message));
  }, [subdomain, session.token]);

  async function post(path: string, payload: unknown) {
    await readJson(
      await fetch(`${portalApiBase}/public/tenants/${encodeURIComponent(subdomain)}${path}`, {
        method: "POST",
        headers,
        body: JSON.stringify(payload),
      }),
    );
    await load();
  }

  async function saveSite(event: FormEvent) {
    event.preventDefault();
    await readJson(
      await fetch(`${portalApiBase}/public/tenants/${encodeURIComponent(subdomain)}/site`, {
        method: "PATCH",
        headers,
        body: JSON.stringify({
          heroTitle,
          writeup,
          phone,
          email,
          address,
          primaryColor: color,
          dashboardStyle: style,
          logoUrl: logoUrl || undefined,
          backgroundUrl: backgroundUrl || undefined,
          testimonials: quotes.filter((row) => row.name.trim() && row.quote.trim()).slice(0, 3),
        }),
      }),
    );
    setNotice("Branded app copy saved.");
    setPanel("today");
  }

  return (
    <AdminSiteShell
      brand={branding.name}
      logoUrl={branding.logoUrl}
      accent={branding.primaryColor}
      staff={session.staff}
      nav={[
        { id: "today", label: "Today" },
        { id: "brand", label: "Brand" },
        { id: "catalog", label: hotel ? "Rooms & menu" : "Menu" },
        { id: "staff", label: "Staff" },
        { id: "domain", label: "Domain" },
        { id: "activity", label: "Activity" },
        { id: "analytics", label: "Analytics" },
      ]}
      active={panel}
      onNav={setPanel}
      onLogout={onLogout}
    >
    <div className="admin-desk" data-testid="owner-admin">
      {notice ? <p className={notice.includes("saved") || notice.includes("created") || notice.includes("Domain") ? "banner-ok" : "banner-error"}>{notice}</p> : null}

      {panel === "today" ? (
      <section className="today-hub" data-testid="admin-today">
        <p className="eyebrow">Today</p>
        <h3>Daily source of truth</h3>
        <div className="today-stats">
          {hotel ? <span>{arriving} arriving</span> : null}
          {hotel ? <span>{inHouse} in house</span> : null}
          <span>{openTickets} open tickets</span>
          {hotel ? <span>{dirtyRooms} rooms to turn</span> : null}
          <span>{supplies.filter((row) => row.status === "requested").length} store requests</span>
        </div>
        {hotel ? (
          <>
            <h4>Bookings</h4>
            <ul className="list">
              {bookings.length === 0 ? <li className="muted">No bookings yet.</li> : null}
              {bookings.slice(0, 6).map((booking) => (
                <li key={booking.id}>
                  <strong>
                    {booking.guestName} · {booking.roomName}
                  </strong>
                  <span className="muted">
                    {booking.status} · {booking.checkIn} → {booking.checkOut}
                  </span>
                  <span className="deliverable-links">
                    <button className="btn btn-ghost" type="button" onClick={() => void post(`/bookings/${booking.id}/status`, { status: "checked_in" })}>
                      Check in
                    </button>
                    <button className="btn btn-ghost" type="button" onClick={() => void post(`/bookings/${booking.id}/status`, { status: "checked_out" })}>
                      Check out
                    </button>
                  </span>
                </li>
              ))}
            </ul>
          </>
        ) : null}
        <h4>Orders</h4>
        <ul className="list">
          {orders.length === 0 ? <li className="muted">No guest or staff orders yet.</li> : null}
          {orders.slice(0, 8).map((order) => (
            <li key={order.id}>
              <strong>
                {order.item} × {order.quantity}
              </strong>
              <span className="muted">
                {order.guestName} · {order.status}
                {order.fulfillment === "takeaway" || order.address
                  ? ` · Takeaway${order.address ? ` · ${order.address}` : ""}`
                  : order.tableName
                    ? ` · Walk-in · ${order.tableName}${order.seats ? ` · ${order.seats} chairs` : ""}`
                    : ""}
              </span>
              <span className="deliverable-links">
                <button className="btn btn-ghost" type="button" onClick={() => void post(`/orders/${order.id}/status`, { status: "preparing" })}>
                  Prep
                </button>
                <button className="btn btn-ghost" type="button" onClick={() => void post(`/orders/${order.id}/status`, { status: "ready" })}>
                  Ready
                </button>
                <button className="btn btn-primary" type="button" onClick={() => void post(`/orders/${order.id}/status`, { status: "delivered" })}>
                  Done
                </button>
              </span>
            </li>
          ))}
        </ul>
        <h4>Store requests</h4>
        <ul className="list">
          {supplies.length === 0 ? <li className="muted">No foodstuff requests from the restaurant.</li> : null}
          {supplies.map((row) => (
            <li key={row.id}>
              <strong>
                {row.item} × {row.quantity}
              </strong>
              <span className="muted">
                {row.fromStaffName} → {row.toDepartment} · {row.status}
                {row.note ? ` · ${row.note}` : ""}
              </span>
              {row.status === "requested" || row.status === "approved" ? (
                <span className="deliverable-links">
                  <button className="btn btn-ghost" type="button" onClick={() => void post(`/supplies/${row.id}/status`, { status: "approved" })}>
                    Approve
                  </button>
                  <button className="btn btn-primary" type="button" onClick={() => void post(`/supplies/${row.id}/status`, { status: "fulfilled" })}>
                    Fulfilled
                  </button>
                </span>
              ) : null}
            </li>
          ))}
        </ul>
      </section>
      ) : null}

      {panel === "brand" ? (
      <form className="form tap-form" onSubmit={(e) => void saveSite(e)}>
        <h3>Branded app write-up</h3>
        <label>
          Hero line
          <input value={heroTitle} onChange={(e) => setHeroTitle(e.target.value)} placeholder="Sit, scan the board, eat." />
        </label>
        <label>
          About this place
          <textarea value={writeup} onChange={(e) => setWriteup(e.target.value)} rows={4} />
        </label>
        <p className="eyebrow">Patrons on the home page</p>
        {quotes.map((row, index) => (
          <fieldset className="quote-fields" key={index}>
            <legend>Testimonial {index + 1}</legend>
            <label>
              Name
              <input
                value={row.name}
                onChange={(e) =>
                  setQuotes((current) => current.map((item, i) => (i === index ? { ...item, name: e.target.value } : item)))
                }
                placeholder="Ada K."
              />
            </label>
            <label>
              Quote
              <textarea
                value={row.quote}
                rows={3}
                onChange={(e) =>
                  setQuotes((current) => current.map((item, i) => (i === index ? { ...item, quote: e.target.value } : item)))
                }
                placeholder="I keep coming back because the kitchen tastes like a real home pot."
              />
            </label>
            <label>
              Visit
              <input
                value={row.visit}
                onChange={(e) =>
                  setQuotes((current) => current.map((item, i) => (i === index ? { ...item, visit: e.target.value } : item)))
                }
                placeholder="Dinner for two"
              />
            </label>
          </fieldset>
        ))}
        <label>
          Phone
          <input value={phone} onChange={(e) => setPhone(e.target.value)} />
        </label>
        <label>
          Public email
          <input type="email" value={email} onChange={(e) => setEmail(e.target.value)} />
        </label>
        <label>
          Address
          <input value={address} onChange={(e) => setAddress(e.target.value)} />
        </label>
        <label>
          Brand color
          <input type="color" value={color} onChange={(e) => setColor(e.target.value)} />
        </label>
        <label>
          Dashboard style
          <select value={style} onChange={(e) => setStyle(e.target.value as "console" | "greetings")}>
            <option value="console">Console</option>
            <option value="greetings">Greetings header</option>
          </select>
        </label>
        <label>
          Logo
          <input
            type="file"
            accept="image/*"
            onChange={(e) => {
              const file = e.target.files?.[0];
              if (file) void readImageDataUrl(file, 512).then(setLogoUrl);
            }}
          />
        </label>
        <label>
          Place background photo
          <input
            type="file"
            accept="image/*"
            onChange={(e) => {
              const file = e.target.files?.[0];
              if (file) void readImageDataUrl(file).then(setBackgroundUrl);
            }}
          />
        </label>
        <button className="btn btn-primary" type="submit">
          Save branded app
        </button>
      </form>
      ) : null}

      {panel === "catalog" ? (
        <CatalogEditor
          subdomain={subdomain}
          headers={headers}
          hotel={hotel}
          rooms={rooms}
          menu={menu}
          onSaved={() => void load()}
        />
      ) : null}

      {panel === "analytics" && analytics ? (
        <section className="today-hub" data-testid="admin-analytics">
          <p className="eyebrow">House analytics</p>
          <h3>What the house is doing</h3>
          <div className="today-stats">
            {hotel ? <span>{analytics.occupancyPct}% occupancy</span> : null}
            {hotel ? <span>{analytics.roomsReady} ready rooms</span> : null}
            {hotel ? <span>{analytics.inHouse} in house</span> : null}
            {hotel ? <span>${((analytics.roomRevenueMinor ?? 0) / 100).toFixed(0)} room revenue</span> : null}
            <span>${((analytics.foodRevenueMinor ?? 0) / 100).toFixed(0)} food</span>
            <span>${((analytics.drinkRevenueMinor ?? 0) / 100).toFixed(0)} drinks</span>
            <span>{analytics.openTickets} open tickets</span>
            <span>{analytics.walkInOrders} walk-in</span>
            <span>{analytics.takeawayOrders} takeaway</span>
            <span>{analytics.supplyOpen} store requests</span>
          </div>
          <p className="muted">Occupancy, covers, and tickets update from live front desk and restaurant work.</p>
        </section>
      ) : null}

      {panel === "staff" ? (
      <>
      <form
        className="form tap-form"
        onSubmit={(e) => {
          e.preventDefault();
          const form = e.currentTarget;
          const name = (form.elements.namedItem("name") as HTMLInputElement).value;
          const staffEmail = (form.elements.namedItem("email") as HTMLInputElement).value;
          const password = (form.elements.namedItem("password") as HTMLInputElement).value;
          const role = (form.elements.namedItem("role") as HTMLSelectElement).value;
          void fetch(`${portalApiBase}/public/tenants/${encodeURIComponent(subdomain)}/staff`, {
            method: "POST",
            headers,
            body: JSON.stringify({ name, email: staffEmail, password, role }),
          })
            .then(readJson)
            .then((body) => {
              setHandoff(`${body.loginUrl ?? staffUrl}\n${staffEmail}\n${password}`);
              setNotice("Staff created. Hand them the login below.");
              void load();
            })
            .catch((err) => setNotice(err.message));
        }}
      >
        <h3>Create staff</h3>
        <p className="hint">They sign in at {staffUrl}. Do not send them /admin.</p>
        <label>
          Name
          <input name="name" required />
        </label>
        <label>
          Email
          <input name="email" type="email" required />
        </label>
        <label>
          Password
          <input name="password" type="password" minLength={6} required />
        </label>
        <label>
          Role
          <select name="role">
            {hotel ? (
              <>
                <option value="front_desk">Front desk</option>
                <option value="restaurant">Restaurant</option>
                <option value="bar">Bar</option>
                <option value="housekeeping">Housekeeping</option>
                <option value="rider">Rider</option>
                <option value="kitchen">Kitchen</option>
                <option value="storekeeper">Storekeeper</option>
              </>
            ) : verticalId === "local_food" ? (
              <>
                <option value="kitchen">Kitchen</option>
                <option value="rider">Rider</option>
                <option value="storekeeper">Storekeeper</option>
              </>
            ) : (
              <>
                <option value="kitchen">Kitchen</option>
                <option value="counter">Counter</option>
                <option value="rider">Rider</option>
                <option value="storekeeper">Storekeeper</option>
              </>
            )}
          </select>
        </label>
        <button className="btn btn-primary" type="submit">
          Create and hand off
        </button>
      </form>
      {handoff ? <pre className="handoff">{handoff}</pre> : null}

      <h3>Staff</h3>
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
      </>
      ) : null}

      {panel === "domain" ? (
      <form
        className="form tap-form"
        onSubmit={(e) => {
          e.preventDefault();
          void fetch(`${portalApiBase}/public/tenants/${encodeURIComponent(subdomain)}/domain`, {
            method: "POST",
            headers,
            body: JSON.stringify({ hostname: domain, purchase: false }),
          })
            .then(readJson)
            .then(() => setNotice("Domain attached. Point a CNAME at getlifeos.app."))
            .catch((err) => setNotice(err.message));
        }}
      >
        <h3>Personal domain</h3>
        <label>
          Domain
          <input value={domain} onChange={(e) => setDomain(e.target.value.toLowerCase())} placeholder="eat.harbor.ng" />
        </label>
        <div className="actions">
          <button className="btn btn-primary" type="submit">
            Add domain
          </button>
          <button
            className="btn btn-ghost"
            type="button"
            onClick={() =>
              void fetch(`${portalApiBase}/public/tenants/${encodeURIComponent(subdomain)}/domain`, {
                method: "POST",
                headers,
                body: JSON.stringify({ hostname: domain, purchase: true }),
              })
                .then(readJson)
                .then(() => setNotice("Domain purchase started."))
                .catch((err) => setNotice(err.message))
            }
          >
            Buy domain
          </button>
        </div>
      </form>
      ) : null}

      {panel === "activity" ? (
      <>
      <h3>Guest and staff activity</h3>
      <ul className="list">
        {activity.length === 0 ? <li className="muted">No staff activity yet.</li> : null}
        {activity.map((row) => (
          <li key={row.id}>
            <strong>
              {row.staffName} · {row.role} · {row.action}
            </strong>
            <span className="muted">
              {row.detail} · {new Date(row.at).toLocaleString()}
            </span>
          </li>
        ))}
      </ul>
      </>
      ) : null}
    </div>
    </AdminSiteShell>
  );
}

function CatalogEditor({
  subdomain,
  headers,
  hotel,
  rooms,
  menu,
  onSaved,
}: {
  subdomain: string;
  headers: Record<string, string>;
  hotel: boolean;
  rooms: Room[];
  menu: CatalogItem[];
  onSaved: () => void;
}) {
  const [name, setName] = useState("");
  const [kind, setKind] = useState(hotel ? "room" : "food");
  const [amount, setAmount] = useState("25");
  const [beds, setBeds] = useState("1 king");
  const [photoUrl, setPhotoUrl] = useState("");
  const [notice, setNotice] = useState<string | null>(null);
  const [error, setError] = useState<string | null>(null);

  function priceMinor() {
    const value = Number(String(amount).replace(/[^0-9.]/g, ""));
    return Math.max(1, Math.round(value * 100));
  }

  async function addItem(event: FormEvent) {
    event.preventDefault();
    setError(null);
    try {
      await readJson(
        await fetch(`${portalApiBase}/public/tenants/${encodeURIComponent(subdomain)}/catalog/items`, {
          method: "POST",
          headers,
          body: JSON.stringify({
            name,
            kind,
            amountMinor: priceMinor(),
            description: name,
            photoUrl: photoUrl || undefined,
          }),
        }),
      );
      setNotice(`${name} is on the menu.`);
      setName("");
      setPhotoUrl("");
      onSaved();
    } catch (err) {
      setError(err instanceof Error ? err.message : "Could not add to catalog");
    }
  }

  async function addRoom(event: FormEvent) {
    event.preventDefault();
    setError(null);
    try {
      await readJson(
        await fetch(`${portalApiBase}/public/tenants/${encodeURIComponent(subdomain)}/catalog/rooms`, {
          method: "POST",
          headers,
          body: JSON.stringify({
            name,
            beds,
            nightlyMinor: priceMinor(),
            photoUrl: photoUrl || undefined,
          }),
        }),
      );
      setNotice(`${name} is on the room board.`);
      setName("");
      setPhotoUrl("");
      onSaved();
    } catch (err) {
      setError(err instanceof Error ? err.message : "Could not add room");
    }
  }

  return (
    <form className="form tap-form" onSubmit={(e) => void (hotel && kind === "room" ? addRoom(e) : addItem(e))}>
      <h3>Products, food, and rooms</h3>
      {notice ? <p className="banner-ok">{notice}</p> : null}
      {error ? <p className="banner-error">{error}</p> : null}
      <label>
        Name
        <input value={name} onChange={(e) => setName(e.target.value)} required />
      </label>
      <label>
        Type
        <select value={kind} onChange={(e) => setKind(e.target.value)}>
          {hotel ? (
            <>
              <option value="room">Room</option>
              <option value="restaurant">Food</option>
              <option value="bar">Drink</option>
              <option value="room_service">Room service</option>
            </>
          ) : (
            <>
              <option value="food">Food</option>
              <option value="drink">Drink</option>
            </>
          )}
        </select>
      </label>
      {hotel && kind === "room" ? (
        <label>
          Beds
          <input value={beds} onChange={(e) => setBeds(e.target.value)} />
        </label>
      ) : null}
      <label>
        Price
        <input value={amount} onChange={(e) => setAmount(e.target.value)} />
      </label>
      <label>
        Photo
        <input
          type="file"
          accept="image/*"
          onChange={(e) => {
            const file = e.target.files?.[0];
            if (file) void readImageDataUrl(file).then(setPhotoUrl);
          }}
        />
      </label>
      <button className="btn btn-primary" type="submit">
        Add to catalog
      </button>
      <h4>On the board</h4>
      <ul className="list" data-testid="catalog-board">
        {hotel
          ? rooms.map((room) => (
              <li key={room.id ?? room.name}>
                <strong>{room.name}</strong>
                <span className="muted">
                  Room · {room.beds} · ${((room.nightlyMinor ?? 0) / 100).toFixed(0)}
                </span>
              </li>
            ))
          : null}
        {menu.map((item) => (
          <li key={item.id ?? item.name}>
            <strong>{item.name}</strong>
            <span className="muted">
              {item.kind.replaceAll("_", " ")} · ${((item.amountMinor ?? 0) / 100).toFixed(0)}
            </span>
          </li>
        ))}
        {!hotel && menu.length === 0 ? <li className="muted">Nothing in the catalog yet.</li> : null}
      </ul>
    </form>
  );
}
