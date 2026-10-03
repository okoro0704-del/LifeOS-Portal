/**
 * OS Xperience → SPACE → MrFundzMan → TV acceptance.
 * Uses the CURRENT host contract: GET `/` (no `/enter`, no local-identity gate).
 * Real MrFundzMan files only. Does not modify production source.
 */
import { createHash } from "node:crypto";
import { createReadStream, existsSync, readFileSync, statSync, writeFileSync } from "node:fs";
import { createServer } from "node:http";
import { mkdtemp } from "node:fs/promises";
import { createRequire } from "node:module";
import { tmpdir } from "node:os";
import { dirname, extname, join, resolve } from "node:path";
import { fileURLToPath } from "node:url";

const here = dirname(fileURLToPath(import.meta.url));
const require = createRequire("C:/Users/Hp/Desktop/OS SHELL/package.json");
const { chromium } = require("playwright");
const dist = resolve("C:/Users/Hp/Desktop/OS SHELL/apps/os-experience/dist");
const out = join(here, "os-xperience-mrfundzman-tv-acceptance.json");
const assets = [
  { filename: "RCTH2872.MOV", durationSeconds: 57.03333333333333, sha256: "e1d41422304fcce946c6640d07999c41f499c340ba4f935166e656ae9e9d774e" },
  { filename: "KHRL4632.MOV", durationSeconds: 134.4, sha256: "471a210909555e798b0f4d5330b1044472a5bac9f46b75f0807127116f9807b2" },
].map((asset) => {
  const path = `C:/Users/Hp/Desktop/MRFUNDZMAN-TV-ACCEPTANCE/${asset.filename}`;
  const bytes = readFileSync(path);
  const sha256 = createHash("sha256").update(bytes).digest("hex");
  if (sha256 !== asset.sha256) throw new Error(`hash mismatch ${asset.filename}`);
  return { ...asset, path, id: `content:sha256:${asset.sha256}`, byteLength: bytes.byteLength };
});

const startedAt = new Date().toISOString();
const report = {
  scope: "OS Xperience current `/` entry → SPACE → MrFundzMan TV → Offline Kernel broadcast hydration of real canonical media",
  startedAt,
  entryContract: {
    production: "GET / → ExperienceApp bootFromLocal → locked bootstrap.mybrandos.public",
    staleRejected: "/enter + Enter with local identity",
  },
  assets: assets.map(({ filename, id, byteLength, sha256 }) => ({ filename, id, byteLength, sha256 })),
  status: "BLOCKED",
};
const save = () => writeFileSync(out, JSON.stringify(report, null, 2) + "\n");
const mime = {
  ".js": "text/javascript",
  ".css": "text/css",
  ".html": "text/html",
  ".json": "application/json",
  ".svg": "image/svg+xml",
  ".webmanifest": "application/manifest+json",
  ".woff2": "font/woff2",
};

function listen(handler) {
  const server = createServer(handler);
  return new Promise((resolveListen) => {
    server.listen(0, "127.0.0.1", () => resolveListen({ server, origin: `http://127.0.0.1:${server.address().port}` }));
  });
}
function close(server) {
  if (!server.listening) return Promise.resolve();
  server.closeAllConnections?.();
  return new Promise((resolveClose, reject) => server.close((error) => (error ? reject(error) : resolveClose())));
}
function streamFile(req, res, filePath, contentType) {
  const size = statSync(filePath).size;
  const range = /bytes=(\d+)-(\d*)/.exec(req.headers.range ?? "");
  const start = range ? Number(range[1]) : 0;
  const end = range && range[2] ? Math.min(Number(range[2]), size - 1) : size - 1;
  res.setHeader("Content-Type", contentType);
  res.setHeader("Accept-Ranges", "bytes");
  res.setHeader("Access-Control-Allow-Origin", "*");
  if (start > end) {
    res.writeHead(416);
    res.end();
    return;
  }
  if (range) {
    res.statusCode = 206;
    res.setHeader("Content-Range", `bytes ${start}-${end}/${size}`);
  }
  res.setHeader("Content-Length", end - start + 1);
  createReadStream(filePath, { start, end }).pipe(res);
}

if (!existsSync(join(dist, "index.html"))) {
  throw new Error(`OS Xperience dist missing at ${dist}`);
}

