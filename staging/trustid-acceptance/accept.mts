/**
 * Real-browser staging acceptance (headless Chromium, disposable stack, test identities only).
 * Profiles: M = owner's Master Device (TrustID Trust Center), L = owner's admin laptop,
 * U = an ordinary test user, L2 = a second admin browser. Writes results-browser.json + shots/.
 */
import { readFileSync, writeFileSync } from "node:fs";
import type { Page } from "playwright";
import { HOSTS, S, TRUSTID_WEB, attachPasskey, check, deviceContext, launch, offHostRequests, offHostResponses, results, seed, shot } from "./browser-lib.mts";

const OWNER = "TD-STG-OWNER";
const USER = "TD-STG-USER";
const browser = await launch();
const errors: string[] = [];
const watch = (page: Page, tag: string) => page.on("pageerror", (e) => errors.push(`${tag}: ${e.message.slice(0, 160)}`));

async function trustIdSignIn(page: Page, host: string) {
  await page.goto(`${host}/login`, { waitUntil: "networkidle" });
  await page.getByRole("button", { name: /^(Continue|Sign in) with TrustID$/ }).first().click();
  await page.waitForURL((u) => u.origin === host && !/\/(login|callback)/.test(u.pathname), { timeout: 30_000 });
  await page.waitForLoadState("networkidle");
  return page.evaluate(async () => {
    const r = await fetch("/api/auth/me", { credentials: "include" });
    return { status: r.status, body: (await r.json().catch(() => ({}))) as { user?: { trustId?: string; role?: string } } };
  });
}

