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
              ],
            },
          ];
        },
      }
    : {}),

  reactStrictMode: true,
};

module.exports = nextConfig;
