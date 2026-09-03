import { fileURLToPath } from "node:url";

/**
 * Vite production resolves the custom `production` export on workspace
 * packages, which points at `dist/`. Netlify (and other UI-only build
 * commands) never compile those packages first. Pin the browser apps to
 * source so `npm --workspace <app> run build` is self-contained.
 */
export const workspaceResolve = {
  conditions: ["import", "module", "browser", "default"],
  alias: {
    "@lifeos-portal/shared": fileURLToPath(
      new URL("../packages/shared/src/index.ts", import.meta.url),
    ),
  },
};
