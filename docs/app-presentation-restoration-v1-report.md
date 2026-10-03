# APP PRESENTATION RESTORATION V1 REPORT

Date: 2026-09-29. Nothing committed, pushed, or deployed.

## Historical states discovered

- Baseline HEADs: LIFEOS PORTAL `main` 1951bb5, LifeOS `master` 580d993, mybrandOS `main` ac543c3, OS SHELL `main` b78e5db.
- Pre-existing uncommitted work at baseline (not mine, left untouched): LifeOS `NavigationDockContext.tsx`, `tsconfig.tsbuildinfo`, TV bridge files; mybrandOS production-library API route/service/test; OS SHELL `automatic-kernel-hydration-web.test.ts`, `ox-update-manifest.json`, `ox-version-stamp.ts`.
- Root cause: the Space transformation made APP render Space presentation.
  - LifeOS: bare TV / Radio / Offline Hub surfaces and suspension of Living content were mounted regardless of experience mode. The `spaceMode` gates that did exist never fired: `AppShell` read `useSpacePresentation()` outside `NavigationDockGestures`, the component that provides it, so it always saw the default `APP`.
  - mybrandOS: APP used the Space-only edge launchers (`HomeEdgeNav`) instead of `DigitalLifeTopBar` / `DigitalLifeBottomNav`. The reveal-shell state was hard-coded to `CLEAN`, so bottom and top chrome were permanently off-screen with no pointer events.

## Restoration decision

- KEEP_CURRENT: all Space/TV infrastructure (DK1/DK2, MediaCapability, SavedMedia/SavedResource, canonical IDs, Space Runtime, Offline Kernel, Capability Bridge, Space Resolution, TV canonical bridge, OS Xperience Space path).
- RESTORE_PRESENTATION: existing APP chrome components, gated on explicit `experienceMode`. No revert, no historical directories, no new design.
- SPACE_ONLY: edge launchers, Space controls, bare broadcast surfaces, Offline Hub.

## Architecture boundary

- Presentation is not execution context. `experienceMode` (`APP` | `SPACE`) is the only switch. APP is the default; SPACE is entered explicitly with "Space mode" and left with "App mode".
- Screen size is not execution context. Device classes choose media presentation only.

## LifeOS restoration (`apps/lifeos-web`)

- `AppShell.tsx`:
  - Split into an `AppShell` wrapper and an `AppShellFrame` that renders inside `NavigationDockGestures`, so the frame reads the real presentation context.
  - Space surfaces, `SurfaceSwitcherBar` and Living suspension mount only in SPACE. `CommandOverlay`, `LifeOSWakeListener`, `ActiveKernelSignature` and `TransientAlertSurface` mount only in APP.
  - The command-navigation condition is unchanged from HEAD's effective behavior.
- `LifeOsCommandNavigation.tsx`: in APP, Streamify and the Offline kernel open as normal routes; in SPACE, they open TV and the Offline broadcast.
- `personalRoutes.tsx`: the `offline/post`, `reels`, `products`, `communities` and `search` routes render the real pages again.
- Tests updated: `personal-routes.test.ts` (now also guards the provider placement) and `living-space-surfaces.test.ts`.

## mybrandOS restoration (`apps/web`)

- `DigitalLifeShell.tsx`:
  - APP renders the identity HUD with `DigitalLifeTopBar` and `BrandLiveBadge`, the surface nav (Home / Digipedia / DigiNews / TV / RADIO via `space.launch`), `DigitalLifeBottomNav`, and a "Space mode" entry.
  - SPACE renders the wordmark, `HomeEdgeNav` and `SpaceControls`.
  - The reveal state is `NAVIGATION_VISIBLE` in APP and `CLEAN` in SPACE.
- `Chrome.tsx`: owner wordmark classes on the top bar.
- `styles.css`: added `.app-surface-nav`.
- Tests updated: `shell-restructure`, `creator-space-four-state`, `creator-space-router`, `experience-duality-v1`.

## Infrastructure preserved

No edits to OS SHELL, canonical/frozen packages, the TV canonical bridge, kernel contracts, entitlements or trust boundaries.

## LifeOS APP browser acceptance