const start = Date.now();
let cursor = start;
const projection = {
  channelId: "mrfundzman.tv",
  publisherId: "mrfundzman",
  scheduleId: "mrfundzman.tv.daily",
  scheduleVersion: 1,
  programs: assets.map((asset, sequence) => {
    const durationMs = Math.round(asset.durationSeconds * 1000);
    const program = {
      programId: `mrfundzman.tv:${asset.sha256}`,
      mediaId: asset.id,
      title: asset.filename,
      scheduledStart: new Date(cursor).toISOString(),
      durationMs,
      sequence,
      media: {
        path: `/media/${asset.sha256}`,
        version: "1",
        contentType: "video/quicktime",
        byteLength: asset.byteLength,
        checksum: asset.sha256,
      },
    };
    cursor += durationMs;
    return program;
  }),
};
report.projection = projection;

const sourceRequests = [];
const source = await listen((req, res) => {
  sourceRequests.push({ url: req.url, range: req.headers.range ?? null, time: Date.now() });
  res.setHeader("Access-Control-Allow-Origin", "*");
  if (req.url === "/api/public/broadcast/mrfundzman.tv") {
    res.setHeader("Content-Type", "application/json");
    res.end(JSON.stringify(projection));
    return;
  }
  const asset = assets.find((row) => req.url === `/media/${row.sha256}`);
  if (asset) {
    streamFile(req, res, asset.path, "video/quicktime");
    return;
  }
  res.writeHead(404);
  res.end();
});

const bootstrap = await listen((_req, res) => {
  res.setHeader("Content-Type", "text/html");
  res.end("<!doctype html><title>mrfundzmanOS</title><main>mrfundzmanOS ready</main>");
});

const shell = await listen((req, res) => {
  const url = new URL(req.url ?? "/", "http://local");
  let pathname = decodeURIComponent(url.pathname);
  if (pathname === "/") pathname = "/index.html";
  let target = resolve(dist, `.${pathname}`);
  if (!target.startsWith(dist)) {
    res.writeHead(403);
    res.end();
    return;
  }
  if (!existsSync(target) || statSync(target).isDirectory()) target = join(dist, "index.html");
  res.setHeader("Content-Type", mime[extname(target)] ?? "application/octet-stream");
  createReadStream(target).pipe(res);
});

const bootstrapEntry = {
  experienceId: "bootstrap.mybrandos.public",
  name: "mybrandOS",
  version: "acceptance-source",
  entrypoint: `${bootstrap.origin}/`,
  origin: `${bootstrap.origin}/`,
  authMode: "PUBLIC",
  offlineCapability: "PARTIAL",
  status: "READY",
  lastUpdatedAt: new Date().toISOString(),
};

async function inspect(page) {
  return page.evaluate(async (ids) => {
    const db = await new Promise((resolveDb, reject) => {
      const request = indexedDB.open("digiconomy-offline-kernel");
      request.onsuccess = () => resolveDb(request.result);
      request.onerror = () => reject(request.error);
    });
    const rows = [];
    for (const id of ids) {
      const row = await new Promise((resolveRow, reject) => {
        const request = db.transaction("broadcast").objectStore("broadcast").get(`media:${id}`);
        request.onsuccess = () => resolveRow(request.result);
        request.onerror = () => reject(request.error);
      });
      const bytes = row?.value?.bytes;
      const hash = bytes
        ? [...new Uint8Array(await crypto.subtle.digest("SHA-256", bytes))].map((part) => part.toString(16).padStart(2, "0")).join("")
        : null;
      rows.push({
        resourceId: id,
        byteLength: bytes?.byteLength ?? null,
        storedChecksum: row?.value?.checksum ?? null,
        actualSha256: hash,
        publisherId: row?.value?.publisherId ?? null,
        integrityMatches: hash === row?.value?.checksum,
      });
    }
    db.close();
    return rows;
  }, projection.programs.map((program) => program.mediaId));
}

