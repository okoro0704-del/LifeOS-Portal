/**
 * APP PRESENTATION RESTORATION V1 — real browser acceptance (LifeOS + mybrandOS).
 * Requires local dev servers:
 *   LifeOS web  http://127.0.0.1:5174 (VITE_AUTH_BYPASS=true) + lifeos-api :8790 (LIFEOS_AUTH_BYPASS=true)
 *   mybrandOS   http://127.0.0.1:5176 + api :8793 (public brand `mrfundzman`)
 * Does not modify product source. Writes JSON + screenshots into docs/.
 */
import { writeFileSync } from "node:fs";
import { createRequire } from "node:module";
import { dirname, join } from "node:path";
import { fileURLToPath } from "node:url";

const here = dirname(fileURLToPath(import.meta.url));
const require = createRequire("C:/Users/Hp/Desktop/OS SHELL/package.json");
const { chromium } = require("playwright");

const LIFEOS = process.env.LIFEOS_URL ?? "http://127.0.0.1:5174";
const MYBRAND = process.env.MYBRAND_URL ?? "http://127.0.0.1:5176";
const SLUG = process.env.MYBRAND_SLUG ?? "mrfundzman";
const out = join(here, "app-presentation-browser.json");
const shot = (name) => join(here, `app-presentation-${name}.png`);

const report = { startedAt: new Date().toISOString(), lifeos: {}, mybrandos: {}, devices: {}, checks: [], errors: [] };
const check = (area, name, pass, detail = null) => {
  report.checks.push({ area, name, pass: Boolean(pass), detail });
  console.log(`${pass ? "PASS" : "FAIL"} [${area}] ${name}${detail ? ` — ${typeof detail === "string" ? detail : JSON.stringify(detail)}` : ""}`);
};
const save = () => writeFileSync(out, JSON.stringify(report, null, 2) + "\n");
const settle = (page, ms = 900) => page.waitForTimeout(ms);

async function lifeosState(page) {
  return page.evaluate(() => {
    const q = (s) => document.querySelector(s);
    const main = q("main");
    return {
      path: location.pathname,
      experienceModes: [...document.querySelectorAll("[data-experience-mode]")].map((n) => n.getAttribute("data-experience-mode")),
      surface: q("[data-lifeos-surface]")?.getAttribute("data-lifeos-surface") ?? null,
      spaceEntry: Boolean(q("[data-space-entry='true']")),
      appModeButton: [...document.querySelectorAll("button")].some((b) => b.textContent?.trim() === "App mode"),
      cmdNav: Boolean(q(".lifeos-cmd-nav, .lifeos-cmd-nav__edge")),
      surfaceSwitcher: Boolean(q("[data-ghost-remote], .lifeos-surface-switcher")),
      tvSurface: Boolean(q(".lifeos-surface--tv")),
      spaceSurfaces: document.querySelectorAll(".lifeos-surface").length,
      commandOverlay: Boolean(q(".command-overlay")),
      mainHidden: main?.getAttribute("aria-hidden") === "true",
      mainSuspended: Boolean(q(".content--surface-suspended")),
      mainTextSample: (main?.innerText ?? "").replace(/\s+/g, " ").slice(0, 240),
      buttons: [...document.querySelectorAll("button, a[role='button']")]
        .map((b) => (b.getAttribute("aria-label") || b.textContent || "").trim())
        .filter(Boolean)
        .slice(0, 60),
      links: [...document.querySelectorAll("a[href]")].map((a) => a.getAttribute("href")).slice(0, 60),
      notFound: /not found/i.test(main?.innerText ?? ""),
    };
  });
}

