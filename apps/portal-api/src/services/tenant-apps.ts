import { deflateSync } from "node:zlib";
import { tenantDeliverables } from "@lifeos-portal/shared";
import type { PortalInstall } from "../store.js";

export type PublicTenantApp = {
  subdomain: string;
  displayName: string;
  osId: string;
  verticalId: string;
  modules: string[];
  hostname: string;
  guestAppUrl: string;
  adminDashboardUrl: string;
  status: string;
};

const RESERVED_HOSTS = new Set([
  "lifeos.app",
  "www.lifeos.app",
  "host.lifeos.app",
  "getlifeos.app",
  "www.getlifeos.app",
  "admin.getlifeos.app",
  "track.lifeos.app",
]);

export function tenantSubdomainFromHost(hostHeader?: string) {
  const host = hostHeader?.split(":")[0]?.toLowerCase() ?? "";
  if (!host || RESERVED_HOSTS.has(host) || host.endsWith(".railway.app") || host.endsWith(".netlify.app")) {
    return undefined;
  }
  if (host.endsWith(".lifeos.app")) return host.slice(0, -".lifeos.app".length);
  return undefined;
}

export function toPublicTenantApp(row: PortalInstall): PublicTenantApp {
  const deliverables = tenantDeliverables(row.subdomain, row.customDomain);
  return {
    subdomain: row.subdomain,
    displayName: row.displayName,
    osId: row.osId,
    verticalId: row.verticalId,
    modules: row.enabledModules ?? row.modulesEnabled,
    hostname: deliverables.hostname,
    guestAppUrl: deliverables.guestApp.url,
    adminDashboardUrl: deliverables.adminDashboard.url,
    status: row.status,
  };
}

function crc32(buf: Buffer) {
  let crc = ~0;
  for (const byte of buf) {
    crc ^= byte;
    for (let i = 0; i < 8; i += 1) crc = crc & 1 ? (crc >>> 1) ^ 0xedb88320 : crc >>> 1;
  }
  return ~crc >>> 0;
}

function chunk(type: string, data: Buffer) {
  const body = Buffer.concat([Buffer.from(type), data]);
  const out = Buffer.alloc(12 + data.length);
  out.writeUInt32BE(data.length, 0);
  body.copy(out, 4);
  out.writeUInt32BE(crc32(body), 8 + data.length);
  return out;
}

export function pngIcon(size: number, rgb: [number, number, number]) {
  const stride = size * 3 + 1;
  const raw = Buffer.alloc(stride * size);
  for (let y = 0; y < size; y += 1) {
    const row = y * stride;
    raw[row] = 0;
    for (let x = 0; x < size; x += 1) {
      const i = row + 1 + x * 3;
      raw[i] = rgb[0];
      raw[i + 1] = rgb[1];
      raw[i + 2] = rgb[2];
    }
  }
  const ihdr = Buffer.alloc(13);
  ihdr.writeUInt32BE(size, 0);
  ihdr.writeUInt32BE(size, 4);
  ihdr[8] = 8;
  ihdr[9] = 2;
  return Buffer.concat([
    Buffer.from([137, 80, 78, 71, 13, 10, 26, 10]),
    chunk("IHDR", ihdr),
    chunk("IDAT", deflateSync(raw)),
    chunk("IEND", Buffer.alloc(0)),
  ]);
}

function escapeHtml(value: string) {
  return value
    .replaceAll("&", "&amp;")
    .replaceAll("<", "&lt;")
    .replaceAll(">", "&gt;")
    .replaceAll('"', "&quot;");
}

export function tenantAssetBase(subdomain: string, onTenantHost: boolean) {
  return onTenantHost ? "" : `/t/${encodeURIComponent(subdomain)}`;
}

export function tenantManifest(opts: {
  tenant: PublicTenantApp;
  surface: "guest" | "admin";
  assetBase: string;
}) {
  const name =
    opts.surface === "admin" ? `${opts.tenant.displayName} Admin` : opts.tenant.displayName;
  const startUrl = opts.surface === "admin" ? `${opts.assetBase}/admin` : `${opts.assetBase}/`;
  return {
    id: `${opts.assetBase || "/"}#${opts.surface}`,
    name,
    short_name: opts.surface === "admin" ? "Admin" : opts.tenant.displayName.slice(0, 12),
    description:
      opts.surface === "admin"
        ? `Installable admin dashboard for ${opts.tenant.displayName}`
        : `Guest app for ${opts.tenant.displayName}`,
    start_url: startUrl,
    scope: opts.assetBase ? `${opts.assetBase}/` : "/",
    display: "standalone",
    display_override: ["standalone", "minimal-ui", "browser"],
    orientation: "portrait-primary",
    background_color: "#f2f4f7",
    theme_color: opts.surface === "admin" ? "#0a5f56" : "#0d7a6f",
    icons: [
      { src: `${opts.assetBase}/icons/192.png`, sizes: "192x192", type: "image/png", purpose: "any" },
      { src: `${opts.assetBase}/icons/512.png`, sizes: "512x512", type: "image/png", purpose: "any maskable" },
    ],
  };
}

