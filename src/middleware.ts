import { NextResponse, type NextRequest } from 'next/server';

/**
 * Security middleware — runs on every non-asset request.
 *
 * Responsibilities:
 *  1. Generate a per-request cryptographic nonce.
 *  2. Build a Content-Security-Policy that uses that nonce instead of the
 *     now-removed 'unsafe-inline' / 'unsafe-eval' directives.
 *  3. Forward the nonce via the `x-nonce` request header so:
 *       a. Next.js's own SSR / streaming inline scripts receive the nonce
 *          automatically (Next.js reads x-nonce internally).
 *       b. The root layout can read it for any future next/script components
 *          that need an explicit nonce prop.
 *  4. Attach all remaining security headers to the response.
 *
 * Why nonce over 'unsafe-inline'?
 *   'unsafe-inline' in script-src allows ANY inline script to execute, which
 *   completely defeats XSS protection. A per-request nonce is unguessable by
 *   attackers and only permits the scripts that Next.js itself injected.
 *
 * Why is 'unsafe-eval' gone?
 *   Next.js 15 production builds do not use eval(). FullCalendar v6 was
 *   rewritten to be fully CSP-compliant (no new Function / eval). No other
 *   dependency in this project requires it.
 *
 * Why does style-src still have 'unsafe-inline'?
 *   FullCalendar injects inline positioning styles for event layout; framer-
 *   motion animates via the style attribute. Removing 'unsafe-inline' from
 *   style-src would break both. Style injection cannot exfiltrate tokens the
 *   way script injection can, so this is an accepted trade-off.
 */
export function middleware(request: NextRequest) {
  // crypto.randomUUID() is available in the Next.js Edge runtime and in Node.
  // Base64-encoding it keeps the nonce URL-safe and slightly shorter.
  const nonce = Buffer.from(crypto.randomUUID()).toString('base64');

  const csp = [
    "default-src 'self'",

    // Same-origin scripts + any script carrying this request's unique nonce.
    // In development, Next.js webpack uses eval() for source maps; permit it
    // only in that mode. Production builds are eval-free so this stays locked.
    // 'unsafe-inline' is intentionally absent.
    `script-src 'self' 'nonce-${nonce}'${process.env.NODE_ENV === 'development' ? " 'unsafe-eval'" : ''}`,

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

  // Attach the nonce to the forwarded request headers.
  // Next.js reads `x-nonce` internally and stamps it onto the inline <script>
  // tags it generates during SSR and streaming, making them CSP-compliant.
  const requestHeaders = new Headers(request.headers);
  requestHeaders.set('x-nonce', nonce);

  const response = NextResponse.next({
    request: { headers: requestHeaders },
  });

  // ── Security response headers ────────────────────────────────────────────

  // CSP — built above with the fresh nonce.
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
     *   - _next/static  — pre-built JS/CSS chunks (served by CDN, no nonce needed)
     *   - _next/image   — image optimisation endpoint
     *   - Common static assets identified by extension
     *
     * The `missing` array skips prefetch requests so the nonce generated here
     * isn't wasted on navigation hints that never render HTML.
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
