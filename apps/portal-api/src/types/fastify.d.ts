import type { PortalUser } from "../store.js";
import type { BiometricAuthContext } from "../services/trustid-stepup.js";

declare module "fastify" {
  interface FastifyRequest {
    portalUser?: PortalUser;
    portalSessionToken?: string;
    trustIdAccessToken?: string;
    biometricAuth?: BiometricAuthContext;
  }
}

export {};