export function tenantServiceWorker(assetBase: string) {
  const prefix = assetBase || "";
  return `const CACHE = "lifeos-tenant-v1";
const ASSETS = ["${prefix}/", "${prefix}/admin", "${prefix}/tenant-app.js", "${prefix}/icons/192.png", "${prefix}/icons/512.png"];
self.addEventListener("install", (event) => {
  event.waitUntil(caches.open(CACHE).then((cache) => cache.addAll(ASSETS)).then(() => self.skipWaiting()));
});
self.addEventListener("activate", (event) => {
  event.waitUntil(self.clients.claim());
});
self.addEventListener("fetch", (event) => {
  if (event.request.method !== "GET") return;
  event.respondWith(
    fetch(event.request)
      .then((res) => {
        const copy = res.clone();
        caches.open(CACHE).then((cache) => cache.put(event.request, copy));
        return res;
      })
      .catch(() => caches.match(event.request))
  );
});
`;
}

export function tenantAppScript() {
  return `const surface = document.documentElement.dataset.surface || "guest";
const subdomain = document.documentElement.dataset.subdomain || "";
const assetBase = document.documentElement.dataset.assetBase || "";
const installKey = "lifeos.adminPwa." + subdomain;

function $(id) { return document.getElementById(id); }

async function loadTenant() {
  const res = await fetch("/public/tenants/" + encodeURIComponent(subdomain));
  if (!res.ok) throw new Error("Tenant is not ready");
  return res.json();
}

function setText(id, value) {
  const el = $(id);
  if (el) el.textContent = value;
}

let deferredPrompt = null;
window.addEventListener("beforeinstallprompt", (event) => {
  event.preventDefault();
  deferredPrompt = event;
  const banner = $("install-banner");
  if (banner) banner.hidden = false;
});

async function promptInstall() {
  if (!deferredPrompt) return;
  deferredPrompt.prompt();
  await deferredPrompt.userChoice;
  deferredPrompt = null;
  localStorage.setItem(installKey, "installed");
  const banner = $("install-banner");
  if (banner) banner.hidden = true;
}

function hideBanner() {
  localStorage.setItem(installKey, "seen");
  const banner = $("install-banner");
  if (banner) banner.hidden = true;
}

window.addEventListener("load", async () => {
  if ("serviceWorker" in navigator) {
    navigator.serviceWorker.register(assetBase + "/sw.js", { scope: assetBase ? assetBase + "/" : "/" });
  }
  try {
    const data = await loadTenant();
    const tenant = data.tenant;
    setText("brand", tenant.displayName);
    setText("vertical", tenant.verticalId.replaceAll("_", " "));
    setText("host", tenant.hostname);
    const modules = $("modules");
    if (modules) modules.textContent = (tenant.modules || []).join(" · ") || "Ready";
    const guest = $("open-guest");
    if (guest) guest.href = tenant.guestAppUrl;
    const admin = $("open-admin");
    if (admin) admin.href = tenant.adminDashboardUrl;
  } catch (err) {
    setText("brand", subdomain);
    setText("status", err.message || "Unavailable");
  }
  if (surface === "admin" && localStorage.getItem(installKey) !== "installed") {
    const banner = $("install-banner");
    if (banner) banner.hidden = false;
  }
});

document.addEventListener("click", (event) => {
  const target = event.target;
  if (!(target instanceof HTMLElement)) return;
  if (target.id === "install-pwa") void promptInstall();
  if (target.id === "dismiss-install") hideBanner();
});
`;
}