try {
  /* ---- M: Master Device enrollment in the Trust Center ---- */
  const M = await deviceContext(browser, OWNER, { phone: true });
  const m = await M.newPage();
  watch(m, "trust-center");
  await attachPasskey(M, m, OWNER);
  await m.goto(`${TRUSTID_WEB}/dashboard/master-device`, { waitUntil: "networkidle" });
  await shot(m, "01-trust-center-not-enrolled");
  await m.getByRole("button", { name: "Make this device my Master Device" }).click();
  await m.getByText("This device is your Master Device.").first().waitFor({ timeout: 30_000 });
  await shot(m, "02-trust-center-enrolled");
  check("Trust Center: enrolls this browser profile as Master Device (passkey via virtual authenticator)", true);
  const keyExtractable = await m.evaluate(async () => {
    const db = await new Promise<IDBDatabase>((res, rej) => { const r = indexedDB.open("trustid-master-device", 1); r.onsuccess = () => res(r.result); r.onerror = () => rej(r.error); });
    const rec = await new Promise<{ privateKey: CryptoKey } | undefined>((res) => { const g = db.transaction("keys").objectStore("keys").get("current"); g.onsuccess = () => res(g.result); });
    return rec ? rec.privateKey.extractable : "missing";
  });
  check("Trust Center: the stored device private key is non-extractable", keyExtractable === false, `extractable=${keyExtractable}`);

  /* ---- U: ordinary user signs in on the guest portal and business portal ---- */
  const U = await deviceContext(browser, USER);
  for (const [name, host] of [["guest portal", HOSTS.portal], ["business portal", HOSTS.business]] as const) {
    const p = await U.newPage();
    watch(p, name);
    const me = await trustIdSignIn(p, host);
    await shot(p, `03-${name.replace(" ", "-")}-signed-in`);
    check(`${name}: TrustID sign-in in the browser (OAuth+PKCE+nonce, id_token verified by Portal)`, me.status === 200 && me.body.user?.trustId === USER, `status=${me.status} role=${me.body.user?.role}`);
    await p.close();
  }

  /* ---- L: owner signs in to Platform Admin ---- */
  const L = await deviceContext(browser, OWNER, { second: true });
  const l = await L.newPage();
  watch(l, "admin");
  await l.goto(`${HOSTS.admin}/login`, { waitUntil: "networkidle" });
  const passwordFormVisible = await l.locator('input[type="password"]').isVisible();
  await shot(l, "04-admin-login-canary");
  check("Platform Admin (canary): password sign-in stays available next to TrustID", passwordFormVisible);
  const adminMe = await trustIdSignIn(l, HOSTS.admin);
  check("Platform Admin: TrustID sign-in lands as Portal ADMIN (Portal-owned role)", adminMe.body.user?.role === "ADMIN", `role=${adminMe.body.user?.role}`);
  await l.goto(`${HOSTS.admin}/admin/tenants`, { waitUntil: "networkidle" });
  check("Platform Admin: admin read (tenants) without any approval prompt", !(await l.getByText("Approval needed").isVisible()));
  await shot(l, "05-admin-tenants-read");

  /* ---- protected write approved on the Master Device ---- */
  let lastStepUpHeader: string | undefined;
  let lastWriteUrl: string | undefined;
  l.on("request", (req) => {
    const h = req.headers()["x-trustid-step-up"];
    if (h) {
      lastStepUpHeader = h;
      lastWriteUrl = req.url();
    }
  });
  await l.goto(`${HOSTS.admin}/admin/accounts`, { waitUntil: "networkidle" });
  const userRow = l.locator("tr", { has: l.locator("td", { hasText: /^USER$/ }) }).first();
  await userRow.getByRole("button", { name: "Suspend" }).click();
  await l.getByText("Approval needed").waitFor({ timeout: 15_000 });
  const promptAction = (await l.locator("[role=status] .mono").first().innerText()).trim();
  await shot(l, "06-admin-approval-needed");
  check("Platform Admin: the write pauses with an 'Approval needed' prompt naming the action", /^portal\.post\.v1\.admin\.users\..+\.suspend$/.test(promptAction), promptAction);

  await m.reload({ waitUntil: "networkidle" });
  await m.getByText("LifeOS Platform Admin").first().waitFor({ timeout: 15_000 });
  const listed = await m.locator("li.row", { hasText: promptAction }).count();
  await shot(m, "07-trust-center-pending-request");
  check("Trust Center: shows the pending request with the requesting app and exact action", listed === 1, `rows=${listed}`);
  const onScreen = await m.evaluate(() => {
    const vw = document.documentElement.clientWidth;
    const buttons = [...document.querySelectorAll("li.row button")].map((b) => b.getBoundingClientRect());
    return { vw, scrollW: document.documentElement.scrollWidth, ok: buttons.length >= 2 && buttons.every((r) => r.left >= 0 && r.right <= vw + 1) };
  });
  check("Trust Center (phone 390px): Approve and Deny are fully on-screen, no horizontal overflow", onScreen.ok && onScreen.scrollW <= onScreen.vw + 1, `viewport=${onScreen.vw} scrollWidth=${onScreen.scrollW}`);
  await m.locator("li.row", { hasText: promptAction }).getByRole("button", { name: "Approve" }).click();
  await m.getByText("Approved with this Master Device.").waitFor({ timeout: 15_000 });
  await l.locator("tr", { has: l.locator("td", { hasText: /^USER$/ }) }).first().getByText("Suspended").waitFor({ timeout: 30_000 });
  await shot(l, "08-admin-write-completed");
  check("Platform Admin: after device approval the write completes (user suspended)", true);

  /* ---- replay and cross-session, from real browser sessions ---- */
  const replay = await l.evaluate(async ({ url, id }) => {
    const r = await fetch(new URL(url).pathname.replace(/^/, ""), { method: "POST", credentials: "include", headers: { "content-type": "application/json", "x-trustid-step-up": id }, body: JSON.stringify({ suspended: true }) });
    return { status: r.status, body: await r.json() };
  }, { url: lastWriteUrl!, id: lastStepUpHeader! });
  check("Replay: re-sending the consumed approval is refused", replay.status === 403 && replay.body.error === "step_up_already_used", `status=${replay.status} error=${replay.body.error}`);
  const L2 = await deviceContext(browser, OWNER);
  const l2 = await L2.newPage();
  await trustIdSignIn(l2, HOSTS.admin);
  const cross = await l2.evaluate(async ({ url, id }) => {
    const r = await fetch(new URL(url).pathname, { method: "POST", credentials: "include", headers: { "content-type": "application/json", "x-trustid-step-up": id }, body: JSON.stringify({ suspended: true }) });
    return { status: r.status, body: await r.json() };
  }, { url: lastWriteUrl!, id: lastStepUpHeader! });
  check("Cross-session: another admin browser session cannot use that approval", cross.status === 403 && /step_up_(session_mismatch|already_used)/.test(cross.body.error), `error=${cross.body.error}`);

  /* ---- explicit denial ---- */
  await userRow.getByRole("button", { name: "Restore" }).click();
  await l.getByText("Approval needed").waitFor({ timeout: 15_000 });
  await m.reload({ waitUntil: "networkidle" });
  await m.locator("li.row").filter({ hasText: "LifeOS Platform Admin" }).first().getByRole("button", { name: "Deny" }).click();
  await m.getByText("Denied.").waitFor({ timeout: 15_000 });
  await l.getByText("The action was not approved on your Master Device.").waitFor({ timeout: 30_000 });
  const stillSuspended = await userRow.getByText("Suspended").isVisible();
  await shot(l, "09-admin-denied");
  check("Denial: the admin sees 'not approved' and nothing changes", stillSuspended);

  /* ---- clickjacking: the Trust Center page refuses to be framed ---- */
  await l.evaluate((src) => {
    const f = document.createElement("iframe");
    f.src = src;
    f.id = "framed-master-device";
    document.body.appendChild(f);
  }, `${TRUSTID_WEB}/dashboard/master-device`);
  await l.waitForTimeout(3000);
  const framed = l.frames().find((f) => f.url().includes("master-device") || f.url().startsWith("chrome-error"));
  const framedText = framed && !framed.url().startsWith("chrome-error") ? await framed.locator("body").innerText().catch(() => "") : "";
  check("Clickjacking: the Master Device page does not render its actions inside a frame", !/Approve|Make this device/.test(framedText), `frame=${framed?.url().slice(0, 40) ?? "none"}`);

  /* ---- expiry: let a request lapse unapproved ---- */
  if (process.env.SKIP_EXPIRY !== "1") {
    await l.goto(`${HOSTS.admin}/admin/accounts`, { waitUntil: "networkidle" });
    await l.locator("tr", { has: l.locator("td", { hasText: /^USER$/ }) }).first().getByRole("button", { name: "Restore" }).click();
    await l.getByText("Approval needed").waitFor({ timeout: 15_000 });
    await m.reload({ waitUntil: "networkidle" });
    await m.getByText(/expires in \d+s/).first().waitFor({ timeout: 15_000 });
    await m.waitForTimeout(125_000);
    const approveEnabled = await m.locator("li.row").filter({ hasText: "LifeOS Platform Admin" }).getByRole("button", { name: "Approve" }).first().isEnabled().catch(() => false);
    await shot(m, "10-trust-center-expired");
    await l.getByText("The action was not approved on your Master Device.").waitFor({ timeout: 30_000 });
    await shot(l, "11-admin-expired");
    check("Expiry: an unapproved request lapses; Approve is no longer possible and the admin sees failure", !approveEnabled);
  }

  const blockedHosts = [...new Set(offHostRequests.map((u) => new URL(u).hostname))];
  check("Isolation: no response from any non-staging host (off-host attempts blocked by the resolver)", offHostResponses.length === 0, `blocked attempts to: ${blockedHosts.join(", ") || "none"}`);
  check("No uncaught page errors in the tested flows", errors.length === 0, errors.slice(0, 3).join(" | "));
} catch (err) {
  check("browser run completed", false, (err as Error).message.split("\n")[0]);
} finally {
  await browser.close();
  const failed = results.filter((r) => !r.ok).length;
  writeFileSync(new URL("./results-browser.json", S), JSON.stringify({ at: new Date().toISOString(), passed: results.length - failed, failed, results, seedSubjects: Object.keys(seed.subjects) }, null, 2));
  console.log(`\nbrowser: ${results.length - failed}/${results.length} passed`);
  void readFileSync;
}
