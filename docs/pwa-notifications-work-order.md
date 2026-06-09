# Work Order: PWA install + browser notifications for Decent and ssbski

**Status:** Draft — awaiting sign-off
**Intent:** Make the two web clients (Decent and ssbski) installable as Progressive Web Apps and let them raise native browser notifications for the events the in-app notifications tab already tracks (mentions, replies, votes, follows, git activity targeting your feeds). Per-skin branding (name, icons, theme) must stay distinct.
**Depends on:** nothing strictly. Builds on the existing live-stream notification classifier in `decent/src/modules/extras/notifications.js`.

## Summary

> **What this is:** Decent and ssbski are the same browserified single-page app (`decent/build/index.html`) served under two skins by `lib/ui-server.js` via the thin plugins `plugins/decent-ui.js` (port 8888) and `plugins/ssbski-ui.js` (port 8990). The server rewrites the served HTML per-skin on the fly — swapping the stylesheet, injecting the ssbski splash, and setting `window.PATCHBAY_REMOTE` (the muxrpc ws endpoint the client dials).
>
> **What we propose:**
> 1. **Installability** — serve a real per-skin web app manifest (`manifest.webmanifest`) and a minimal service worker so each skin can be "Add to Home Screen"/installed with its own name, icons, and theme color.
> 2. **Browser notifications** — a permission flow plus a notification emitter driven by the *existing* live-stream classifier, so events that already light up the in-app notifications tab also surface as OS-level notifications when permission is granted.
>
> **What we are asking to approve:** the notification *delivery model* (foreground-only in Phase 1 vs. true background Web Push in a later phase — see "Delivery model & the SSB constraint"), and the per-skin asset/branding split.
>
> **Explicitly not in Phase 1:** background/closed-tab push, VAPID/Web Push server infrastructure, notification preferences UI beyond a single on/off + permission prompt, and offline message composition.

## Why

The clients already compute exactly which messages are "for you" (the notifications tab). But that signal is only visible if the user is looking at that tab. Users running Decent/ssbski as a day-to-day social client expect (a) to install it like an app and (b) to be told when someone replies, mentions, likes, or follows them — without staring at the tab. This work order closes that gap with the smallest delivery model that actually works given SSB's architecture.

## Current state (grounding)

- **Two skins, one bundle.** `createUiServer` in `lib/ui-server.js` serves `decent/build/`. The only per-skin differences today are `stylesheetName`, the ssbski splash/favicon injection, and the config namespace/port. HTML is post-processed in-flight in `serveFile()` — this is the natural seam to inject a per-skin `<link rel="manifest">` and the SW registration shim.
- **Build.** `npm run build:web` runs browserify + `indexhtmlify` to emit a single `decent/build/index.html`, then `decent/scripts/postprocess-index.js`. Static assets (e.g. `ssbski-logo.png`) are served straight from the build dir by the static handler in `ui-server.js`.
- **No PWA assets exist.** `decent/src/manifest.json` is the *muxrpc* manifest (RPC surface), not a web app manifest. There is no service worker and no `manifest.webmanifest`.
- **Live event source.** `decent/src/modules/core/sbot.js` holds a reconnecting muxrpc websocket (kept alive by a 4-minute `whoami` heartbeat) to `window.PATCHBAY_REMOTE`. `decent/src/modules/extras/notifications.js` already filters the live log for mentions, replies (branch/root to our feeds), votes on our messages, follows of us, and git issue/PR/update/comment events on our repos. **This classifier is the notification trigger we reuse — we do not re-derive "is this for me".**

## Delivery model & the SSB constraint

True PWA background push (notifications when no tab is open) requires the **Web Push** protocol: a service worker subscribed to a browser *push service* (FCM/Mozilla/Apple), a server holding **VAPID** keys, and that server POSTing to the push endpoint when something happens. SSB has no central server — the sbot is a local/self-hosted peer, and the "for you" decision happens *client-side* over the live stream. There is no existing component positioned to be a push sender, and one sbot can serve many identities/skins.

This yields two phases:

- **Phase 1 — foreground notifications (recommended first).** While a tab/PWA window is open (even backgrounded/minimized), the live stream is already running. When the classifier yields a notification-worthy message, call `registration.showNotification(...)` (or `new Notification(...)`). No push service, no VAPID, no server changes. Works in every browser that exposes the Notification API, including installed PWAs. This delivers ~80% of the perceived value (you get pinged while the app is "running") for a small fraction of the cost.
- **Phase 2 — background Web Push (separate, optional, needs a decision).** To notify when *no* tab is open, the sbot (or the UI server process) must become a push sender: generate/store VAPID keys, expose a subscription endpoint, persist subscriptions per identity, and run the classifier server-side against the log to fire pushes. This is a meaningfully larger change and couples notifications to a process that is meant to be local-first. Treat as research/spike, not committed scope.

**Recommendation:** ship Phase 1 fully; scope Phase 2 only after we see how much background delivery is actually wanted.

## Phase 1 — scope and tasks

### A. Installability (PWA shell)

