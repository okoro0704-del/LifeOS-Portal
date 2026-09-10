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

/**
 * White-label surfaces on `{brand}.getlifeos.app`:
 * - `/` → public mybrandOS site
 * - `/admin` → mybrandOS studio (Trust ID bypass enter)
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
    if (meta?.mybrand) return meta.mybrand;
    if (!meta) return null;
    const base = "https://mybrandos-production.up.railway.app";
    const slug = meta.subdomain;
    return {
      slug,
      publicOrigin: `${base}/u/${slug}`,
      adminOrigin: `${base}/enter?wl=1&name=${encodeURIComponent(meta.displayName)}`,
      studioOrigin: `${base}/`,
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

  return (
    <BrowserRouter basename={basename}>
      <Routes>
        <Route path="/" element={<Frame title={`${meta.displayName} public site`} src={origins.publicOrigin} />} />
        <Route path="/admin" element={<Frame title={`${meta.displayName} admin studio`} src={origins.adminOrigin} />} />
        <Route path="/admin/*" element={<Frame title={`${meta.displayName} admin studio`} src={origins.adminOrigin} />} />
        <Route path="*" element={<Navigate to="/" replace />} />
      </Routes>
    </BrowserRouter>
  );
}
