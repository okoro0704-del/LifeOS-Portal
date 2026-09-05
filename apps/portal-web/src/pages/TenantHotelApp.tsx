import { useEffect, useMemo, useState } from "react";
import { BrowserRouter, NavLink, Route, Routes } from "react-router-dom";
import { portalApiBase } from "../lib/api";

type HotelPayload = {
  tenant: {
    displayName: string;
    subdomain: string;
    hostname: string;
    features: string[];
    branding: { name: string; primaryColor: string };
  };
  rooms: Array<{ id: string; name: string; beds: string; nightlyMinor: number; available: boolean }>;
  bookings: Array<{
    id: string;
    roomName: string;
    guestName: string;
    checkIn: string;
    checkOut: string;
    nights: number;
    totalMinor: number;
    status: string;
  }>;
  orders: Array<{
    id: string;
    item: string;
    quantity: number;
    amountMinor: number;
    guestName: string;
    roomName?: string;
    status: string;
  }>;
};

function money(minor: number) {
  return `$${(minor / 100).toFixed(0)}`;
}

async function loadHotel(subdomain: string) {
  const res = await fetch(`${portalApiBase}/public/tenants/${encodeURIComponent(subdomain)}`);
  if (!res.ok) throw new Error("This hotel is not ready.");
  return (await res.json()) as HotelPayload;
}

export function TenantHotelApp({ subdomain, basename }: { subdomain: string; basename: string }) {
  const [data, setData] = useState<HotelPayload | null>(null);
  const [error, setError] = useState<string | null>(null);

  async function refresh() {
    try {
      setData(await loadHotel(subdomain));
      setError(null);
    } catch (err) {
      setError(err instanceof Error ? err.message : "Could not load hotel.");
    }
  }

  useEffect(() => {
    void refresh();
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
      <div className="page hotel-app" style={style}>
        <p className="banner-error">{error}</p>
      </div>
    );
  }
  if (!data) {
    return (
      <div className="page hotel-app" style={style}>
        <p className="muted">Opening {subdomain}…</p>
      </div>
    );
  }

  return (
    <div className="hotel-app" style={style} data-testid="hotel-tenant-app">
      <BrowserRouter basename={basename}>
        <header className="hotel-bar">
          <div>
            <p className="eyebrow">{data.tenant.hostname}</p>
            <h1>{data.tenant.branding.name}</h1>
          </div>
          <nav className="hotel-nav">
            <NavLink to="/" end>
              Guest
            </NavLink>
            <NavLink to="/admin">Front desk</NavLink>
          </nav>
        </header>
        <Routes>
          <Route path="/" element={<HotelGuest data={data} subdomain={subdomain} onDone={() => void refresh()} />} />
          <Route path="/admin" element={<HotelAdmin data={data} subdomain={subdomain} onDone={() => void refresh()} />} />
        </Routes>
      </BrowserRouter>
    </div>
  );
}

