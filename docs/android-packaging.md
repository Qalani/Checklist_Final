# Packaging Zen Tasks as an Android App

This guide covers two supported strategies for shipping the Next.js-based Zen Tasks experience on Android devices. Choose the approach that best fits how "native" you need the experience to feel and whether you must distribute it through the Play Store.

## Option A – Wrap the web app with Capacitor (offline bundle)

Capacitor lets you ship the compiled Next.js site inside a native Android WebView. This provides an installable APK/AAB that works offline (subject to the parts of the app that rely on Supabase or other network calls) and can access native plugins if needed.

### 1. Prepare the Next.js build for static export

1. Add `output: 'export'` to `next.config.js`:
   ```js
   /** @type {import('next').NextConfig} */
   const nextConfig = {
     reactStrictMode: true,
     output: 'export',
   }

   module.exports = nextConfig
   ```
2. Update any dynamic routes or API calls so that they can run as static pages or in the browser. When using Supabase client-side, ensure authentication/session flows work without relying on Next.js server actions.
3. Export the site:
   ```bash
   npm run build
   npx next export
   ```
   The static assets will be emitted into the `out/` directory.

### 2. Add Capacitor to the project

1. Install the CLI and Android platform inside this repository:
   ```bash
   npm install --save-dev @capacitor/cli
   npm install --save @capacitor/core
   npx cap init "Zen Tasks" com.example.zentasks --web-dir=out
   npx cap add android
   ```
2. Copy the freshly exported `out/` directory into Capacitor's native project whenever you rebuild:
   ```bash
   npm run build && npx next export
   npx cap copy android
   ```
3. Open the Android project in Android Studio for signing, emulator testing, and Play Store builds:
   ```bash
   npx cap open android
   ```

You now have an Android Studio project (`android/`) that you can customize. The WebView loads the static Next.js bundle by default. Use Capacitor plugins if you need deeper native integrations (push notifications, secure storage, etc.).

## Option B – Trusted Web Activity (TWA) for hosted deployment

If you prefer to host the app (e.g., on Vercel) and simply provide an Android install entry point, a Trusted Web Activity wraps your HTTPS Progressive Web App in a native shell.

1. Ensure the hosted site meets PWA requirements: served over HTTPS, has a valid `manifest.json`, registers a service worker, and passes Lighthouse PWA checks.
2. Install Google's Bubblewrap tooling:
   ```bash
   npm install -g @bubblewrap/cli
   bubblewrap init --manifest https://your-domain.com/manifest.json
   bubblewrap build
   ```
3. The build step outputs an Android project configured to open your hosted URL in full screen using Chrome Custom Tabs. Import it into Android Studio to configure signing and upload to the Play Store.
4. Update Digital Asset Links so the TWA can verify ownership of the domain: upload the generated `assetlinks.json` to `https://your-domain.com/.well-known/assetlinks.json`.

This approach keeps all logic and hosting in the web stack while still letting users "install" from the Play Store.

## Distribution checklist

- [ ] Create release keystore and configure signing in Android Studio.
- [ ] Turn on Play App Signing when uploading to Google Play Console.
- [ ] Configure environment variables (Supabase keys, etc.) via remote config or by consuming them from the bundled `.env` during the web build.
- [ ] Test authentication and Supabase network flows on real devices—Capacitor/TWA shells rely on the device WebView/Chrome implementation.

## Recommended next steps

1. Decide whether you need offline support or deep native integration (use Capacitor) versus a quick wrapper around the hosted site (use TWA).
2. Automate the `npm run build && npx next export && npx cap copy android` flow inside a CI job so your Android project stays in sync with the Next.js source.
3. Add platform-specific UI tweaks (e.g., splash screen, status bar colors) inside the generated Android project before publishing.
