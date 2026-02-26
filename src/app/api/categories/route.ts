import { NextResponse } from 'next/server';
import { authenticateRequest, supabaseAdmin } from '@/lib/api/supabase-admin';
import { checkRateLimit, rateLimitHeaders } from '@/lib/rate-limiter';

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

  if (typeof color !== 'string' || !color.trim()) {
    return NextResponse.json({ error: 'Category color is required.' }, { status: 400 });
  }

  const { data, error } = await supabaseAdmin
    .from('categories')
    .insert({
      name: name.trim(),
      color: color.trim(),
      user_id: userId,
    })
    .select()
    .single();

  if (error) {
    return NextResponse.json(
      { error: error.message || 'Unable to save category. Please try again.' },
      { status: 400 },
    );
  }

  return NextResponse.json({ category: data }, { status: 201 });
}