function HotelGuest({
  data,
  subdomain,
  onDone,
}: {
  data: HotelPayload;
  subdomain: string;
  onDone: () => void;
}) {
  const [guestName, setGuestName] = useState("");
  const [guestEmail, setGuestEmail] = useState("");
  const [checkIn, setCheckIn] = useState("");
  const [checkOut, setCheckOut] = useState("");
  const [busy, setBusy] = useState(false);
  const [notice, setNotice] = useState<string | null>(null);

  async function book(roomId: string) {
    setBusy(true);
    setNotice(null);
    try {
      const res = await fetch(`${portalApiBase}/public/tenants/${encodeURIComponent(subdomain)}/bookings`, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ roomId, guestName, guestEmail, checkIn, checkOut }),
      });
      const body = await res.json();
      if (!res.ok) throw new Error(body.message || "Could not book");
      setNotice(`Room reserved for ${body.booking.nights} night(s).`);
      onDone();
    } catch (err) {
      setNotice(err instanceof Error ? err.message : "Could not book");
    } finally {
      setBusy(false);
    }
  }

  async function order(item: string) {
    setBusy(true);
    setNotice(null);
    try {
      const res = await fetch(`${portalApiBase}/public/tenants/${encodeURIComponent(subdomain)}/orders`, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ item, quantity: 1, guestName: guestName || "Guest" }),
      });
      const body = await res.json();
      if (!res.ok) throw new Error(body.message || "Could not order");
      setNotice(`${item} is on the way.`);
      onDone();
    } catch (err) {
      setNotice(err instanceof Error ? err.message : "Could not order");
    } finally {
      setBusy(false);
    }
  }

  return (
    <main className="page">
      <p className="eyebrow">Hotel stay</p>
      <h2>Book a room and order in</h2>
      <p className="lead">
        This is {data.tenant.branding.name} — rooms and room service only. No gym, cinema, or
        hospitality suite.
      </p>
      {notice ? (
        <p className={notice.includes("reserved") || notice.includes("on the way") ? "banner-ok" : "banner-error"}>
          {notice}
        </p>
      ) : null}
      <form className="form" onSubmit={(e) => e.preventDefault()}>
        <label>
          Your name
          <input value={guestName} onChange={(e) => setGuestName(e.target.value)} required />
        </label>
        <label>
          Email
          <input type="email" value={guestEmail} onChange={(e) => setGuestEmail(e.target.value)} required />
        </label>
        <label>
          Check-in
          <input type="date" value={checkIn} onChange={(e) => setCheckIn(e.target.value)} required />
        </label>
        <label>
          Check-out
          <input type="date" value={checkOut} onChange={(e) => setCheckOut(e.target.value)} required />
        </label>
      </form>
      <section className="cards" data-testid="hotel-rooms">
        {data.rooms.map((room) => (
          <article className="card" key={room.id}>
            <h2>{room.name}</h2>
            <p className="muted">
              {room.beds} · {money(room.nightlyMinor)} / night
            </p>
            <button
              className="btn btn-primary"
              disabled={busy || !room.available || !guestName || !guestEmail || !checkIn || !checkOut}
              onClick={() => void book(room.id)}
            >
              {room.available ? "Book room" : "Taken"}
            </button>
          </article>
        ))}
      </section>
      <section className="cards">
        {["Club sandwich", "Continental breakfast", "Grilled catch", "Still water"].map((item) => (
          <article className="card" key={item}>
            <h2>{item}</h2>
            <button className="btn btn-ghost" disabled={busy} onClick={() => void order(item)}>
              Order to room
            </button>
          </article>
        ))}
      </section>
    </main>
  );
}

function HotelAdmin({
  data,
  subdomain,
  onDone,
}: {
  data: HotelPayload;
  subdomain: string;
  onDone: () => void;
}) {
  const [prompt, setPrompt] = useState<BeforeInstallPromptEvent | null>(null);
  const [banner, setBanner] = useState(true);

  useEffect(() => {
    const onPrompt = (event: Event) => {
      event.preventDefault();
      setPrompt(event as BeforeInstallPromptEvent);
    };
    window.addEventListener("beforeinstallprompt", onPrompt);
    return () => window.removeEventListener("beforeinstallprompt", onPrompt);
  }, []);

  async function setStatus(bookingId: string, status: string) {
    await fetch(
      `${portalApiBase}/public/tenants/${encodeURIComponent(subdomain)}/bookings/${encodeURIComponent(bookingId)}/status`,
      {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ status }),
      },
    );
    onDone();
  }

  return (
    <main className="page">
      {banner ? (
        <div className="card">
          <p className="eyebrow">Install on first visit</p>
          <h2>{data.tenant.branding.name} front desk</h2>
          <p className="lead">Add this hotel dashboard to the home screen.</p>
          <div className="actions">
            <button
              className="btn btn-primary"
              type="button"
              onClick={() => void prompt?.prompt()}
              disabled={!prompt}
            >
              Install PWA
            </button>
            <button className="btn btn-ghost" type="button" onClick={() => setBanner(false)}>
              Continue in browser
            </button>
          </div>
        </div>
      ) : null}
      <h2>Reservations</h2>
      <ul className="list">
        {data.bookings.length === 0 ? <li className="muted">No bookings yet.</li> : null}
        {data.bookings.map((booking) => (
          <li key={booking.id}>
            <strong>
              {booking.guestName} · {booking.roomName}
            </strong>
            <span className="muted">
              {booking.checkIn} → {booking.checkOut} · {booking.status} · {money(booking.totalMinor)}
            </span>
            <span className="deliverable-links">
              <button className="btn btn-ghost" type="button" onClick={() => void setStatus(booking.id, "checked_in")}>
                Check in
              </button>
              <button className="btn btn-ghost" type="button" onClick={() => void setStatus(booking.id, "checked_out")}>
                Check out
              </button>
            </span>
          </li>
        ))}
      </ul>
      <h2>Room service</h2>
      <ul className="list">
        {data.orders.length === 0 ? <li className="muted">No orders yet.</li> : null}
        {data.orders.map((order) => (
          <li key={order.id}>
            <strong>
              {order.item} × {order.quantity}
            </strong>
            <span className="muted">
              {order.guestName} · {order.status} · {money(order.amountMinor)}
            </span>
          </li>
        ))}
      </ul>
    </main>
  );
}

type BeforeInstallPromptEvent = Event & { prompt: () => Promise<void> };
