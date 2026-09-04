import { isTrustIdEnabled } from "./local-auth.js";
import { HttpError } from "./http.js";

export function isLoopbackApi(apiUrl: string) {
  try {
    const host = new URL(apiUrl).hostname.toLowerCase();
    return host === "localhost" || host === "127.0.0.1" || host === "[::1]" || host === "::1";
  } catch {
    return true;
  }
}

export function useLocalDomainOs(apiUrl: string) {
  return !isTrustIdEnabled() || isLoopbackApi(apiUrl);
}

export function isUpstreamUnavailable(err: unknown) {
  return err instanceof HttpError && err.code === "upstream_unavailable";
}
