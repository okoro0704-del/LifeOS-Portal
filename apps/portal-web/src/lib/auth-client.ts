import { PORTAL_AUTH_SCOPES } from "@lifeos-portal/shared";

export type AuthClientConfig = {
  trustIdApi: string;
  clientId: string;
  redirectUri: string;
  scopes: string;
  storageKey?: string;
};

function b64url(bytes: ArrayBuffer | Uint8Array) {
  const arr = bytes instanceof Uint8Array ? bytes : new Uint8Array(bytes);
  let str = "";
  for (const b of arr) str += String.fromCharCode(b);
  return btoa(str).replace(/\+/g, "-").replace(/\//g, "_").replace(/=+$/, "");
}

function randomString(length = 64) {
  const bytes = crypto.getRandomValues(new Uint8Array(length));
  return b64url(bytes);
}

async function sha256(input: string) {
  const data = new TextEncoder().encode(input);
  return crypto.subtle.digest("SHA-256", data);
}

export function createAuthClient(config: AuthClientConfig) {
  const storageKey = config.storageKey ?? "portal.oauth";
  const scopes = config.scopes || PORTAL_AUTH_SCOPES;

  return {
    async beginLogin(opts?: { prompt?: string }) {
      const verifier = randomString(64);
      const challenge = b64url(await sha256(verifier));
      const state = randomString(24);
      const payload = JSON.stringify({ verifier, state, createdAt: Date.now() });
      localStorage.setItem(storageKey, payload);
      sessionStorage.setItem(storageKey, payload);

      const url = new URL(`${config.trustIdApi}/oauth/authorize`);
      url.searchParams.set("client_id", config.clientId);
      url.searchParams.set("redirect_uri", config.redirectUri);
      url.searchParams.set("response_type", "code");
      url.searchParams.set("scope", scopes);
      url.searchParams.set("state", state);
      url.searchParams.set("code_challenge", challenge);
      url.searchParams.set("code_challenge_method", "S256");
      if (opts?.prompt) url.searchParams.set("prompt", opts.prompt);
      window.location.href = url.toString();
    },

    async exchangeCode(code: string, state: string): Promise<{ access_token: string }> {
      const raw = sessionStorage.getItem(storageKey) ?? localStorage.getItem(storageKey);
      if (!raw) throw new Error("Missing PKCE state. Start again from the Portal.");
      const saved = JSON.parse(raw) as { verifier: string; state: string };
      if (saved.state !== state) throw new Error("State mismatch. Start login again.");

      const res = await fetch(`${config.trustIdApi}/oauth/token`, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          grant_type: "authorization_code",
          code,
          redirect_uri: config.redirectUri,
          client_id: config.clientId,
          code_verifier: saved.verifier,
        }),
      });
      const data = (await res.json()) as { access_token?: string; error?: string };
      if (!res.ok || !data.access_token) {
        throw new Error(data.error || "Token exchange failed");
      }
      sessionStorage.removeItem(storageKey);
      localStorage.removeItem(storageKey);
      return { access_token: data.access_token };
    },
  };
}
