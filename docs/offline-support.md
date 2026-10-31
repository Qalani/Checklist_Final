# Offline support

The web client keeps previously synchronized account data and pending changes in
IndexedDB. The native Android client uses its own account-scoped SQLite cache and
durable write queue. Sign in and let the first synchronization finish while connected before
relying on a device offline. A new device cannot download account data or sign in
without a connection.

## Web and mobile browsers

Run `npm run build` for a production web deployment. The post-build step writes
`public/offline-manifest.js`, which must be deployed alongside `service-worker.js`.
It lists every workspace page and all build chunks, styles and fonts, including
features that have never been opened. The worker installs only after that complete
asset set has downloaded. If a required resource fails, the previous worker stays
active. Existing tabs finish on their current version before a new worker activates.

Only the public app shell is cached by the worker. Supabase, authentication, API
responses and public-share pages bypass it. Account data belongs in IndexedDB.
Offline client-side navigation falls back to the route's cached HTML; Next.js then
performs a full navigation, and the page's already cached chunks hydrate normally.

Development mode deliberately does not register a worker because development
chunks change continuously. Test offline installation using a production build on
HTTPS, or `localhost`.

## Android

`npm run build:android` compiles the standalone Kotlin/Compose application. No
browser engine or service worker is needed to launch native screens offline.
Its account-scoped native database and pending writes survive ordinary app
termination and replay when the app resumes with connectivity.

Before upgrading from the previous Capacitor app, synchronize every pending change
online. Its unsynchronized WebView IndexedDB data and login session are not
imported into native storage. See [native Android builds](android-packaging.md).

Clearing application/browser data, uninstalling the app, private browsing, or web
storage eviction can remove locally stored data. Synchronize changes before
clearing data or switching devices.

## Features requiring a server or operating-system support

- New authentication and account recovery require connectivity.
- Sharing permissions and friendships must be authorized by the server; a locally
  cached view does not grant access to other users' data.
- FCM/Web Push delivery requires connectivity. Native Android reminders use
  inexact local AlarmManager scheduling and can be delayed by battery-saving modes.
  Browser timers cannot guarantee delivery while every browser page is closed.
- Background Sync is optional. The worker asks an open authenticated page to replay
  the queue. It does not contain credentials and cannot replay account changes
  while every page is closed. Reopening/resuming the app is the portable fallback.
- iPhone access uses the mobile website/PWA. This repository contains an Android
  native project and no native iOS project. Safari has different background and
  storage policies, so Android behavior does not establish iPhone reliability.

## Release verification on real devices

For both an installed Android APK and iPhone Safari/PWA:

1. Sign in online, wait for synchronization and, on web, full worker installation.
2. Enable airplane mode, terminate the app, and launch each workspace feature.
3. Create, edit, complete, reorder and delete records; import a file; close and
   reopen the app and confirm pending changes remain.
4. Reconnect and confirm pending writes reach the server once, including changes
   that depend on an offline-created parent. Confirm another device's edits and
   deletions are reflected locally.
5. Check shared-task/list visibility and revoke access from another device.
6. Repeat after an application update and with storage persistence refused.

Run `npx playwright test --config playwright.offline.config.ts` for the isolated
production Chromium suite at desktop and phone viewport sizes. It builds with a
synthetic Supabase endpoint, intercepts every backend request, installs the real
worker, disables the network, opens previously unvisited pages, reloads offline
notes/tasks, and checks queue replay on reconnect. It never contacts a live project.
Set `PLAYWRIGHT_CHROMIUM_EXECUTABLE_PATH` when using a system browser.

Automated unit/browser checks supplement this matrix. They do not substitute for
real native Android, iOS/Safari, storage-pressure or notification-delivery checks.
