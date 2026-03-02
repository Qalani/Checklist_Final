/** @type {import('next').NextConfig} */

const isCapacitorBuild = process.env.CAPACITOR_BUILD === 'true';

const nextConfig = {
  // Static export for Capacitor/Android builds; SSR for web deployment
  ...(isCapacitorBuild ? { output: 'export' } : {}),

  // Security headers are only applied during SSR/web deployments.
  // Capacitor bundles assets locally so runtime HTTP headers are not used.
  ...(!isCapacitorBuild
    ? {
        async headers() {
          return [
            {
              source: '/(.*)',
              headers: [
                { key: 'X-Content-Type-Options', value: 'nosniff' },
                { key: 'X-Frame-Options', value: 'DENY' },
                { key: 'Referrer-Policy', value: 'strict-origin-when-cross-origin' },
                { key: 'Permissions-Policy', value: 'camera=(), microphone=(), geolocation=()' },
                { key: 'Strict-Transport-Security', value: 'max-age=63072000; includeSubDomains; preload' },
                { key: 'Content-Security-Policy', value: "default-src 'self'; script-src 'self' 'unsafe-inline' 'unsafe-eval'; style-src 'self' 'unsafe-inline'; img-src 'self' data: https:; font-src 'self'; connect-src 'self' https://*.supabase.co wss://*.supabase.co; frame-ancestors 'none';" },
              ],
            },
          ];
        },
      }
    : {}),

  reactStrictMode: true,
};

module.exports = nextConfig;
