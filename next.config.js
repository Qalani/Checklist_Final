/** @type {import('next').NextConfig} */

const isCapacitorBuild = process.env.CAPACITOR_BUILD === 'true';

const nextConfig = {
  // Static export for Capacitor/Android builds; SSR for web deployment.
  ...(isCapacitorBuild ? { output: 'export' } : {}),

  // Security headers (CSP, HSTS, X-Frame-Options, etc.) are set per-request
  // by src/middleware.ts for SSR/web deployments. Middleware issues a fresh
  // cryptographic nonce on every request so that 'unsafe-inline' can be
  // removed from script-src without breaking Next.js's own streaming scripts.
  //
  // Capacitor builds are static exports served from the local filesystem — no
  // HTTP server is involved, so response headers are not applicable there.

  reactStrictMode: true,

  webpack: (config, { dev }) => {
    if (dev) {
      // Avoid eval-based source maps in development. The default eval-source-map
      // devtool wraps module code inside eval() strings which can cause
      // "SyntaxError: Invalid or unexpected token" page errors in some
      // environments (e.g. Playwright tests), preventing dynamic imports from
      // being triggered. cheap-module-source-map uses normal <script> tags.
      config.devtool = 'cheap-module-source-map';
    }
    return config;
  },
};

module.exports = nextConfig;
