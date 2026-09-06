import { useState, type ReactNode } from "react";

function greetingFor(now = new Date()) {
  const hour = now.getHours();
  if (hour < 12) return "Good morning";
  if (hour < 17) return "Good afternoon";
  return "Good evening";
}

export type AdminNavId = "today" | "brand" | "catalog" | "staff" | "domain" | "activity" | "analytics";

export function AdminSiteShell({
  brand,
  logoUrl,
  accent,
  staff,
  nav,
  active,
  onNav,
  onLogout,
  children,
}: {
  brand: string;
  logoUrl?: string;
  accent: string;
  staff: { name: string; email: string; role: string };
  nav: Array<{ id: AdminNavId; label: string }>;
  active: AdminNavId;
  onNav: (id: AdminNavId) => void;
  onLogout: () => void;
  children: ReactNode;
}) {
  const [open, setOpen] = useState(false);
  return (
    <div className="admin-site" style={{ ["--tap-accent" as string]: accent }} data-testid="admin-site">
      <header className="admin-site-top">
        <div className="admin-site-brand">
          {logoUrl ? <img src={logoUrl} alt="" /> : <span>{brand.slice(0, 1)}</span>}
          <div>
            <p>{brand}</p>
            <strong>Admin</strong>
          </div>
        </div>
        <nav className="admin-site-nav">
          {nav.map((item) => (
            <button
              key={item.id}
              type="button"
              className={active === item.id ? "active" : ""}
              onClick={() => {
                setOpen(false);
                onNav(item.id);
              }}
            >
              {item.label}
            </button>
          ))}
        </nav>
        <div className="admin-profile">
          <button type="button" className="admin-profile-btn" onClick={() => setOpen((value) => !value)} aria-expanded={open}>
            <i>{staff.name.slice(0, 1)}</i>
            <span>
              {greetingFor()}, {staff.name.split(" ")[0]}
            </span>
          </button>
          {open ? (
            <div className="admin-profile-menu" data-testid="admin-profile-menu">
              <p className="eyebrow">Profile</p>
              <strong>{staff.name}</strong>
              <span>{staff.email}</span>
              <span>{staff.role.replaceAll("_", " ")}</span>
              <button className="btn btn-ghost" type="button" onClick={onLogout}>
                Log out
              </button>
            </div>
          ) : null}
        </div>
      </header>
      <main className="admin-site-body">{children}</main>
    </div>
  );
}
