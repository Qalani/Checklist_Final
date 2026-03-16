import { NextResponse, type NextRequest } from 'next/server';

/**
 * Security middleware — runs on every non-asset request.
 *
 * Responsibilities:
 *  1. Build a Content-Security-Policy with 'unsafe-inline' for script-src.
 *  2. Attach all remaining security headers to the response.
 *
 * Why 'unsafe-inline' instead of a nonce?
 *   All pages are statically pre-rendered at build time. Next.js embeds inline
 *   <script> tags (RSC flight data, hydration bootstrap) in the HTML during the
 *   build — before any request-time nonce exists. A nonce set in middleware
 *   would never match those build-time scripts, so the browser blocks them and
 *   React cannot hydrate, producing a blank screen.
 *
 * Why does style-src still have 'unsafe-inline'?
 *   FullCalendar injects inline positioning styles for event layout; framer-
 *   motion animates via the style attribute. Removing 'unsafe-inline' from
 *   style-src would break both. Style injection cannot exfiltrate tokens the
 *   way script injection can, so this is an accepted trade-off.
 */
export function middleware(_request: NextRequest) {
  const csp = [
    "default-src 'self'",

    // Inline scripts are required because Next.js embeds RSC flight data and
    // hydration bootstrap scripts at static build time (no nonce available).
    // In development, Next.js webpack also uses eval() for source maps.
    `script-src 'self' 'unsafe-inline'${process.env.NODE_ENV === 'development' ? " 'unsafe-eval'" : ''}`,

    // Inline styles are required by FullCalendar (event sizing) and
    // framer-motion (animation transforms). See note above.
    "style-src 'self' 'unsafe-inline'",

    // data: allows Next.js image optimisation to inline tiny images; https:
    // permits loading avatars / OG images from external CDNs.
    "img-src 'self' data: https:",

    // next/font self-hosts Google Fonts — no external font CDN needed.
    "font-src 'self'",

    // Supabase REST + Realtime WebSocket endpoints.
    "connect-src 'self' https://*.supabase.co wss://*.supabase.co",

    // Disallow framing from any origin (defence-in-depth alongside
    // X-Frame-Options: DENY).
    "frame-ancestors 'none'",
  ].join('; ');

  const response = NextResponse.next();

  // ── Security response headers ────────────────────────────────────────────

  // CSP — built above.
  response.headers.set('Content-Security-Policy', csp);

  // Prevent MIME-type sniffing (e.g. serving a .jpg that is actually a script).
  response.headers.set('X-Content-Type-Options', 'nosniff');

  // Forbid the app from being embedded in any frame.
  response.headers.set('X-Frame-Options', 'DENY');

  // Send the full origin only to same-origin requests; only the origin (no
  // path) to cross-origin HTTPS destinations.
  response.headers.set('Referrer-Policy', 'strict-origin-when-cross-origin');

  // Opt out of browser features the app doesn't use.
  response.headers.set('Permissions-Policy', 'camera=(), microphone=(), geolocation=()');

  // Enforce HTTPS for 2 years, including subdomains; opt in to HSTS preload.
  // NOTE: only set this header in production — local dev uses HTTP.
  if (process.env.NODE_ENV === 'production') {
    response.headers.set(
      'Strict-Transport-Security',
      'max-age=63072000; includeSubDomains; preload',
    );
  }

  return response;
}

export const config = {
  matcher: [
    /**
     * Run middleware on all paths EXCEPT:
     *   - _next/static  — pre-built JS/CSS chunks (no headers needed)
     *   - _next/image   — image optimisation endpoint
     *   - Common static assets identified by extension
     *
     * The `missing` array skips prefetch requests that never render HTML.
     */
    {
      source:
        '/((?!_next/static|_next/image|favicon\\.ico|.*\\.(?:svg|png|jpg|jpeg|gif|webp|ico|txt|xml|webmanifest)$).*)',
      missing: [
        { type: 'header', key: 'next-router-prefetch' },
        { type: 'header', key: 'purpose', value: 'prefetch' },
      ],
    },
  ],
};
