import { NextResponse } from 'next/server';
import { authenticateRequest, supabaseAdmin } from '@/lib/api/supabase-admin';
import { checkRateLimit, rateLimitHeaders } from '@/lib/rate-limiter';
import { withTimeout, TimeoutError } from '@/lib/api/with-timeout';

export const maxDuration = 30;

const QUERY_TIMEOUT_MS = 10_000;

const MAX_NAME_LENGTH = 100;
const MAX_COLOR_LENGTH = 30;

export async function POST(request: Request) {
  if (!supabaseAdmin) {
    return NextResponse.json({ error: 'Supabase is not configured on the server.' }, { status: 500 });
  }

  let userId: string;

  try {
    const { user } = await authenticateRequest(request);
    userId = user.id;
  } catch (error) {
    const status = error instanceof Error && 'status' in error ? (error as { status?: number }).status ?? 401 : 401;
    const message = error instanceof Error ? error.message : 'Unauthorized.';
    return NextResponse.json({ error: message }, { status });
  }

  const rateLimit = checkRateLimit(userId, 'api/categories/POST', { maxRequests: 20 });
  if (!rateLimit.allowed) {
    return NextResponse.json(
      { error: 'Too many requests. Please wait before creating more categories.' },
      { status: 429, headers: rateLimitHeaders(20, rateLimit) },
    );
  }

  let body: unknown;

  try {
    body = await request.json();
  } catch (error) {
    return NextResponse.json({ error: 'Invalid JSON body.' }, { status: 400 });
  }

  if (typeof body !== 'object' || body === null) {
    return NextResponse.json({ error: 'Invalid request payload.' }, { status: 400 });
  }

  const { name, color } = body as { name?: unknown; color?: unknown };

  if (typeof name !== 'string' || !name.trim()) {
    return NextResponse.json({ error: 'Category name is required.' }, { status: 400 });
  }

  if (name.trim().length > MAX_NAME_LENGTH) {
    return NextResponse.json({ error: `Category name must be ${MAX_NAME_LENGTH} characters or fewer.` }, { status: 400 });
  }

  if (typeof color !== 'string' || !color.trim()) {
    return NextResponse.json({ error: 'Category color is required.' }, { status: 400 });
  }

  if (color.trim().length > MAX_COLOR_LENGTH) {
    return NextResponse.json({ error: `Category color must be ${MAX_COLOR_LENGTH} characters or fewer.` }, { status: 400 });
  }

  try {
    const { data, error } = await withTimeout(
      supabaseAdmin
        .from('categories')
        .insert({
          name: name.trim(),
          color: color.trim(),
          user_id: userId,
        })
        .select()
        .single(),
      QUERY_TIMEOUT_MS,
    );

    if (error) {
      return NextResponse.json(
        { error: 'Unable to save category. Please try again.' },
        { status: 400 },
      );
    }

    return NextResponse.json({ category: data }, { status: 201 });
  } catch (err) {
    if (err instanceof TimeoutError) {
      return NextResponse.json({ error: 'Request timed out. Please try again.' }, { status: 504 });
    }
    return NextResponse.json({ error: 'An unexpected error occurred.' }, { status: 500 });
  }
}