async function mybrandState(page) {
  return page.evaluate(() => {
    const q = (s) => document.querySelector(s);
    return {
      path: location.pathname,
      experienceModes: [...document.querySelectorAll("[data-experience-mode]")].map((n) => n.getAttribute("data-experience-mode")),
      identityHud: Boolean(q(".os-identity-hud[data-ui-mode='app']")),
      topBar: Boolean(q(".os-top-bar, .os-topbar, [data-os-topbar], .os-identity-hud .os-wordmark")),
      bottomNav: Boolean(q(".os-bottom-nav")),
      bottomNavLabels: [...document.querySelectorAll(".os-bottom-nav a, .os-bottom-nav button")].map((n) => n.textContent?.trim()),
      appSurfaceNav: [...document.querySelectorAll(".app-surface-nav [data-app-surface]")].map((n) => ({
        target: n.getAttribute("data-app-surface"),
        current: n.getAttribute("aria-current"),
      })),
      spaceEntry: Boolean(q("[data-space-entry='true']")),
      edgeNav: Boolean(q(".home-edge-nav, [data-home-edge-nav], .edge-nav")),
      spaceControls: [...document.querySelectorAll("button")].some((b) => /Summon controls|App mode/.test(b.textContent ?? b.getAttribute("aria-label") ?? "")),
      activeSurface: q("[data-active-surface]")?.getAttribute("data-active-surface") ?? q("[data-creator-surface]")?.getAttribute("data-creator-surface") ?? null,
      videos: document.querySelectorAll("video").length,
      images: document.querySelectorAll("img").length,
      textSample: (document.body.innerText ?? "").replace(/\s+/g, " ").slice(0, 300),
      buttons: [...document.querySelectorAll("button")]
        .map((b) => (b.getAttribute("aria-label") || b.textContent || "").trim())
        .filter(Boolean)
        .slice(0, 60),
    };
  });
}

/**
 * Local lifeos-api cannot start a DB session (DATABASE_URL is `file:` against a postgresql schema),
 * so only identity endpoints are answered here. Every other API call returns 503 so pages exercise
 * their real degraded paths instead of fabricated content.
 */
const mockUser = {
  id: "acceptance-user",
  trustId: "trust:acceptance",
  displayName: "Acceptance Tester",
  preferences: {
    notificationsEnabled: true,
    marketingTips: false,
    theme: "system",
    language: "en",
    tokenDisplay: "TOK",
    openExperiencesIn: "embed",
    quickAccess: { pinned: [], hidden: [], order: [] },
    avatarUrl: null,
    biometricLockEnabled: false,
    notifyDesktop: true,
    notifyMobilePush: true,
    notifyInApp: true,
    notifyBusinessWhilePersonal: false,
  },
  createdAt: new Date().toISOString(),
  lastLoginAt: new Date().toISOString(),
};
report.lifeos.apiMock = { mocked: ["/auth/dev-session", "/auth/status", "/me"], unavailable: {} };
async function installLifeosApiMock(ctx) {
  await ctx.route(`${LIFEOS}/api/**`, async (route) => {
    const path = new URL(route.request().url()).pathname.replace(/^\/api/, "");
    const json = (body, status = 200) => route.fulfill({ status, contentType: "application/json", body: JSON.stringify(body) });
    if (path === "/auth/dev-session") {
      return json({ user: mockUser, sessionToken: "acceptance-session", expiresAt: new Date(Date.now() + 3_600_000).toISOString(), bypass: true });
    }
    if (path === "/auth/status") return json({ status: "authenticated", authenticated: true });
    if (path === "/me") return json({ user: mockUser, trustIdConnected: true, authBypass: true });
    const key = path.replace(/\/[0-9a-f-]{8,}/gi, "/:id");
    report.lifeos.apiMock.unavailable[key] = (report.lifeos.apiMock.unavailable[key] ?? 0) + 1;
    return json({ error: "unavailable_in_acceptance", message: "API unavailable in acceptance harness" }, 503);
  });
}

