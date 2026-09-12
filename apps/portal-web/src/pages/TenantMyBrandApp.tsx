import { useEffect, useMemo, useState } from "react";
import { BrowserRouter, Navigate, Route, Routes } from "react-router-dom";
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
        height: "100vh",
        display: "block",
        background: "#0b0c10",
      }}
      allow="clipboard-write; fullscreen; autoplay; camera; microphone"
      referrerPolicy="strict-origin-when-cross-origin"
    />
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

/**
 * Fallback when Netlify edge has not yet proxied `{brand}.getlifeos.app` to mybrandOS.
 * Prefer subdomain deliverable URLs; embed upstream Railway only if needed.
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
    const upstream =
      meta.mybrand?.upstreamPublicOrigin ||
      `https://mybrandos-production.up.railway.app/u/${slug}`;
    const upstreamAdmin =
      meta.mybrand?.upstreamAdminOrigin ||
      `https://mybrandos-production.up.railway.app/enter?wl=1&trustId=${encodeURIComponent(
        `TD-WL-${slug.toUpperCase().replace(/-/g, "")}`.slice(0, 80),
      )}&name=${encodeURIComponent(meta.displayName)}`;
    const onBrandHost = window.location.hostname.toLowerCase() === `${slug}.getlifeos.app`;
    return {
      slug,
      // On the brand host without edge proxy, embed upstream so the page is not blank.
      publicEmbed: onBrandHost ? upstream : meta.mybrand?.publicOrigin || `${brandOrigin}/`,
      adminOrigin: onBrandHost ? upstreamAdmin : meta.mybrand?.adminOrigin || `${brandOrigin}/admin`,
      preferRedirectToBrand: !onBrandHost,
      brandPublic: `${brandOrigin}/`,
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
    return <TopLevelRedirect to={origins.brandPublic} />;
  }

  return (
    <BrowserRouter basename={basename}>
      <Routes>
        <Route path="/" element={<Frame title={`${meta.displayName} public site`} src={origins.publicEmbed} />} />
        <Route path="/admin" element={<TopLevelRedirect to={origins.adminOrigin} />} />
        <Route path="/admin/*" element={<TopLevelRedirect to={origins.adminOrigin} />} />
        <Route path="*" element={<Navigate to="/" replace />} />
      </Routes>
    </BrowserRouter>
  );
}
