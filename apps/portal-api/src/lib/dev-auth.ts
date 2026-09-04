/**
 * Dev-only mock login. Disabled in production and whenever Trust ID is remote
 * (server TRUSTID_MODE or Vite VITE_TRUSTID_MODE).
 */
export function isDevAuthEnabled(
  env: { nodeEnv: string; trustIdMode: string; bypassTrustId?: boolean; enableTrustId?: boolean },
  source: NodeJS.ProcessEnv = process.env,
): boolean {
  if (env.bypassTrustId || source.BYPASS_TRUST_ID === "true") return true;
  if (env.nodeEnv === "production") return false;
  if (env.nodeEnv === "development" || env.enableTrustId === false) return true;
  if (source.VITE_TRUSTID_MODE === "remote") return false;
  return env.trustIdMode === "mock";
}
