/**
 * Simple in-memory sliding-window rate limiter for Next.js API routes.
 *
 * Keyed by "<userId>:<endpoint>" so limits are per-user, per-endpoint.
 * Works within a single warm serverless instance. Sufficient for preventing
 * abuse on mutation endpoints — not a substitute for network-level DDoS
 * protection, but limits damage from a single authenticated user.
 */

interface RateLimitEntry {
  count: number;
  windowStart: number;
}

// Map keyed by "<userId>:<endpoint>"
const store = new Map<string, RateLimitEntry>();

const DEFAULT_WINDOW_MS = 60_000; // 1 minute
const PRUNE_INTERVAL_MS = 5 * 60_000; // prune every 5 minutes

// Prune stale entries to prevent unbounded memory growth
if (typeof setInterval !== 'undefined') {
  setInterval(() => {
    const now = Date.now();
    store.forEach((entry, key) => {
      if (now - entry.windowStart > DEFAULT_WINDOW_MS * 2) {
        store.delete(key);
      }
    });
  }, PRUNE_INTERVAL_MS);
}

export interface RateLimitOptions {
  /** Length of the sliding window in milliseconds. Defaults to 60 000 (1 min). */
  windowMs?: number;
  /** Maximum number of requests allowed per window. */
  maxRequests: number;
}

export interface RateLimitResult {
  /** Whether the request is within limits and should be allowed. */
  allowed: boolean;
  /** Requests remaining in the current window. */
  remaining: number;
  /** Epoch ms at which the current window resets. */
  resetAt: number;
}

/**
 * Check whether a request from `userId` to `endpoint` is within rate limits.
 * Call this once per request; it automatically increments the counter.
 */
export function checkRateLimit(
  userId: string,
  endpoint: string,
  options: RateLimitOptions,
): RateLimitResult {
  const windowMs = options.windowMs ?? DEFAULT_WINDOW_MS;
  const { maxRequests } = options;
  const key = `${userId}:${endpoint}`;
  const now = Date.now();

  const existing = store.get(key);

  if (!existing || now - existing.windowStart >= windowMs) {
    store.set(key, { count: 1, windowStart: now });
    return { allowed: true, remaining: maxRequests - 1, resetAt: now + windowMs };
  }

  if (existing.count >= maxRequests) {
    return { allowed: false, remaining: 0, resetAt: existing.windowStart + windowMs };
  }

  existing.count += 1;
  return {
    allowed: true,
    remaining: maxRequests - existing.count,
    resetAt: existing.windowStart + windowMs,
  };
}

/**
 * Build standard rate-limit response headers.
 */
export function rateLimitHeaders(
  limit: number,
  result: RateLimitResult,
): Record<string, string> {
  return {
    'X-RateLimit-Limit': String(limit),
    'X-RateLimit-Remaining': String(result.remaining),
    'X-RateLimit-Reset': String(Math.ceil(result.resetAt / 1000)),
    'Retry-After': String(Math.ceil((result.resetAt - Date.now()) / 1000)),
  };
}
