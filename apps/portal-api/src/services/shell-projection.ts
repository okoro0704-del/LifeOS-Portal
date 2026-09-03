/**
 * Project a Portal install into the LifeOS Universal Shell installed-apps registry
 * so downloadable verticals appear with preset icon + tag after provision.
 */
import { config } from "../config.js";
import { httpJson } from "../lib/http.js";

export type ShellProjectInput = {
  trustId: string;
  appId: string;
  tenantId: string;
  displayName: string;
  subdomain: string;
  launchUrl: string;
  preset?: string | null;
  icon?: string | null;
};

const HOSPITALITY_SHELL_ICONS: Record<string, string> = {
  local_food: "🍲",
  shared_homes: "🏠",
};

export function shellIconForPreset(appId: string, preset?: string | null): string | null {
  if (appId === "hospitalityos" && preset && HOSPITALITY_SHELL_ICONS[preset]) {
    return HOSPITALITY_SHELL_ICONS[preset];
  }
  return null;
}

/**
 * Best-effort shell registration. Failures are swallowed so domain OS install still succeeds
 * when LifeOS API is offline in local/dev.
 */
export async function projectInstallToLifeOsShell(input: ShellProjectInput): Promise<void> {
  const origin = `https://${input.subdomain}.lifeos.app`;
  const launchUrl = input.launchUrl || `${origin}/staff`;
  const preset = input.preset ?? null;
  try {
    await httpJson(config.lifeosApiUrl, "/v1/distributor/tenants/bootstrap", {
      method: "POST",
      timeoutMs: 4_000,
      body: JSON.stringify({
        appId: input.appId,
        tenantId: input.tenantId,
        trustId: input.trustId,
        displayName: input.displayName,
        subdomain: input.subdomain,
        experienceUrl: origin,
        approvedOrigin: origin,
        osType: input.appId.replace(/os$/, "") || "other",
        audience: "business",
        preset,
        icon: input.icon ?? null,
        launchUrl,
      }),
    });
  } catch {
    // Shell projection is additive; Portal install remains ready without LifeOS online.
  }
}