const browser = await chromium.launch({ headless: true, args: ["--autoplay-policy=no-user-gesture-required"] });
try {
  // ---------------- LifeOS ----------------
  const lctx = await browser.newContext({ viewport: { width: 1440, height: 900 } });
  await installLifeosApiMock(lctx);
  const lp = await lctx.newPage();
  lp.setDefaultTimeout(45_000);
  lp.on("pageerror", (e) => report.errors.push({ app: "lifeos", message: e.message }));
  await lp.goto(`${LIFEOS}/login`, { waitUntil: "domcontentloaded" });
  await settle(lp, 1500);
  const bypass = lp.getByRole("button", { name: /Enter LifeOS \(bypass\)/i });
  if (await bypass.count()) {
    await bypass.click();
    await lp.waitForURL(/\/app/, { timeout: 60_000 });
  }
  check("lifeos", "authenticated via dev bypass", lp.url().includes("/app"), lp.url());

  const lifeRoutes = [
    "/app/personal/post",
    "/app/personal/reels",
    "/app/personal/products",
    "/app/personal/communities",
    "/app/personal/search",
    "/app/personal/streamify",
    "/app/personal/offline/post",
    "/app/personal/offline/reels",
  ];
  report.lifeos.routes = {};
  for (const route of lifeRoutes) {
    await lp.goto(`${LIFEOS}${route}`, { waitUntil: "domcontentloaded" });
    await settle(lp, 1800);
    const state = await lifeosState(lp);
    report.lifeos.routes[route] = state;
    const name = route.replace(/^\/app\/personal\//, "").replace(/\//g, "-");
    await lp.screenshot({ path: shot(`lifeos-app-${name}`) });
    check(
      "lifeos",
      `APP route ${route}`,
      state.experienceModes.every((m) => m === "APP") && !state.mainHidden && !state.mainSuspended && !state.notFound && !state.surfaceSwitcher && state.spaceSurfaces === 0,
      { path: state.path, modes: state.experienceModes, surface: state.surface, hidden: state.mainHidden, suspended: state.mainSuspended, spaceSurfaces: state.spaceSurfaces },
    );
  }

  // Space toggle side-by-side
  await lp.goto(`${LIFEOS}/app/personal/post`, { waitUntil: "domcontentloaded" });
  await settle(lp, 1800);
  report.lifeos.appBefore = await lifeosState(lp);
  await lp.screenshot({ path: shot("lifeos-side-app") });
  const lifeSpaceEntry = lp.locator("[data-space-entry='true']");
  check("lifeos", "Space mode entry visible in APP", await lifeSpaceEntry.isVisible().catch(() => false));
  if (await lifeSpaceEntry.isVisible().catch(() => false)) {
    await lifeSpaceEntry.click();
    await settle(lp, 1500);
    report.lifeos.space = await lifeosState(lp);
    await lp.screenshot({ path: shot("lifeos-side-space") });
    const ls = report.lifeos.space;
    check(
      "lifeos",
      "SPACE mounts Space presentation (shell + surfaces)",
      ls.experienceModes.length > 0 && ls.experienceModes.every((m) => m === "SPACE") && ls.surfaceSwitcher && ls.spaceSurfaces > 0,
      { modes: ls.experienceModes, switcher: ls.surfaceSwitcher, surfaces: ls.spaceSurfaces, tv: ls.tvSurface },
    );
    const appMode = lp.getByRole("button", { name: "App mode", exact: true });
    if (!(await appMode.isVisible().catch(() => false))) {
      await lp.getByRole("button", { name: "Reveal Space handle" }).dispatchEvent("click");
      await settle(lp, 400);
      await lp.getByRole("button", { name: "Open Space controls" }).dispatchEvent("click");
      await settle(lp, 600);
    }
    await lp.screenshot({ path: shot("lifeos-space-controls") });
    await appMode.click();
    await settle(lp, 1500);
    report.lifeos.appAfter = await lifeosState(lp);
    const la = report.lifeos.appAfter;
    check("lifeos", "return to APP restores normal presentation", la.experienceModes.every((m) => m === "APP") && !la.mainHidden && !la.surfaceSwitcher && la.spaceSurfaces === 0, {
      modes: la.experienceModes,
      switcher: la.surfaceSwitcher,
      surfaces: la.spaceSurfaces,
    });
  }

  // ---------------- mybrandOS ----------------
  const mctx = await browser.newContext({ viewport: { width: 1440, height: 900 } });
  const mp = await mctx.newPage();
  mp.setDefaultTimeout(45_000);
  mp.on("pageerror", (e) => report.errors.push({ app: "mybrandos", message: e.message }));
  await mp.goto(`${MYBRAND}/u/${SLUG}`, { waitUntil: "domcontentloaded" });
  await mp.locator("[data-experience-mode]").first().waitFor();
  await settle(mp, 2000);
  report.mybrandos.app = await mybrandState(mp);
  await mp.screenshot({ path: shot("mybrandos-side-app") });
  const ms = report.mybrandos.app;
  check("mybrandos", "APP default presentation", ms.experienceModes.includes("APP") && !ms.experienceModes.includes("SPACE"), ms.experienceModes);
  check("mybrandos", "creator identity hud + top bar", ms.identityHud, { hud: ms.identityHud, topBar: ms.topBar });
  check("mybrandos", "bottom navigation", ms.bottomNav, ms.bottomNavLabels);
  check("mybrandos", "app surface nav (Home/Digipedia/DigiNews/TV/RADIO)", ms.appSurfaceNav.length === 5, ms.appSurfaceNav);
  check("mybrandos", "Space-only edge launchers absent in APP", !ms.edgeNav);

  report.mybrandos.surfaces = {};
  for (const target of ["TV", "RADIO", "DIGIPEDIA", "NEWS", "APP"]) {
    const btn = mp.locator(`.app-surface-nav [data-app-surface='${target}']`);
    if (!(await btn.count())) {
      check("mybrandos", `surface ${target}`, false, "button missing");
      continue;
    }
    await btn.click();
    await settle(mp, 1500);
    const state = await mybrandState(mp);
    report.mybrandos.surfaces[target] = state;
    await mp.screenshot({ path: shot(`mybrandos-app-${target.toLowerCase()}`) });
    const current = state.appSurfaceNav.find((row) => row.target === target)?.current;
    check("mybrandos", `surface ${target} launches in APP`, current === "page" || current === "true", {
      current,
      modes: state.experienceModes,
      bottomNav: state.bottomNav,
      path: state.path,
    });
  }

  // Bottom nav destinations
  report.mybrandos.bottomNav = {};
  for (const label of ["Spotlight", "Live", "Contacts", "Communities", "Home"]) {
    const link = mp.locator(".os-bottom-nav").getByText(label, { exact: true }).first();
    if (!(await link.count())) {
      check("mybrandos", `bottom nav ${label}`, false, "missing");
      continue;
    }
    await link.click();
    await settle(mp, 1400);
    const state = await mybrandState(mp);
    report.mybrandos.bottomNav[label] = { path: state.path, modes: state.experienceModes };
    await mp.screenshot({ path: shot(`mybrandos-app-nav-${label.toLowerCase()}`) });
    check("mybrandos", `bottom nav ${label}`, state.experienceModes.includes("APP") && state.bottomNav, state.path);
  }

  // SPACE side-by-side
  await mp.goto(`${MYBRAND}/u/${SLUG}`, { waitUntil: "domcontentloaded" });
  await mp.locator("[data-space-entry='true']").waitFor();
  await mp.locator("[data-space-entry='true']").click();
  await settle(mp, 1500);
  report.mybrandos.space = await mybrandState(mp);
  await mp.screenshot({ path: shot("mybrandos-side-space") });
  const sp = report.mybrandos.space;
  check("mybrandos", "SPACE presentation: edge launchers, no APP chrome", sp.experienceModes.includes("SPACE") && !sp.bottomNav && sp.appSurfaceNav.length === 0, {
    modes: sp.experienceModes,
    edgeNav: sp.edgeNav,
    bottomNav: sp.bottomNav,
  });
  const mAppMode = mp.getByRole("button", { name: "App mode", exact: true });
  if (!(await mAppMode.isVisible().catch(() => false))) {
    await mp.getByRole("button", { name: "Reveal Space handle" }).dispatchEvent("click");
    await settle(mp, 400);
    await mp.getByRole("button", { name: "Open Space controls" }).dispatchEvent("click");
    await settle(mp, 600);
  }
  await mp.screenshot({ path: shot("mybrandos-space-controls") });
  if (await mAppMode.isVisible().catch(() => false)) {
    await mAppMode.click();
    await settle(mp, 1200);
    const back = await mybrandState(mp);
    report.mybrandos.appAfter = back;
    check("mybrandos", "return to APP restores chrome", back.experienceModes.includes("APP") && back.bottomNav && back.appSurfaceNav.length === 5, back.experienceModes);
  } else {
    check("mybrandos", "return to APP restores chrome", false, "App mode control not reachable");
  }

  // ---------------- Device presentation (presentation only) ----------------
  const devices = [
    { name: "phone", width: 390, height: 844, isMobile: true, hasTouch: true },
    { name: "tablet", width: 820, height: 1180, isMobile: true, hasTouch: true },
    { name: "laptop", width: 1440, height: 900 },
    { name: "tv", width: 1920, height: 1080 },
  ];
  for (const device of devices) {
    const ctx = await browser.newContext({ viewport: { width: device.width, height: device.height }, isMobile: device.isMobile, hasTouch: device.hasTouch });
    const page = await ctx.newPage();
    page.setDefaultTimeout(45_000);
    await page.goto(`${MYBRAND}/u/${SLUG}`, { waitUntil: "domcontentloaded" });
    await page.locator("[data-experience-mode]").first().waitFor();
    await settle(page, 1800);
    const state = await mybrandState(page);
    const presentation = await page.evaluate(() => [...document.querySelectorAll("[data-presentation]")].map((n) => n.getAttribute("data-presentation")));
    await page.screenshot({ path: shot(`device-mybrandos-${device.name}`) });
    const lctx2 = await browser.newContext({ viewport: { width: device.width, height: device.height }, isMobile: device.isMobile, hasTouch: device.hasTouch, storageState: await lctx.storageState() });
    await installLifeosApiMock(lctx2);
    const lpage = await lctx2.newPage();
    lpage.setDefaultTimeout(45_000);
    await lpage.goto(`${LIFEOS}/app/personal/post`, { waitUntil: "domcontentloaded" });
    await settle(lpage, 1800);
    const lstate = await lifeosState(lpage);
    await lpage.screenshot({ path: shot(`device-lifeos-${device.name}`) });
    report.devices[device.name] = {
      viewport: `${device.width}x${device.height}`,
      mybrandos: { modes: state.experienceModes, presentation, bottomNav: state.bottomNav },
      lifeos: { modes: lstate.experienceModes, path: lstate.path },
    };
    check(
      "devices",
      `${device.name} stays APP (screen size is not execution context)`,
      state.experienceModes.every((m) => m === "APP") && lstate.experienceModes.every((m) => m === "APP"),
      report.devices[device.name],
    );
    await ctx.close();
    await lctx2.close();
  }
} catch (error) {
  report.failure = error instanceof Error ? error.stack : String(error);
} finally {
  await browser.close();
  report.finishedAt = new Date().toISOString();
  report.summary = {
    total: report.checks.length,
    pass: report.checks.filter((c) => c.pass).length,
    fail: report.checks.filter((c) => !c.pass).length,
  };
  report.status = !report.failure && report.summary.fail === 0 ? "PASSED" : "BLOCKED";
  save();
  console.log(JSON.stringify({ status: report.status, summary: report.summary, failure: report.failure ?? null, pageErrors: report.errors.length }, null, 2));
  if (report.status !== "PASSED") process.exitCode = 1;
}
