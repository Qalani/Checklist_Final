/**
 * Extracts a human-readable message from an unknown error value.
 *
 * Handles the common cases produced by Supabase, fetch, and plain throws:
 * - Error instances → error.message
 * - Plain objects with a `message` string property
 * - Raw string errors
 * - Anything else → returns `fallback`
 */
export function extractErrorMessage(error: unknown, fallback: string): string {
  if (!error) return fallback;
  if (typeof error === 'string') return error;
  if (error instanceof Error) return error.message || fallback;
  if (typeof error === 'object' && 'message' in (error as Record<string, unknown>)) {
    const message = (error as { message?: unknown }).message;
    if (typeof message === 'string' && message.trim()) {
      return message;
    }
  }
  return fallback;
}
