import { useEffect, useState } from "react";
import { portalApiBase } from "../lib/api";
import { TenantDiningApp } from "./TenantDiningApp";
import { TenantHotelApp } from "./TenantHotelApp";
import { TenantFallbackApp } from "./TenantFallbackApp";

type TenantMeta = {
  tenant: {
    verticalId: string;
    displayName: string;
    branding?: { name: string; primaryColor: string };
    hostname?: string;
  };
};

export function TenantApp({ subdomain, basename }: { subdomain: string; basename: string }) {
  const [verticalId, setVerticalId] = useState<string | null>(null);
  const [error, setError] = useState<string | null>(null);

  useEffect(() => {
    void fetch(`${portalApiBase}/public/tenants/${encodeURIComponent(subdomain)}`)
      .then(async (res) => {
        if (!res.ok) throw new Error("This app is not ready.");
        const body = (await res.json()) as TenantMeta;
        setVerticalId(body.tenant.verticalId);
      })
      .catch((err) => setError(err instanceof Error ? err.message : "Could not open app."));
  }, [subdomain]);

  if (error) {
    return (
      <div className="tap tap-boot">
        <p className="banner-error">{error}</p>
      </div>
    );
  }
  if (!verticalId) {
    return (
      <div className="tap tap-boot">
        <p className="muted">Opening {subdomain}…</p>
      </div>
    );
  }
  if (verticalId === "hotel") return <TenantHotelApp subdomain={subdomain} basename={basename} />;
  if (verticalId === "restaurant" || verticalId === "local_food") {
    return <TenantDiningApp subdomain={subdomain} basename={basename} />;
  }
  return <TenantFallbackApp subdomain={subdomain} basename={basename} />;
}