export function tenantAppHtml(opts: {
  tenant: PublicTenantApp;
  surface: "guest" | "admin";
  assetBase: string;
}) {
  const { tenant, surface, assetBase } = opts;
  const title =
    surface === "admin" ? `${tenant.displayName} Admin` : tenant.displayName;
  const lead =
    surface === "admin"
      ? "This dashboard is a PWA. Install it on first visit to keep the business on the home screen."
      : "This guest app works in the browser and as an installable PWA on the subdomain you set.";
  return `<!doctype html>
<html lang="en" data-surface="${surface}" data-subdomain="${escapeHtml(tenant.subdomain)}" data-asset-base="${escapeHtml(assetBase)}">
<head>
  <meta charset="utf-8" />
  <meta name="viewport" content="width=device-width, initial-scale=1" />
  <meta name="theme-color" content="${surface === "admin" ? "#0a5f56" : "#0d7a6f"}" />
  <meta name="mobile-web-app-capable" content="yes" />
  <meta name="apple-mobile-web-app-capable" content="yes" />
  <meta name="apple-mobile-web-app-title" content="${escapeHtml(title)}" />
  <title>${escapeHtml(title)}</title>
  <link rel="manifest" href="${assetBase}/manifest.webmanifest?surface=${surface}" />
  <link rel="apple-touch-icon" href="${assetBase}/icons/192.png" />
  <style>
    :root { color-scheme: light; --accent:${surface === "admin" ? "#0a5f56" : "#0d7a6f"}; --bg:#f2f4f7; --ink:#15202b; --muted:#5a6878; --surface:#fff; }
    * { box-sizing: border-box; }
    body { margin:0; font-family: Manrope, system-ui, sans-serif; background:var(--bg); color:var(--ink); }
    main { max-width: 42rem; margin: 0 auto; padding: 2rem 1.25rem 4rem; }
    .eyebrow { text-transform:uppercase; letter-spacing:.08em; font-size:.75rem; color:var(--muted); font-weight:700; }
    h1 { font-family: Fraunces, Georgia, serif; font-size:2rem; margin:.35rem 0 0; }
    .lead { color:var(--muted); line-height:1.5; }
    .card { background:var(--surface); border-radius:18px; padding:1.25rem 1.35rem; box-shadow:0 4px 16px rgba(21,32,43,.06); margin-top:1.25rem; display:grid; gap:.6rem; }
    .host { font-family: ui-monospace, Menlo, Consolas, monospace; font-size:.9rem; }
    .actions { display:flex; flex-wrap:wrap; gap:.6rem; margin-top:.4rem; }
    a.btn, button.btn { display:inline-flex; align-items:center; justify-content:center; min-height:44px; padding:.75rem 1.1rem; border-radius:12px; font:inherit; font-weight:600; text-decoration:none; border:0; cursor:pointer; }
    .btn-primary { background:var(--accent); color:#fff; }
    .btn-ghost { background:transparent; color:var(--ink); border:1px solid rgba(21,32,43,.14); }
    .banner { position:sticky; top:0; background:#0a5f56; color:#fff; padding:1rem 1.25rem; display:grid; gap:.65rem; }
    .banner[hidden] { display:none; }
    .banner strong { font-size:1.05rem; }
  </style>
</head>
<body>
  ${
    surface === "admin"
      ? `<div id="install-banner" class="banner" hidden>
    <strong>Install this admin dashboard</strong>
    <span>Add it to the home screen on first visit. It stays on ${escapeHtml(tenant.hostname)}.</span>
    <div class="actions">
      <button class="btn btn-primary" id="install-pwa" type="button">Install PWA</button>
      <button class="btn btn-ghost" id="dismiss-install" type="button">Continue in browser</button>
    </div>
  </div>`
      : ""
  }
  <main>
    <p class="eyebrow">${surface === "admin" ? "Admin dashboard · PWA" : "Guest app · Web & PWA"}</p>
    <h1 id="brand">${escapeHtml(tenant.displayName)}</h1>
    <p class="lead">${lead}</p>
    <section class="card">
      <p class="eyebrow" id="vertical">${escapeHtml(tenant.verticalId.replaceAll("_", " "))}</p>
      <p class="host" id="host">${escapeHtml(tenant.hostname)}</p>
      <p id="modules" class="lead">${escapeHtml((tenant.modules || []).join(" · "))}</p>
      <p id="status" class="lead"></p>
      <div class="actions">
        ${
          surface === "admin"
            ? `<a class="btn btn-ghost" id="open-guest" href="${escapeHtml(tenant.guestAppUrl)}">Open guest app</a>`
            : `<a class="btn btn-primary" id="open-admin" href="${escapeHtml(tenant.adminDashboardUrl)}">Open admin dashboard</a>`
        }
      </div>
    </section>
  </main>
  <script src="${assetBase}/tenant-app.js" defer></script>
</body>
</html>`;
}