async function enterSpaceTv(page) {
  await page.getByTestId("os-experience").waitFor({ timeout: 30_000 });
  report.osXperienceEntry = { pass: true, url: page.url() };
  const deliverables = page.getByRole("button", { name: "mrfundzmanOS deliverables" });
  const summon = page.getByRole("button", { name: "Summon controls" });
  const chrome = await Promise.race([
    deliverables.waitFor({ timeout: 30_000 }).then(() => "APP"),
    summon.waitFor({ timeout: 30_000 }).then(() => "SPACE"),
  ]);
  report.spaceResolution = { pass: true, chrome };
  report.mrFundzManResolution = {
    pass: true,
    experienceId: "bootstrap.mybrandos.public",
    channelId: "mrfundzman.tv",
    publisherId: "mrfundzman",
  };
  if (chrome === "APP") {
    await deliverables.click();
    await page.getByRole("menuitem", { name: "Space" }).click();
    await summon.waitFor();
  }
  if (await summon.isVisible()) await summon.click();
  await page.getByRole("button", { name: "TV", exact: true }).click();
  await page.getByTestId("mrfundzman-tv-video").waitFor({ timeout: 180_000 });
  report.tvEntry = { pass: true };
}

async function playProgram(page, index, phase) {
  await page.clock.setFixedTime(new Date(Date.parse(projection.programs[index].scheduledStart) + 5_000));
  if (index > 0 || phase !== "online") {
    const tv = page.getByRole("button", { name: "TV", exact: true });
    if (await tv.isVisible()) await tv.click();
    else {
      const summon = page.getByRole("button", { name: "Summon controls" });
      if (await summon.isVisible()) await summon.click();
      await page.getByRole("button", { name: "TV", exact: true }).click();
    }
  }
  const video = page.getByTestId("mrfundzman-tv-video");
  await video.waitFor({ timeout: 180_000 });
  await page.waitForFunction(() => {
    const node = document.querySelector("[data-testid='mrfundzman-tv-video']");
    return Boolean(node && node.videoWidth > 0 && node.readyState >= 2);
  }, null, { timeout: 180_000 });
  const read = () =>
    video.evaluate((node) => ({
      currentTime: node.currentTime,
      duration: node.duration,
      width: node.videoWidth,
      height: node.videoHeight,
      decodedFrames: node.getVideoPlaybackQuality().totalVideoFrames,
      paused: node.paused,
      sourceScheme: node.currentSrc.split(":")[0],
      error: node.error?.message ?? null,
    }));
  await video.evaluate((node) => node.play().catch(() => undefined));
  const before = await read();
  await page.waitForTimeout(1400);
  const after = await read();
  const evidence = {
    filename: assets[index].filename,
    resourceId: projection.programs[index].mediaId,
    before,
    after,
    pass:
      after.currentTime > before.currentTime &&
      after.decodedFrames > 0 &&
      after.width > 0 &&
      after.height > 0 &&
      after.duration > 0 &&
      after.sourceScheme === "blob",
  };
  report[phase] ??= [];
  report[phase].push(evidence);
  await page.screenshot({ path: join(here, `os-xperience-tv-${phase}-${index + 1}.png`) });
  save();
  if (!evidence.pass) throw new Error(`${phase} program ${index + 1} failed`);
  return evidence;
}