`docs/verify-app-presentation-browser.mjs` → `docs/app-presentation-browser.json`: **33/33 checks pass overall, 0 page errors**.

- Real LifeOS web (Vite dev) in Chromium. The local lifeos-api cannot open a DB session (`DATABASE_URL` is `file:` against a postgresql schema), so the harness answers only `/auth/dev-session`, `/auth/status` and `/me`. Every other API call returns 503, and feeds show their real empty states.
- Routes `post`, `reels`, `products`, `communities`, `search`, `streamify`, `offline/post` and `offline/reels` all render in `APP`: main content is not hidden or suspended, and there are 0 Space surfaces and no surface switcher.
- The SPACE toggle mounts the switcher and 2 surfaces (TV included). Returning to APP removes them.
- Screenshots: `app-presentation-lifeos-app-*.png`, `-side-app.png`, `-side-space.png`, `-space-controls.png`.

## mybrandOS APP browser acceptance

- Real local API and database, public brand `/u/mrfundzman`.
- APP default: identity HUD and top bar, bottom nav (Home, Spotlight, Live, Contacts, Communities), 5 surface buttons, no edge launchers.
- TV, RADIO, DIGIPEDIA, NEWS and Home each launch in APP with `aria-current`, and the bottom nav stays present.
- Bottom nav reaches `/spotlight`, `/live`, `/contacts`, `/communities` and back home.
- SPACE shows edge launchers with no APP chrome. "App mode" restores the APP chrome.
- Screenshots: `app-presentation-mybrandos-*.png`.

## Device presentation

- Phone 390×844, tablet 820×1180, laptop 1440×900 and TV 1920×1080 all stay `APP` in both apps (`app-presentation-device-*.png`).
- The media-presentation mapping (`defaultMediaPresentation`: PHONE→FEED, TABLET→WATCH, DESKTOP→CINEMA, TV→TV) is covered by unit tests (`immersive-feed.test.ts`). It was not observed in the browser, because no playable media was available locally.

## Space non-regression

Run against the OS Xperience build that matched baseline source → `docs/app-presentation-space-nonregression.json`: **PASSED**.

- Video A (RCTH2872) and Video B (KHRL4632) played online and offline from `blob:`, with frames decoded and `currentTime` advancing.
- Browser restart passed. NO_ROUTE TV passed (`navigator.onLine=false`). 0 offline network media requests.
- Canonical IDs unchanged (`content:sha256:e1d4…`, `content:sha256:471a…`), with integrity matching in IndexedDB.
- The first attempt timed out waiting for the TV video; the immediate rerun passed.
- A rerun against the **current** OS SHELL build is BLOCKED (`app-presentation-space-nonregression-current-oxbuild.json`). Other in-progress work in OS SHELL (a "dual Xperience directory", files modified 2026-09-28 22:51 through 2026-09-29 08:19) replaced the entry UI. None of this task's changes touch OS SHELL.

## Protected integrity

- `app-presentation-protected-before.json` vs `-after.json`: 49/49 hashes identical.
- TV bridge files unchanged: `tvCanonicalMediaBridge.ts` 2162e2d3…, `tv-canonical-media-bridge.test.ts` eec3628b…, `tv-canonical-real-browser-harness.ts` e86f21f8….

## Tests

| Suite | Result |
| --- | --- |
| LifeOS web | 181/181 |
| mybrandOS | 510/510 (one earlier full-suite run had a load-timing flake in `digi-ai-publish` concurrent publish; it passes in isolation and in the full rerun) |
| offline-kernel | 14/14 |
| space-runtime | 1/1 |
| space-capability-bridge | 27/27 |
| space-resolution | 16/16 |
| xperience-ui | 80/80 |
| xperience-contract | 15/15 |

## TypeScript

LifeOS `tsc -b` exit 0; mybrandOS web `tsc -b` exit 0 (inside the build); OS Xperience `typecheck:xperience` exit 0.

## Builds

LifeOS web build OK; mybrandOS web build OK; OS Xperience build OK (baseline tree).

## Remaining issues

