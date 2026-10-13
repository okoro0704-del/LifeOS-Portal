/**
 * Shared Playwright setup for the disposable staging acceptance run.
 * - Chromium resolves ONLY the four staging hosts to the local edge; every other name is NOTFOUND,
 *   so nothing can reach production or the internet.
 * - The edge certificate is trusted by SPKI pin for this browser only.
 * - A CDP virtual authenticator holds each test identity's software passkey (no real device).
 */
import { readFileSync, mkdirSync } from "node:fs";
import { createPrivateKey } from "node:crypto";
import { fileURLToPath, pathToFileURL } from "node:url";
import type { Browser, BrowserContext, Page } from "playwright";
// Playwright from the TrustID worktree (PLAYWRIGHT_DIR overrides).
const { chromium } = (await import(pathToFileURL(`${process.env.PLAYWRIGHT_DIR ?? `${process.env.TRUSTID_REPO}/node_modules/playwright`}/index.mjs`).href)) as typeof import("playwright");

export const S = new URL(".", import.meta.url);
export const TRUSTID_WEB = "https://trustid.staging.test:8443";
export const HOSTS = { portal: "https://getlifeos.app", admin: "https://admin.getlifeos.app", business: "https://business.getlifeos.app" };
const ALLOWED_HOSTS = new Set(["getlifeos.app", "admin.getlifeos.app", "business.getlifeos.app", "trustid.staging.test"]);
type Subject = { trustId: string; sessionToken: string; passkey: { credentialId: string; privateKeyPem: string } };
export const seed = JSON.parse(readFileSync(new URL("./seed.json", S), "utf8")) as { cookieName: string; subjects: Record<string, Subject> };
export const shotsDir = new URL("./shots/", S);
mkdirSync(shotsDir, { recursive: true });

export const results: Array<{ name: string; ok: boolean; detail: string }> = [];
export function check(name: string, ok: unknown, detail = "") {
  results.push({ name, ok: Boolean(ok), detail });
  console.log(`${ok ? "PASS" : "FAIL"}  ${name}${detail ? `  — ${detail}` : ""}`);
}

export const offHostRequests: string[] = [];
/** Responses actually received from a non-staging host (must stay empty). */
export const offHostResponses: string[] = [];

export async function launch(): Promise<Browser> {
  const spki = readFileSync(new URL("./tls/spki.txt", S), "utf8").trim();
  return chromium.launch({
    headless: true,
    args: [
      "--host-resolver-rules=MAP getlifeos.app 127.0.0.1:8443, MAP admin.getlifeos.app 127.0.0.1:8443, MAP business.getlifeos.app 127.0.0.1:8443, MAP trustid.staging.test 127.0.0.1, MAP * ~NOTFOUND",
      `--ignore-certificate-errors-spki-list=${spki}`,
    ],
  });
}

/** A browser profile = one test device. Signed in to TrustID as `trustId` (test identity). */
export async function deviceContext(browser: Browser, trustId: string, opts: { second?: boolean; phone?: boolean } = {}): Promise<BrowserContext> {
  const context = await browser.newContext(opts.phone ? { viewport: { width: 390, height: 844 }, isMobile: true, hasTouch: true, deviceScaleFactor: 2 } : { viewport: { width: 1280, height: 900 } });
  context.on("request", (req) => {
    const host = new URL(req.url()).hostname;
    if (!ALLOWED_HOSTS.has(host) && !req.url().startsWith("data:") && !req.url().startsWith("blob:")) offHostRequests.push(req.url());
  });
  context.on("response", (res) => {
    const u = new URL(res.url());
    if ((u.protocol === "https:" || u.protocol === "http:") && !ALLOWED_HOSTS.has(u.hostname)) offHostResponses.push(res.url());
  });
  await context.addCookies([
    { name: seed.cookieName, value: opts.second ? (seed.subjects[trustId] as Subject & { sessionToken2: string }).sessionToken2 : seed.subjects[trustId]!.sessionToken, domain: "trustid.staging.test", path: "/", secure: true, httpOnly: true, sameSite: "None" },
  ]);
  return context;
}

/** Virtual platform authenticator holding the identity's test passkey (user verification on). */
export async function attachPasskey(context: BrowserContext, page: Page, trustId: string) {
  const s = seed.subjects[trustId]!;
  const cdp = await context.newCDPSession(page);
  await cdp.send("WebAuthn.enable");
  const { authenticatorId } = await cdp.send("WebAuthn.addVirtualAuthenticator", {
    options: { protocol: "ctap2", transport: "internal", hasResidentKey: true, hasUserVerification: true, isUserVerified: true, automaticPresenceSimulation: true },
  });
  const der = createPrivateKey(s.passkey.privateKeyPem).export({ format: "der", type: "pkcs8" });
  await cdp.send("WebAuthn.addCredential", {
    authenticatorId,
    credential: {
      credentialId: Buffer.from(s.passkey.credentialId, "base64url").toString("base64"),
      isResidentCredential: false,
      rpId: "trustid.staging.test",
      privateKey: der.toString("base64"),
      signCount: Math.floor(Date.now() / 1000),
    },
  });
  return cdp;
}

export async function shot(page: Page, name: string) {
  await page.screenshot({ path: fileURLToPath(new URL(`${name}.png`, shotsDir)), fullPage: true });
}