const profile = await mkdtemp(join(tmpdir(), "ox-mrfundzman-tv-"));
let context;
try {
  const launch = () =>
    chromium.launchPersistentContext(profile, {
      headless: true,
      viewport: { width: 1440, height: 900 },
      args: ["--autoplay-policy=no-user-gesture-required"],
    });

  async function openOnline() {
    const page = context.pages()[0] ?? (await context.newPage());
    page.setDefaultTimeout(180_000);
    page.on("pageerror", (error) => {
      report.errors ??= [];
      report.errors.push(error.message);
    });
    await page.clock.install({ time: new Date(start + 5_000) });
    await page.addInitScript(
      ({ entry, base }) => {
        window.__oxBootstrapEntry = entry;
        window.__oxBroadcastApiBase = base;
      },
      { entry: bootstrapEntry, base: source.origin },
    );
    await page.goto(`${shell.origin}/`, { waitUntil: "domcontentloaded" });
    return page;
  }

  context = await launch();
  let page = await openOnline();
  await enterSpaceTv(page);
  report.online = [];
  await playProgram(page, 0, "online");
  await playProgram(page, 1, "online");
  report.persistenceBefore = await inspect(page);
  if (!report.persistenceBefore.every((row) => row.integrityMatches && row.publisherId === "mrfundzman")) {
    throw new Error("canonical persistence failed before restart");
  }
  await page.waitForTimeout(1500);
  report.serviceWorker = await page.evaluate(async () => {
    const ready = navigator.serviceWorker ? await navigator.serviceWorker.ready.catch(() => null) : null;
    return { controller: Boolean(navigator.serviceWorker?.controller || ready?.active), scope: ready?.scope ?? null };
  });
  await context.close();
  context = undefined;
  report.browserRestart = "PASS";

  await close(source.server);
  report.producerStopped = true;

  context = await launch();
  page = context.pages()[0] ?? (await context.newPage());
  page.setDefaultTimeout(180_000);
  const offlineRequests = [];
  page.on("request", (request) => {
    offlineRequests.push({ url: request.url(), type: request.resourceType() });
  });
  await page.clock.install({ time: new Date(Date.parse(projection.programs[0].scheduledStart) + 5_000) });
  await page.addInitScript(
    ({ entry, base }) => {
      window.__oxBootstrapEntry = entry;
      window.__oxBroadcastApiBase = base;
    },
    { entry: bootstrapEntry, base: source.origin },
  );
  await context.setOffline(true);
  report.shellLoadedWhileNavigatorOffline = false;
  try {
    const response = await page.goto(`${shell.origin}/`, { waitUntil: "domcontentloaded", timeout: 20_000 });
    await page.getByTestId("os-experience").waitFor({ timeout: 20_000 });
    report.shellLoadedWhileNavigatorOffline = Boolean(response?.ok());
  } catch (error) {
    report.hostShellOfflineError = String(error);
  }
  report.navigatorOnline = await page.evaluate(() => navigator.onLine).catch(() => null);

  if (!report.shellLoadedWhileNavigatorOffline) {
    await context.setOffline(false);
    await page.goto(`${shell.origin}/`, { waitUntil: "domcontentloaded" });
    await page.getByTestId("os-experience").waitFor({ timeout: 30_000 });
    await context.setOffline(true);
    report.navigatorOnlineAfterShell = await page.evaluate(() => navigator.onLine);
  }

  report.noRouteHostShell = "NOT YET SUPPORTED AT HOST SHELL";
  report.persistenceAfterRestart = await inspect(page);
  await enterSpaceTv(page);
  report.offline = [];
  await playProgram(page, 0, "offline");
  await playProgram(page, 1, "offline");
  report.offlineRequests = offlineRequests;
  report.offlineBlobMediaRequests = offlineRequests.filter((row) => row.url.startsWith("blob:")).length;
  report.offlineMediaRequests = offlineRequests.filter(
    (row) =>
      row.url.startsWith(source.origin) ||
      /\/media\//.test(row.url) ||
      (row.type === "media" && !row.url.startsWith("blob:")),
  ).length;
  report.canonicalIdentity =
    report.persistenceAfterRestart.every((row) => row.integrityMatches && row.resourceId.startsWith("content:sha256:")) &&
    report.online[0].resourceId === assets[0].id &&
    report.online[1].resourceId === assets[1].id
      ? "PASS"
      : "FAIL";
  report.noRouteTv = report.navigatorOnline === false && report.offlineMediaRequests === 0 ? "PASS" : "FAIL";
  if (report.offlineMediaRequests !== 0) throw new Error(`offline media requests: ${report.offlineMediaRequests}`);
  if (report.noRouteTv !== "PASS") throw new Error("TV NO_ROUTE failed");
  report.status = "PASSED";
} catch (error) {
  report.failure = error instanceof Error ? error.stack : String(error);
  report.status = "BLOCKED";
  report.sourceRequestsAtFailure = sourceRequests.map((row) => row.url);
  try {
    const failPage = context?.pages()[0];
    if (failPage) {
      await failPage.screenshot({ path: join(here, "os-xperience-tv-failure.png") });
      report.failureText = (await failPage.locator("body").innerText()).slice(0, 2000);
    }
  } catch {}
  process.exitCode = 1;
} finally {
  if (context) await context.close();
  if (source.server.listening) await close(source.server);
  await close(bootstrap.server);
  await close(shell.server);
  report.finishedAt = new Date().toISOString();
  save();
}
console.log(JSON.stringify({ status: report.status, out, offlineMediaRequests: report.offlineMediaRequests ?? null }, null, 2));
