/**
 * Boot-time environment. Zod validation lives in @lifeos-portal/env so
 * production refuses localhost upstreams, mock Trust ID, and default secrets.
 */
export { parsePortalServerEnv, EnvValidationError, type PortalServerEnv } from "@lifeos-portal/env";
import { parsePortalServerEnv } from "@lifeos-portal/env";

export const env = parsePortalServerEnv();
export type Env = typeof env;
