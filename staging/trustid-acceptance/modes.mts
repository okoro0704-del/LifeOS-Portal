/**
 * Browser checks of auth modes and TrustID outage (disposable staging).
 * usage: node --import tsx modes.mts <canary-outage|required>
 */
import { readFileSync, writeFileSync } from "node:fs";
import { HOSTS, S, check, deviceContext, launch, results, shot } from "./browser-lib.mts";

const phase = process.argv[2]!;
const env = Object.fromEntries(readFileSync(new URL("./portal.env", S), "utf8").split(/\r?\n/).filter(Boolean).map((l) => [l.slice(0, l.indexOf("=")), l.slice(l.indexOf("=") + 1)]));
const browser = await launch();
try {
  const ctx = await deviceContext(browser, "TD-STG-OWNER");
  const p = await ctx.newPage();
  await p.goto(`${HOSTS.admin}/login`, { waitUntil: "networkidle" });
  const password = p.locator('input[type="password"]');
  if (phase === "canary-outage") {
    const tid = p.getByRole("button", { name: "Continue with TrustID" });
    await tid.click();
    await p.waitForTimeout(4000);
    const meAfterTrustId = await p.evaluate(async () => (await fetch("https://admin.getlifeos.app/api/auth/me", { credentials: "include" }).catch(() => ({ status: 0 }) as Response)).status).catch(() => -1);
    await shot(p, "20-canary-outage-trustid-attempt");
    check("[canary, TrustID down] TrustID sign-in does not produce a Portal session", meAfterTrustId !== 200, `url=${p.url().slice(0, 60)} me=${meAfterTrustId}`);
    await p.goto(`${HOSTS.admin}/login`, { waitUntil: "networkidle" });
    await p.locator('input[type="email"], input[name="email"]').first().fill(env.LOCAL_ADMIN_EMAIL!);
    await password.fill(env.LOCAL_ADMIN_PASSWORD!);
    await p.locator('button[type="submit"]').click();
    await p.waitForURL((u) => u.pathname.startsWith("/admin"), { timeout: 20_000 });
    await shot(p, "21-canary-outage-password-signin");
    check("[canary, TrustID down] password sign-in through the UI still works", true, p.url());
  } else {
    await shot(p, "22-required-login");
    check("[required] the admin login page offers no password form", !(await password.isVisible()));
    check("[required] TrustID is the only sign-in offered", await p.getByRole("button", { name: "Continue with TrustID" }).isVisible());
  }
} catch (err) {
  check(`[${phase}] run completed`, false, (err as Error).message.split("\n")[0]);
} finally {
  await browser.close();
  const failed = results.filter((r) => !r.ok).length;
  writeFileSync(new URL(`./results-browser-${phase}.json`, S), JSON.stringify({ at: new Date().toISOString(), passed: results.length - failed, failed, results }, null, 2));
  console.log(`${phase}: ${results.length - failed}/${results.length} passed`);
}
