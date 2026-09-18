const ECO_WEB = (import.meta.env.VITE_ECOMMERCEOS_WEB_URL || "https://e-commerceos.netlify.app").replace(
  /\/$/,
  "",
);

export function TenantEcommerceApp({ subdomain, basename }: { subdomain: string; basename: string }) {
  const raw = window.location.pathname;
  const prefix = basename === "/" ? "" : basename.replace(/\/$/, "");
  const path = (prefix && raw.startsWith(prefix) ? raw.slice(prefix.length) : raw) || "/";
  const params = new URLSearchParams(window.location.search);
  params.set("store", subdomain);
  const src = `${ECO_WEB}${path}?${params.toString()}`;
  return (
    <iframe
      title="EcommerceOS"
      src={src}
      style={{ border: 0, width: "100%", minHeight: "100vh", display: "block" }}
    />
  );
}
