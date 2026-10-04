/**
 * Dev-only mock login. Production is checked first: no flag, header or env
 * override can turn it back on there. Also off whenever Trust ID is remote
 * (server TRUSTID_MODE or Vite VITE_TRUSTID_MODE).
 */
export function isDevAuthEnabled(
  env: { nodeEnv: string; trustIdMode: string; bypassTrustId?: boolean; enableTrustId?: boolean },
  source: NodeJS.ProcessEnv = process.env,
): boolean {
  if (env.nodeEnv === "production" || source.NODE_ENV === "production") return false;
  if (env.bypassTrustId || source.BYPASS_TRUST_ID === "true") return true;
  if (env.nodeEnv === "development" || env.enableTrustId === false) return true;
  if (source.VITE_TRUSTID_MODE === "remote") return false;
  return env.trustIdMode === "mock";
}
