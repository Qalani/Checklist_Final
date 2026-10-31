# Native Android

The `android/` directory is a standalone Kotlin Android application. Jetpack
Compose renders its screens; native Android storage, browser authentication and
notifications provide platform services. The APK does not load a website or bundle
Next.js, React, JavaScript, Electron, Capacitor or a WebView.

The Next.js application remains the browser client. Both clients use the existing
Supabase database and its row-level security policies. Android changes do not
require exporting or deploying the website.

## Build locally

Install Android Studio, JDK 21, Android SDK Platform 36 and Build Tools 36.0.0.
Open the repository's `android/` directory in Android Studio. Set `ANDROID_HOME`
or create an untracked `android/local.properties` with `sdk.dir=/path/to/android-sdk`.
The committed Gradle wrapper downloads the required Gradle version.

Supply the same public Supabase URL and client key used by the website:

```bash
export SUPABASE_URL=https://your-project-ref.supabase.co
export SUPABASE_PUBLISHABLE_KEY=your-publishable-or-legacy-anon-key
cd android
./gradlew testDebugUnitTest lintDebug assembleDebug
```

Alternatively, use Gradle properties `supabaseUrl` and `supabasePublishableKey` in
an untracked user Gradle properties file or pass them with `-P`. Existing
`NEXT_PUBLIC_SUPABASE_URL` and `NEXT_PUBLIC_SUPABASE_ANON_KEY` environment variables
are accepted as fallbacks. These public values are compiled into the APK. Never
supply a Supabase service-role or secret key to an Android build.

From the repository root, `npm run build:android` runs `assembleDebug` and
`npm run test:android` runs native unit tests and lint. They are convenience wrappers
around Gradle; neither command needs `npm install`, a Next.js export or Capacitor.
On Windows use `gradlew.bat` from the Android directory.

The installable development APK is at
`android/app/build/outputs/apk/debug/app-debug.apk`. Install it with Android Studio
or `adb install -r android/app/build/outputs/apk/debug/app-debug.apk`. Debug builds
without Supabase configuration display setup information. Release builds require
configuration.

## Authentication and notifications

Keep `com.zenworkspace.app://auth-callback` in Supabase Authentication → URL
Configuration → Redirect URLs. Google authentication opens the system browser in
a Custom Tab and exchanges its callback using PKCE. Email/password sign-in and
email account recovery use the same Supabase project.

The existing `android/app/google-services.json` configures Firebase Cloud
Messaging. Keep the Firebase application registered as `com.zenworkspace.app`.
Allow notifications on Android 13 or later when prompted. Local reminder alarms
use Android's inexact scheduling, so delivery may be delayed by battery saving or
Doze. Remote FCM delivery still requires connectivity and the existing server
reminder scheduler.

## CI and distribution

The **Build Native Android APK** GitHub Actions workflow runs native unit tests,
Android lint and `assembleDebug`, checks that the APK has no bundled web app, and
uploads `zen-workspace-native-debug-apk`. Configure repository secrets
`NEXT_PUBLIC_SUPABASE_URL` and `NEXT_PUBLIC_SUPABASE_ANON_KEY` with public client
configuration for a connected build. Fork pull requests cannot access repository
secrets and build an unconfigured debug APK for compilation checks.

The old Capacitor synchronization workflow has been removed. Do not run `cap sync`
or regenerate the Android directory from the web client.

For distribution, build a signed release APK or AAB in Android Studio using the
existing application's signing key. The application ID remains
`com.zenworkspace.app`; this native version increases `versionCode` to 3. Increase
it beyond the highest version already distributed if necessary. An update can be
installed over an existing app only when its signing certificate matches. CI debug
APKs are for testing and are not Play Store release builds.

## Upgrading from the WebView app

Synchronize all changes in the old app while online before installing the native
update. Android cannot directly import the old wrapper's unsynchronized browser
IndexedDB queue into its native database. The native app downloads synchronized
account records after sign-in; it does not automatically migrate unsynchronized
WebView data or its login session. Do not clear the old application's storage or
uninstall it before confirming its changes have synchronized.

Native data is cached per account and queued writes persist across app restarts.
New authentication, collaboration changes and account recovery need connectivity.
Use the device checks in `docs/offline-support.md` before shipping. Automated
compilation and unit tests do not verify live OAuth, remote FCM delivery, background
alarm timing or signing compatibility with an installed production APK.

## Native interaction and sync

The native client includes tasks, categories, shared lists and list items, a native
rich-text note editor, calendar agenda and iCalendar import, reminders, friends,
collaborator roles, public list links, progress statistics and four themes. Task
and list ordering use accessible move buttons. Calendar navigation uses Android's
date picker and a day agenda. Workspace JSON backup and restore use Android's
system document picker; exported files contain personal data, never auth tokens.

The client refreshes when resumed and every 30 seconds while visible. It also
sends queued edits after a write. This uses the existing REST API and RLS; the
native client does not currently subscribe to Supabase Realtime WebSockets.
Unsent writes are retained in account-specific SQLite transactions. Settings can
export pending changes and explicitly discard them before reloading the server
copy when a permanent permission or validation error blocks sync.

Device alarms and the existing remote notification scheduler can occasionally
both deliver the same reminder. The server currently sends notification-only FCM
payloads without a shared delivery identifier, so complete cross-channel
suppression requires a corresponding server change. Confirm notification timing,
Google/email recovery redirects, shared-account permissions and upgrade signing
on a real device before distributing a production release.


## Bottom navigation and screen layouts

Open **Settings → Bottom bar → Edit**, or **Workspace menu → Edit bottom bar**,
to choose up to five shortcuts. Drag the handles or use the move arrows to change
their order. Add/remove controls apply immediately; Reset defaults restores Home,
Tasks, Lists and Notes. Hide bar removes the bottom navigation completely while
the workspace menu keeps every page available. The selection and order are saved
on this device separately for each account.

Phone screens use compact content gutters, full-width controls and wrapping
labels/actions. Overview and settings grids use extra columns on wide displays.
Editors use the available safe viewport and scroll above the keyboard; the note
editor expands into the remaining height. Bottom navigation hides while typing
and keeps accessible touch targets. Large text can increase control height rather
than clipping the label.