1. **Per-skin web manifest.** Generate `manifest.webmanifest` per skin (not a static file in the bundle, since the two skins share a build dir). Cleanest fit: a route in `ui-server.js` that emits JSON built from `opts` — `name`/`short_name` ("Decent" vs "ssbski"), `theme_color`/`background_color`, `start_url: "/"`, `display: "standalone"`, and an `icons` array. Decent already strips Bootstrap and owns no logo; ssbski ships `ssbski-logo.png`. Provide icon sets per skin (192px + 512px, plus a maskable variant).
2. **Icons.** ssbski can derive from `ssbski-logo.png`; Decent needs an icon defined (open question — see below). Serve them as static files from the build dir or a new `assets` route.
3. **Manifest link injection.** In `serveFile()`, add `<link rel="manifest" href="/manifest.webmanifest">` and the appropriate `<meta name="theme-color">` to `headInsert`, alongside the existing per-skin favicon/splash logic.
4. **Service worker.** Serve a small `/sw.js` (per-skin scope is `/`). Phase-1 SW does two things: (a) registers and owns notification display, and (b) optionally caches the app shell for offline load. Keep caching conservative — the app is dynamic and dials a ws; a stale shell that can't reconnect is worse than a network error. A no-cache or cache-shell-only SW is acceptable for Phase 1.
5. **SW registration shim.** Inject a tiny inline `<script>` (mirroring the splash-injection pattern) that calls `navigator.serviceWorker.register('/sw.js')` when supported.

### B. Browser notifications

6. **Permission flow.** Do **not** prompt on load (browsers penalize that and it's user-hostile). Add an explicit affordance — a button in the notifications tab / settings ("Enable notifications") — that calls `Notification.requestPermission()`. Persist the user's choice (localStorage) and reflect state (default / granted / denied).
7. **Emitter module.** New client module (e.g. `decent/src/modules/extras/notify.js`) that subscribes to the same live stream + classifier used by `notifications.js`, and for each qualifying message — when permission is granted and the document is not the focused, visible tab — renders a notification: title (actor + action: "Alice replied", "Bob liked your post", "Carol followed you"), body (text snippet), icon (actor avatar blob or skin logo), and a click handler that focuses the window and routes to the message/thread.
8. **De-dupe & rate control.** The classifier currently runs two passes (live `old:false` + a backfill pass). Only the live pass should fire notifications, and only for messages newer than app-open time, to avoid a burst of notifications for already-seen history on every load. Tag notifications so repeats collapse (`tag` option) and coalesce floods.
9. **Refactor for reuse.** Factor the "is this message for me" logic in `notifications.js` so both the tab renderer and the emitter share one classifier rather than duplicating the switch on message type.

### C. Per-skin correctness

10. Notification icon/branding, manifest identity, and SW cache names must be namespaced per skin so an installed Decent and an installed ssbski on the same machine don't collide (distinct `start_url` origins already differ by port, but cache names and notification tags should still be prefixed).

## Open questions

1. **Decent app icon.** ssbski has `ssbski-logo.png`; Decent currently has no logo/icon. Do we want a Decent icon designed, or reuse an existing mark? (Blocks the manifest `icons` array for the Decent skin.)
2. **Offline shell caching — yes or no for Phase 1?** Cache the shell (faster loads, but staleness risk against a live ws app) or ship a notification-only SW with no caching? Recommendation: notification-only / network-first for Phase 1.
3. **Phase 2 appetite.** Is closed-tab background push wanted enough to justify VAPID + a server-side classifier + subscription storage on the sbot? Decision needed before we scope it.
4. **Notification granularity.** One global on/off in Phase 1, or per-type toggles (mentions vs. votes vs. git)? Recommend global on/off first.

## Non-goals (Phase 1)

- Background/closed-tab push (Web Push, VAPID, FCM/APNs) — Phase 2 research only.
- Server-side notification state or subscription storage.
- Per-type notification preferences UI.
- Offline composition / outbox.
- Push for git-server or CLI events outside the web client.

## Risks & notes

- **iOS/Safari.** Web push/notifications on iOS require the PWA to be installed to the home screen and have historically lagged; foreground `Notification` support varies. Phase 1's "while open" model is the most portable.
- **Stale SW.** Service workers are sticky; a bad SW can pin users to a broken shell. Ship with a clear update/skipWaiting strategy and test the upgrade path before release.
- **Notification spam on reconnect.** The reconnecting ws + dual-pass classifier could replay events. The app-open-timestamp gate and tagging (tasks 8) are load-bearing, not optional.
- **Two skins, one build dir.** All per-skin divergence must flow through `ui-server.js` `opts` and runtime HTML rewriting, consistent with how the stylesheet/splash already work — do not fork the bundle.

## Suggested sequencing

1. Manifest route + injection + icons (installable, no notifications yet) — small, independently shippable.
2. Minimal SW + registration shim — installable PWA lands here.
3. Classifier refactor in `notifications.js` for shared reuse.
4. Permission flow + emitter module — foreground notifications land here.
5. Per-skin polish, de-dupe/rate gating, upgrade-path testing.
6. (Later, gated on Q3) Phase 2 Web Push spike.

## Rough effort

Phase 1: small-to-medium. Tasks 1–5 (installability) are mechanical and low-risk. Tasks 6–10 (notifications) are the real work — mostly the classifier refactor, the open/visibility/dedupe gating, and per-skin/cross-browser testing. Phase 2 is a separate, larger effort and is not estimated here.
