import { useEffect, useMemo, useState } from "react";
import { BrowserRouter, Navigate, Route, Routes, useLocation } from "react-router-dom";
import {
  GUEST_PORTAL_ORIGIN,
  mybrandUserAdminEnterPath,
  platformUserDashboardUrl,
} from "@lifeos-portal/shared";
import { portalApiBase } from "../lib/api";

type MyBrandTenant = {
  tenant: {
    displayName: string;
    subdomain: string;
    verticalId: string;
    osId?: string;
    mybrand?: {
      slug: string;
      publicOrigin: string;
      adminOrigin: string;
      studioOrigin: string;
      trustId?: string;
      upstreamPublicOrigin?: string;
      upstreamAdminOrigin?: string;
    };
  };
};

function Frame({ title, src }: { title: string; src: string }) {
  return (
    <iframe
      title={title}
      src={src}
      style={{
        border: 0,
        width: "100%",
        height: "100%",
        display: "block",
        background: "#0b0c10",
        flex: 1,
      }}
      allow="clipboard-write; fullscreen; autoplay; camera; microphone"
      referrerPolicy="strict-origin-when-cross-origin"
    />
  );
}

function PortalEscapeBar({ brand }: { brand: string }) {
  return (
    <div
      style={{
        display: "flex",
        gap: "0.75rem",
        alignItems: "center",
        justifyContent: "space-between",
        padding: "0.55rem 0.9rem",
        background: "#0f172a",
        color: "#e2e8f0",
        fontFamily: "Manrope, system-ui, sans-serif",
        fontSize: "0.85rem",
      }}
      data-testid="portal-escape-bar"
    >
      <span>
        <strong>{brand}</strong> · User Admin
      </span>
      <span style={{ display: "flex", gap: "0.75rem", flexWrap: "wrap" }}>
        <a href={platformUserDashboardUrl()} style={{ color: "#7dd3fc" }}>
          LifeOS dashboard
        </a>
        <a href={`${GUEST_PORTAL_ORIGIN}/app/business`} style={{ color: "#7dd3fc" }}>
          Add verticals
        </a>
      </span>
    </div>
  );
}

function TopLevelRedirect({ to }: { to: string }) {
  useEffect(() => {
    window.location.replace(to);
  }, [to]);
  return (
    <div className="tap tap-boot">
      <p className="muted">Opening studio…</p>
    </div>
  );
}

function BrandPathRedirect({ brandOrigin }: { brandOrigin: string }) {
  const location = useLocation();
  const target = `${brandOrigin}${location.pathname}${location.search}${location.hash}`;
  return <TopLevelRedirect to={target} />;
}

/**
 * Fallback when Netlify edge has not yet proxied `{brand}.getlifeos.app` to mybrandOS.
 * USER ADMIN must open studio (`/enter?wl=1…`), never the public Digital Life.
 */
export function TenantMyBrandApp({ subdomain, basename }: { subdomain: string; basename: string }) {
  const [meta, setMeta] = useState<MyBrandTenant["tenant"] | null>(null);
  const [error, setError] = useState<string | null>(null);

  useEffect(() => {
    void fetch(`${portalApiBase}/public/tenants/${encodeURIComponent(subdomain)}`)
      .then(async (res) => {
        if (!res.ok) throw new Error("This brand app is not ready.");
        const body = (await res.json()) as MyBrandTenant;
        setMeta(body.tenant);
      })
      .catch((err) => setError(err instanceof Error ? err.message : "Could not open brand app."));
  }, [subdomain]);

  const origins = useMemo(() => {
    if (!meta) return null;
    const slug = meta.mybrand?.slug || meta.subdomain;
    const brandOrigin = `https://${slug}.getlifeos.app`;
    const trustId =
      meta.mybrand?.trustId || `TD-WL-${slug.toUpperCase().replace(/-/g, "")}`.slice(0, 80);
    const enterPath = mybrandUserAdminEnterPath({
      trustId,
      displayName: meta.displayName,
    });
    const upstream =
      meta.mybrand?.upstreamPublicOrigin ||
      `https://mybrandos-production.up.railway.app/u/${slug}`;
    const upstreamAdmin =
      meta.mybrand?.upstreamAdminOrigin ||
      `https://mybrandos-production.up.railway.app${enterPath}`;
    const onBrandHost = window.location.hostname.toLowerCase() === `${slug}.getlifeos.app`;
    return {
      slug,
      brandOrigin,
      enterPath,
      // USER APP embed
      publicEmbed: onBrandHost ? upstream : meta.mybrand?.publicOrigin || `${brandOrigin}/`,
      // USER ADMIN: navigate browser to studio path on brand host (edge proxies /enter).
      adminBrowserUrl: `${brandOrigin}${enterPath}`,
      adminEmbed: upstreamAdmin,
      preferRedirectToBrand: !onBrandHost,
    };
  }, [meta]);

  if (error) {
    return (
      <div className="tap tap-boot">
        <p className="banner-error">{error}</p>
      </div>
    );
  }
  if (!meta || !origins) {
    return (
      <div className="tap tap-boot">
        <p className="muted">Opening {subdomain}…</p>
      </div>
    );
  }

  if (origins.preferRedirectToBrand) {
    return (
      <BrowserRouter basename={basename}>
        <Routes>
          <Route path="*" element={<BrandPathRedirect brandOrigin={origins.brandOrigin} />} />
        </Routes>
      </BrowserRouter>
    );
  }

  return (
    <BrowserRouter basename={basename}>
      <Routes>
        <Route path="/" element={<Frame title={`${meta.displayName} public site`} src={origins.publicEmbed} />} />
        <Route path="/admin" element={<TopLevelRedirect to={origins.adminBrowserUrl} />} />
        <Route path="/admin/*" element={<TopLevelRedirect to={origins.adminBrowserUrl} />} />
        <Route
          path="/enter"
          element={
            <div style={{ display: "flex", flexDirection: "column", height: "100vh" }}>
              <PortalEscapeBar brand={meta.displayName} />
              <Frame title={`${meta.displayName} studio`} src={origins.adminEmbed} />
            </div>
          }
        />
        <Route path="*" element={<Navigate to="/" replace />} />
      </Routes>
    </BrowserRouter>
  );
}
