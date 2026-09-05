import { useEffect, useState, type FormEvent } from "react";
import { GreetingsHeader } from "../components/GreetingsHeader";
import { TenantAppChrome } from "../components/TenantAppChrome";
import { portalApiBase } from "../lib/api";
import { readImageDataUrl } from "../lib/images";

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
  staffAppUrl?: string;
};

type Staff = { id: string; name: string; email: string; role: string };
type Activity = { id: string; at: string; staffName: string; role: string; action: string; detail: string };
type CatalogItem = { id?: string; name: string; kind: string; amountMinor: number; description?: string; photoUrl?: string };
type Room = { id?: string; name: string; beds: string; nightlyMinor: number; photoUrl?: string };

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

  const desk = (
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

  if (branding.dashboardStyle === "greetings") {
    return (
      <div className="tap greet-shell" style={{ ["--tap-accent" as string]: branding.primaryColor }}>
        <GreetingsHeader
          name={session.staff.name}
          brand={branding.name}
          role="admin"
          onLogout={() => {
            localStorage.removeItem(`owner.admin.${subdomain}`);
            setSession(null);
          }}
        />
        <div className="tap-body">{desk}</div>
      </div>
    );
  }

  return (
    <TenantAppChrome
      brand={branding.name}
      accent={branding.primaryColor}
      titles={{ "/admin": "Admin" }}
      tabs={[{ to: "/admin", label: "Admin", icon: "staff" }]}
    >
      {desk}
    </TenantAppChrome>
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
    <div className="tap tap-boot" style={{ ["--tap-accent" as string]: branding.primaryColor }}>
      <form className="form tap-form" onSubmit={(e) => void submit(e)}>
        <p className="tap-hero">{branding.name} admin</p>
        <p className="lead">Owners only. Staff use the separate login URL you hand them.</p>
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
  const [heroTitle, setHeroTitle] = useState(branding.heroTitle ?? "");
  const [writeup, setWriteup] = useState(branding.writeup ?? "");
  const [phone, setPhone] = useState(branding.phone ?? "");
  const [email, setEmail] = useState(branding.email ?? "");
  const [address, setAddress] = useState(branding.address ?? "");
  const [color, setColor] = useState(branding.primaryColor);
  const [style, setStyle] = useState(branding.dashboardStyle ?? "console");
  const [logoUrl, setLogoUrl] = useState(branding.logoUrl ?? "");
  const [backgroundUrl, setBackgroundUrl] = useState(branding.backgroundUrl ?? "");
  const [team, setTeam] = useState<Staff[]>([]);
  const [activity, setActivity] = useState<Activity[]>([]);
  const [notice, setNotice] = useState<string | null>(null);
  const [domain, setDomain] = useState("");
  const [handoff, setHandoff] = useState<string | null>(null);
  const staffUrl = branding.staffAppUrl ?? `${window.location.origin}/staff`;

  async function load() {
    const res = await fetch(`${portalApiBase}/public/tenants/${encodeURIComponent(subdomain)}/ops`, { headers });
    const body = await res.json();
    if (res.status === 401) return onLogout();
    if (!res.ok) throw new Error(body.message || "Could not load admin");
    setTeam(body.team ?? []);
    setActivity(body.activity ?? []);
  }

  useEffect(() => {
    void load().catch((err) => setNotice(err.message));
  }, [subdomain, session.token]);

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
        }),
      }),
    );
    setNotice("Branded app copy saved.");
  }

  return (
    <div className="admin-desk" data-testid="owner-admin">
      {branding.dashboardStyle === "greetings" ? null : (
        <p className="lead">
          {session.staff.name} · owner
          <button className="btn btn-ghost" type="button" onClick={onLogout}>
            Sign out
          </button>
        </p>
      )}
      {notice ? <p className={notice.includes("saved") || notice.includes("created") ? "banner-ok" : "banner-error"}>{notice}</p> : null}

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

      <CatalogEditor subdomain={subdomain} headers={headers} hotel={hotel} />

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
              </>
            ) : verticalId === "local_food" ? (
              <>
                <option value="kitchen">Kitchen</option>
                <option value="rider">Rider</option>
              </>
            ) : (
              <>
                <option value="kitchen">Kitchen</option>
                <option value="counter">Counter</option>
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

      <h3>Staff activity</h3>
      <ul className="list">
        {activity.length === 0 ? <li className="muted">No staff activity yet.</li> : null}
        {activity.map((row) => (
          <li key={row.id}>
            <strong>
              {row.staffName} · {row.action}
            </strong>
            <span className="muted">
              {row.detail} · {new Date(row.at).toLocaleString()}
            </span>
          </li>
        ))}
      </ul>
    </div>
  );
}

function CatalogEditor({
  subdomain,
  headers,
  hotel,
}: {
  subdomain: string;
  headers: Record<string, string>;
  hotel: boolean;
}) {
  const [name, setName] = useState("");
  const [kind, setKind] = useState(hotel ? "restaurant" : "food");
  const [amount, setAmount] = useState("25");
  const [beds, setBeds] = useState("1 king");
  const [photoUrl, setPhotoUrl] = useState("");
  const [notice, setNotice] = useState<string | null>(null);

  async function addItem(event: FormEvent) {
    event.preventDefault();
    await readJson(
      await fetch(`${portalApiBase}/public/tenants/${encodeURIComponent(subdomain)}/catalog/items`, {
        method: "POST",
        headers,
        body: JSON.stringify({
          name,
          kind,
          amountMinor: Math.round(Number(amount) * 100),
          description: name,
          photoUrl: photoUrl || undefined,
        } satisfies CatalogItem),
      }),
    );
    setNotice("Catalog item saved.");
    setName("");
  }

  async function addRoom(event: FormEvent) {
    event.preventDefault();
    await readJson(
      await fetch(`${portalApiBase}/public/tenants/${encodeURIComponent(subdomain)}/catalog/rooms`, {
        method: "POST",
        headers,
        body: JSON.stringify({
          name,
          beds,
          nightlyMinor: Math.round(Number(amount) * 100),
          photoUrl: photoUrl || undefined,
        } satisfies Room),
      }),
    );
    setNotice("Room saved.");
    setName("");
  }

  return (
    <form className="form tap-form" onSubmit={(e) => void (hotel && kind === "room" ? addRoom(e) : addItem(e))}>
      <h3>Products, food, and rooms</h3>
      {notice ? <p className="banner-ok">{notice}</p> : null}
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
    </form>
  );
}
