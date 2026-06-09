# Proposal: minimal mention + DM notifications for ssbski

**Status:** Draft — awaiting sign-off
**Scope:** ssbski only (port 8990, `plugins/ssbski-ui.js`). Decent is explicitly out.
**Goal:** Get a native browser notification when a new **mention** or **private message** arrives. Nothing else.

This is a deliberately smaller replacement for `docs/pwa-notifications-work-order.md`. That work order covers two skins, installability, the full event classifier (votes/follows/git), and a Phase 2 push server. This one strips all of that to the single question asked: *what is the minimum to be pinged on mentions and DMs?*

## The minimum, in one breath

Browser notifications need **no manifest and no service worker** as long as a tab is open: you call `Notification.requestPermission()` once, then `new Notification(title, opts)` whenever something arrives. So the entire feature is:

1. **One permission button.**
2. **One small client module** that watches the live log and fires a notification for mentions + DMs.

That's it. No PWA shell, no build changes, no server changes.

## Why it's so small here

`decent/src/modules/extras/notifications.js` already classifies "is this for me." Two of its branches are exactly what we want **and are fully synchronous** on an unboxed message — no `sbot_get` round-trips:

```js
// mention of one of our ids
if (c.mentions && Array.isArray(c.mentions) && c.mentions.some(linksToUs))
  return cb(null, msg)

// private message (msg.private is set by message_unbox)
if (msg.private)
  return cb(null, msg)
```

Everything else in that classifier (replies, votes, contacts, git) requires async `sbot_get` lookups and is precisely what we're dropping. So our matcher is ~6 lines, not the full switch.

The live log already streams while a tab is open: `core/sbot.js` holds the reconnecting muxrpc ws (4-min `whoami` heartbeat), and `notifications.js` already consumes `api.sbot_log` + an `unbox()` step that runs string content through `message_unbox` (this is what sets `msg.private`). We reuse the same plumbing — the only new thing is that it runs **app-wide**, not just while the notifications tab is mounted.

## Tasks

### 1. New client module: `decent/src/modules/extras/notify.js`

A depject module that, once on app boot, opens a **live-only** subscription and fires notifications. Sketch:

```js
exports.needs = { sbot_log: 'first', message_unbox: 'first' }
exports.gives = { notify_start: true }   // app.js calls this once

exports.create = function (api) {
  return {
    notify_start: function () {
      if (!('Notification' in window)) return
      var ourId = require('../../keys').id
      var since = Date.now()                 // ignore backfill / already-seen
      var seen = {}                          // de-dupe by msg key

      pull(
        u.next(api.sbot_log, { old: false, limit: 100 }),  // live only
        pull.map(function (m) {
          return m.value && typeof m.value.content === 'string'
            ? api.message_unbox(m) : m
        }),
        pull.filter(Boolean),
        pull.drain(function (msg) {
          if (Notification.permission !== 'granted') return
          if (!document.hidden && document.hasFocus()) return  // don't ping the active tab
          var c = msg.value && msg.value.content
          if (!c || typeof c !== 'object') return
          if (msg.value.author === ourId) return               // not our own posts
          if (msg.value.timestamp <= since) return              // only new
          if (seen[msg.key]) return; seen[msg.key] = true

          var isMention = msg.private ? false :
            (c.mentions || []).some(function (l) { return l && l.link === ourId })
          if (!msg.private && !isMention) return

          var n = new Notification(
            msg.private ? 'New private message' : 'You were mentioned',
            { body: (typeof c.text === 'string' ? c.text.slice(0, 140) : ''),
              tag: msg.key,                  // collapse repeats on reconnect
              icon: '/ssbski-logo.png' }
          )
          n.onclick = function () {
            window.focus()
            window.location.hash = '#' + msg.key
          }
        })
      )
    }
  }
}
```

(Exact `u.next` / `pull` imports mirror `notifications.js`. `linksToUs` here is just `=== ourId` since we only watch one identity.)

### 2. Boot hook in `decent/src/modules/core/app.js`

`app.js` already `needs: { sbot_log, ... }` and is the single `app` entry. Add `notify_start: 'first'` to its needs and call `api.notify_start()` once inside the boot function (after the ws is up). One line.

### 3. Permission button

Add an "Enable notifications" affordance to the existing notifications-tab header (in `notifications.js`'s `screen_view('notifications')`). On click: `Notification.requestPermission()`. Reflect state (default / granted / denied) so the button hides once granted. **Do not** prompt on load — browsers penalize that.

## Load-bearing gates (don't skip)

- **App-open timestamp** (`since`): the live stream + reconnects can replay history; without this you get a notification burst on every load.
- **`tag: msg.key`**: collapses duplicates if the same message is seen twice across a reconnect.
- **Focus/visibility check**: don't notify the tab the user is already looking at.
- **Author check**: never notify on our own messages.

## Explicitly NOT in this proposal

- **No PWA manifest, no service worker, no "Add to Home Screen."** Not needed for desktop foreground notifications.
- **No background / closed-tab push** (Web Push, VAPID, FCM/APNs). Notifications only fire while an ssbski tab is open (backgrounded/minimized is fine on desktop).
- **No votes / follows / replies / git events.** Mentions and DMs only.
- **No per-type preference UI.** Single on/off via the permission state.
- **No Decent.**

## The one caveat: iOS

iOS Safari does **not** raise web notifications from an ordinary tab — it requires the page be installed to the home screen as a PWA (manifest + service worker) *and* notifications fire through a service worker, not `new Notification()`. So:

- On **desktop** (Chrome/Firefox/Safari) and **Android Chrome**, the plan above works as written.
- If **iOS** matters, that's the *only* case that needs the manifest + a notification-capable service worker — a small, well-scoped add-on (one `manifest.webmanifest` route in `ui-server.js` + a `/sw.js` whose only job is `showNotification`). Recommend deferring until iOS is actually a requirement, then lift just that piece from the larger work order.

## Effort

Tiny. One new ~50-line module, one line in `app.js`, one button. No build or server changes. Cross-browser desktop/Android works out of the box; iOS is a deferred opt-in.