1. LifeOS APP media playback and interactions with real data were not browser-verified, because the local lifeos-api has no usable database.
2. mybrandOS local media renders "Unavailable", because the local public media assets aren't present, so APP media playback was not observed.
3. Space non-regression on the current OS SHELL tree is blocked by unrelated in-progress work there.
4. Pre-existing (unchanged from HEAD): on desktop, the LifeOS command dock overlaps the sidebar. LifeOS SPACE on the Living surface keeps the sidebar visible until TV or Radio is selected.

## Platform architecture (inspected, not assumed)

One shared web implementation. Native shells are Capacitor WebViews of that implementation. There is no LifeOSAndroidHome or LifeOSIOSHome.

| Product | Web | Android | iOS |
| --- | --- | --- | --- |
| LifeOS | `apps/lifeos-web` Vite app | Capacitor 6 project `apps/lifeos-web/android`, `appId` `com.lifeos.mobile`, `webDir` `dist` | Same app, `apps/lifeos-web/ios` |
| mybrandOS | `apps/web` Vite app. No Capacitor, Android, or iOS project | Reached only as a page inside another shell (OS Xperience iframe, or a browser/PWA) | Same. No native project to build |
| OS Xperience | `apps/os-experience` | Capacitor 7, `webDir` `dist`, no `server.url` (bundled assets, offline shell start) | Same project, `ios/App` |

LifeOS production shells set `server.url` to `https://lifeosapp.getlifeos.app` (`scripts/mobile-build.mjs` and both native `capacitor.config.json` files). `cleartext` is false. The WebView therefore shows the deployed site. The copied `dist` is the offline fallback, not what the release shell paints. Native-only code stays in adapters: `@capacitor/status-bar` (overlay), keyboard resize, haptics, push, Preferences (`src/lib/mobileBridge.ts`, `otaUpdate.ts`). `isAuthBypass()` is false when `import.meta.env.PROD` is true, including on a native shell.

mybrandOS inside OS Xperience is an iframe whose entrypoint is `https://mrfundzman.getlifeos.app/` (`packages/xperience-ui/src/local/bootstrap.ts`). APP/SPACE for that experience is declared once on that registry entry (`executionModes` APP and SPACE).

PHONE / TABLET / LAPTOP / TV remain presentation profiles. They are not Web / Android / iOS.

## Web change propagation

`npm run mobile:sync` (the current LifeOS process) rebuilt `dist` and copied it to both native trees. The same bundle `index-BTwSRFch.js` is in `dist`, `android/app/src/main/assets/public`, and `ios/App/App/public`. It contains `Space mode` and `data-space-entry`. Capacitor `server.url` stayed `https://lifeosapp.getlifeos.app`. iOS `pod install` was skipped (CocoaPods is not installed). `xcodebuild` is not on this machine.

| Capability | Web | Android asset copy | iOS asset copy | Shared source | Platform adapter |
| --- | --- | --- | --- | --- | --- |
| LifeOS Home, navigation, posts, reels, products | same `lifeos-web` routes | same bundle | same bundle | `AppShell`, `personalRoutes`, command nav | safe area CSS; StatusBar overlay; Keyboard resize |
| mybrandOS Home, posts, reels, TV, Radio, Digipedia, News | `DigitalLifeShell` | no native project; iframe URL | no native project; iframe URL | `apps/web` only | PWA install prompt; OS Xperience iframe |
| APP / SPACE | `experienceMode` in each web app | same bundle, not a second implementation | same bundle | `experienceMode.ts` in each app | none |
| Watch / Cinema | `defaultMediaPresentation` from host size | same function | same function | `immersiveFeedController.ts` | none (size, not OS) |
| Saved media, continuity, Offline Kernel | IndexedDB (`digiconomy-offline-kernel`, space-consumption `database.ts`) | same JS; storage is the WebView origin | same JS; WKWebView origin | shared kernel packages | not redesigned |

IndexedDB is not browser-only in source: the native shell runs the same calls. LifeOS release origin is `https://lifeosapp.getlifeos.app` inside the app WebView, so persistence is per app, not the user's Chrome profile. That persistence was not exercised on a device in this pass. No kernel incompatibility was found in source, and none was redesigned.

## Android

