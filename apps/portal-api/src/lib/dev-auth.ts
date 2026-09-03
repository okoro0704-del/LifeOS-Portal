/**
 * Dev-only mock login. Disabled in production and whenever Trust ID is remote
 * (server TRUSTID_MODE or Vite VITE_TRUSTID_MODE).
 */
export function isDevAuthEnabled(
  env: { nodeEnv: string; trustIdMode: string },
  source: NodeJS.ProcessEnv = process.env,
): boolean {
  if (env.nodeEnv === "production") return false;
  if (source.VITE_TRUSTID_MODE === "remote") return false;
  return env.trustIdMode === "mock";
}
