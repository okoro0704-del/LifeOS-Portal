import { z } from "zod";
import { EnvValidationError } from "./server.js";

/**
 * Vite client env (this repo is not Next.js).
 * NEXT_PUBLIC_GATEWAY_URL from the readiness directive maps to VITE_PORTAL_API
 * or VITE_GATEWAY_URL.
 */
export const clientEnvSchema = z.object({
  VITE_PORTAL_API: z.string().min(1).optional(),
  VITE_GATEWAY_URL: z.string().url().optional(),
  VITE_TRUSTID_API: z.string().url().optional(),
  VITE_TRUSTID_WEB: z.string().url().optional(),
  VITE_TRUSTID_MODE: z.enum(["mock", "remote"]).optional(),
  VITE_TRUSTID_CLIENT_ID: z.string().min(1).optional(),
  VITE_TRUSTID_REDIRECT_URI: z.string().url().optional(),
});

export function resolveGatewayUrl(env: Record<string, string | undefined>) {
  return env.VITE_GATEWAY_URL || env.NEXT_PUBLIC_GATEWAY_URL || env.VITE_PORTAL_API || "/api";
}

export function parsePortalClientEnv(source: Record<string, string | undefined>, opts?: { production?: boolean }) {
  const parsed = clientEnvSchema.safeParse(source);
  if (!parsed.success) throw new EnvValidationError(parsed.error.issues);
  if (opts?.production && (parsed.data.VITE_TRUSTID_MODE ?? "mock") === "mock") {
    throw new EnvValidationError([
      {
        path: ["VITE_TRUSTID_MODE"],
        message: "mock Trust ID cannot be baked into a production client bundle",
      },
    ]);
  }
  return {
    ...parsed.data,
    gatewayUrl: resolveGatewayUrl(source),
  };
}