Supported sync: `npm run mobile:sync` → `CAPACITOR_SERVER_URL=https://lifeosapp.getlifeos.app`, API `https://lifeos-shell-production.up.railway.app`. `gradlew assembleDebug` **BUILD SUCCESSFUL**. Installed on Pixel_8 emulator (`emulator-5554`). `com.lifeos.mobile/.MainActivity` resumed and painted the LifeOS login ("Enter LifeOS"), not a white screen and not a localhost page. Screenshot: `docs/app-presentation-android-lifeos.png`. An emulator system ANR ("Process system isn't responding") sat on top; the LifeOS login stayed visible behind it.

That runtime is the **deployed** origin. This restoration is not deployed, so the emulator did not show the restored APP chrome, posts, reels, TV, or SPACE toggle.

## iOS

`cap sync` copied the same web bundle into `ios/App/App/public` and registered the same six Capacitor plugins. CocoaPods and Xcode are absent, so there is no native binary.

## OS Xperience

Android and iOS projects consume `apps/os-experience/dist` with no live `server.url`, so the shell UI is bundled. The verified browser path still loads mybrandOS from a network entrypoint, so that page is not inside the APK. The earlier browser acceptance is not Android or iOS verification. No OS Xperience device run was done; the OS SHELL tree also has unrelated uncommitted work.

# CROSS-PLATFORM ACCEPTANCE

| Product/Capability | Web | Android | iOS |
| --- | --- | --- | --- |
| LifeOS App | PASS (browser harness 33/33; local API identity mocked) | BLOCKED for this restoration. Shell boot PASS on emulator against the deployed origin | SOURCE INTEGRATION PASS (same bundle copied). NATIVE BUILD BLOCKED |
| mybrandOS App | PASS (real `/u/mrfundzman`) | BLOCKED. No Android project. Host iframe points at the deployed origin | BLOCKED. No iOS project. NATIVE BUILD BLOCKED |
| Posts | PASS as APP routes (LifeOS empty feed; mybrandOS nav) | BLOCKED | BLOCKED |
| Reels | PASS as APP routes | BLOCKED | BLOCKED |
| Watch | PASS in unit tests as presentation, not observed in browser (no media) | BLOCKED | BLOCKED |
| Cinema | PASS in unit tests as presentation, not observed in browser | BLOCKED | BLOCKED |
| TV | PASS as LifeOS SPACE surface mount and mybrandOS APP surface button. Playback not observed | BLOCKED | BLOCKED |
| Radio | PASS as surface mount / button | BLOCKED | BLOCKED |
| Space entry | PASS both apps, and return to APP | BLOCKED (deployed login only) | BLOCKED |
| Offline Kernel | PASS on the OS Xperience browser path (prior acceptance) | BLOCKED. Not run on device. Same IndexedDB calls, unverified WebView persistence | BLOCKED |
| Saved Media | PASS in that browser acceptance (IndexedDB checksums) | BLOCKED | BLOCKED |
| Continuity | PASS across browser restart in that acceptance | BLOCKED | BLOCKED |

BLOCKED reasons:

- Android runtime of this restoration: the supported LifeOS shell loads `https://lifeosapp.getlifeos.app`, and these edits are not on that origin. The emulator also raised a system ANR over the login screen.
- mybrandOS Android/iOS: there is no native project. Distribution is the web origin, which is not updated.
- iOS native build: this machine is Windows. `xcodebuild` and CocoaPods are not installed.
- Offline Kernel / Saved Media / Continuity on device: not executed. Source uses IndexedDB with no native filesystem adapter.

## FINAL STATUS

WEB — VERIFIED for APP presentation, with the data limits already recorded (LifeOS API has no usable local database; mybrandOS local media is unavailable).

ANDROID — shell build and boot PASS against the current production origin. This restoration's Android runtime is VERIFICATION BLOCKED until that origin contains the same web build.

IOS SOURCE INTEGRATION — PASS (same Capacitor web bundle copied; native compile not run).

IOS NATIVE BUILD — VERIFICATION BLOCKED (requires macOS/Xcode).

CROSS-PLATFORM — not verified. Web, Android, and iOS are one product and three distributions. Only Web has a passing runtime for this restoration.
