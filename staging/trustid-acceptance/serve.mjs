/**
 * Disposable staging edge: one TLS listener that stands in for Netlify. Routes by Host to the
 * built frontends and proxies same-origin /api/* to the local APIs (stripping /api), exactly like
 * the production _redirects / netlify.toml rules. Only reachable on 127.0.0.1.
 *   https://getlifeos.app             → portal-web dist,  /api → Portal API
 *   https://admin.getlifeos.app       → platform-admin,   /api → Portal API
 *   https://business.getlifeos.app    → business-portal,  /api → Portal API
 *   https://trustid.staging.test:8443 → TrustID web,      /api → TrustID API
 * The test browser resolves those hosts to this listener; nothing reaches production.
 */
import { createReadStream, existsSync, readFileSync, statSync } from "node:fs";
import { request as httpRequest } from "node:http";
import { createServer } from "node:https";
import { extname, join, normalize } from "node:path";
import { fileURLToPath } from "node:url";

const here = fileURLToPath(new URL(".", import.meta.url));
const PORT = Number(process.env.STAGING_EDGE_PORT ?? 8443);
const PORTAL_API = { host: "127.0.0.1", port: 4720 };
const TRUSTID_API = { host: "127.0.0.2", port: 4710 };
const SITES = {
  "getlifeos.app": { dist: join(here, "dist/portal-web"), api: PORTAL_API },
  "admin.getlifeos.app": { dist: join(here, "dist/platform-admin"), api: PORTAL_API },
  "business.getlifeos.app": { dist: join(here, "dist/business-portal"), api: PORTAL_API },
  "trustid.staging.test": {
    dist: join(here, "dist/trustid-web"),
    api: TRUSTID_API,
    // netlify.toml: the Master Device page is never framed.
    headers: { "/dashboard/master-device": { "content-security-policy": "frame-ancestors 'none'", "x-frame-options": "DENY" } },
  },
};
const TYPES = { ".html": "text/html; charset=utf-8", ".js": "text/javascript", ".mjs": "text/javascript", ".css": "text/css", ".json": "application/json", ".svg": "image/svg+xml", ".png": "image/png", ".ico": "image/x-icon", ".wasm": "application/wasm", ".webmanifest": "application/manifest+json", ".woff2": "font/woff2" };

function proxy(req, res, api) {
  const path = req.url.replace(/^\/api(?=\/|$)/, "") || "/";
  const headers = { ...req.headers, "x-forwarded-proto": "https", "x-forwarded-for": "127.0.0.1", "x-forwarded-host": req.headers.host };
  const upstream = httpRequest({ host: api.host, port: api.port, method: req.method, path, headers }, (up) => {
    res.writeHead(up.statusCode ?? 502, up.headers);
    up.pipe(res);
  });
  upstream.on("error", () => {
    if (!res.headersSent) res.writeHead(502, { "content-type": "application/json" });
    res.end(JSON.stringify({ error: "staging_upstream_unavailable" }));
  });
  req.pipe(upstream);
}

function serveStatic(req, res, site) {
  const urlPath = decodeURIComponent(new URL(req.url, "https://x").pathname);
  const safe = normalize(urlPath).replace(/^(\.\.[/\\])+/, "");
  let file = join(site.dist, safe);
  if (!file.startsWith(site.dist) || !existsSync(file) || statSync(file).isDirectory()) file = join(site.dist, "index.html");
  const extra = site.headers?.[urlPath] ?? {};
  res.writeHead(200, { "content-type": TYPES[extname(file)] ?? "application/octet-stream", "cache-control": "no-store", ...extra });
  createReadStream(file).pipe(res);
}

const server = createServer(
  { key: readFileSync(join(here, "tls/leaf.key")), cert: readFileSync(join(here, "tls/leaf.pem")) },
  (req, res) => {
    const host = (req.headers.host ?? "").replace(/:\d+$/, "");
    const site = SITES[host];
    if (!site) {
      res.writeHead(421, { "content-type": "text/plain" });
      return res.end("unknown staging host");
    }
    if (req.url === "/api" || req.url.startsWith("/api/")) return proxy(req, res, site.api);
    return serveStatic(req, res, site);
  },
);
server.listen(PORT, "127.0.0.1", () => console.log(`staging edge on https://127.0.0.1:${PORT}`));
