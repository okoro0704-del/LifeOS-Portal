import { TENANT_APP_ROOT_DOMAIN, tenantAppHostname, tenantLabelFromHost } from "@lifeos-portal/shared";
import { config } from "../config.js";

const NETLIFY_API = "https://api.netlify.com/api/v1";

export function tenantHostnameFor(subdomain: string) {
  return tenantAppHostname(subdomain);
}

function reservedLabel(subdomain: string) {
  return tenantLabelFromHost(`${subdomain}.${TENANT_APP_ROOT_DOMAIN}`) == null;
}

async function netlifyJson(path: string, init?: RequestInit) {
  const token = config.netlifyAuthToken;
  if (!token) return undefined;
  const res = await fetch(`${NETLIFY_API}${path}`, {
    ...init,
    headers: {
      Authorization: `Bearer ${token}`,
      "Content-Type": "application/json",
      ...(init?.headers ?? {}),
    },
  });
  const body = await res.json().catch(() => ({}));
  if (!res.ok) {
    throw new Error(`netlify_${res.status}`);
  }
  return body;
}

/** Attach `{subdomain}.getlifeos.app` to the guest portal so hotel URLs resolve. */
export async function provisionTenantHostname(subdomain: string) {
  const slug = subdomain.trim().toLowerCase();
  if (!slug || reservedLabel(slug) || config.nodeEnv === "test") return;
  if (!config.netlifyAuthToken || !config.netlifySiteId) return;

  const hostname = tenantHostnameFor(slug);
  const site = (await netlifyJson(`/sites/${config.netlifySiteId}`)) as {
    domain_aliases?: string[];
  };
  const aliases = new Set(site.domain_aliases ?? []);
  aliases.add("admin.getlifeos.app");
  aliases.add(hostname);
  await netlifyJson(`/sites/${config.netlifySiteId}`, {
    method: "PATCH",
    body: JSON.stringify({ domain_aliases: [...aliases] }),
  });

  if (!config.netlifyDnsZoneId) return;
  const records = (await netlifyJson(`/dns_zones/${config.netlifyDnsZoneId}/dns_records`)) as Array<{
    hostname?: string;
  }>;
  if (records.some((row) => row.hostname === hostname)) return;
  await netlifyJson(`/dns_zones/${config.netlifyDnsZoneId}/dns_records`, {
    method: "POST",
    body: JSON.stringify({
      type: "NETLIFY",
      hostname,
      value: "lifeos-portal1.netlify.app",
    }),
  });
}
