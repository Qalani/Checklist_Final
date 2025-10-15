import { NextResponse } from 'next/server';
import { createClient } from '@supabase/supabase-js';

const supabaseUrl = process.env.NEXT_PUBLIC_SUPABASE_URL;
const serviceRoleKey = process.env.SUPABASE_SERVICE_ROLE_KEY;

const supabaseAdmin = supabaseUrl && serviceRoleKey
  ? createClient(supabaseUrl, serviceRoleKey, {
      auth: {
        persistSession: false,
        autoRefreshToken: false,
      },
    })
  : null;

export async function POST(request: Request) {
  if (!supabaseAdmin) {
    return NextResponse.json({ error: 'Supabase is not configured on the server.' }, { status: 500 });
  }

  const authorization = request.headers.get('authorization') || request.headers.get('Authorization');

  if (!authorization?.startsWith('Bearer ')) {
    return NextResponse.json({ error: 'Missing access token.' }, { status: 401 });
  }

  const accessToken = authorization.slice('Bearer '.length);
  const { data: userResult, error: userError } = await supabaseAdmin.auth.getUser(accessToken);

  if (userError || !userResult.user) {
    return NextResponse.json({ error: 'Invalid access token.' }, { status: 401 });
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
      user_id: userResult.user.id,
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
