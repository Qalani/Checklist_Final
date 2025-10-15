import { NextResponse } from 'next/server';
import { createClient } from '@supabase/supabase-js';

const supabaseUrl = process.env.NEXT_PUBLIC_SUPABASE_URL;
const serviceRoleKey = process.env.SUPABASE_SERVICE_ROLE_KEY;

const supabaseAdmin =
  supabaseUrl && serviceRoleKey
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

  const {
    title,
    description,
    priority,
    category,
    category_color: categoryColor,
    order,
    completed,
  } = body as {
    title?: unknown;
    description?: unknown;
    priority?: unknown;
    category?: unknown;
    category_color?: unknown;
    order?: unknown;
    completed?: unknown;
  };

  if (typeof title !== 'string' || !title.trim()) {
    return NextResponse.json({ error: 'Task title is required.' }, { status: 400 });
  }

  if (typeof priority !== 'string' || !['low', 'medium', 'high'].includes(priority)) {
    return NextResponse.json({ error: 'Priority must be low, medium, or high.' }, { status: 400 });
  }

  if (typeof category !== 'string' || !category.trim()) {
    return NextResponse.json({ error: 'Category is required.' }, { status: 400 });
  }

  if (typeof categoryColor !== 'string' || !categoryColor.trim()) {
    return NextResponse.json({ error: 'Category color is required.' }, { status: 400 });
  }

  if (typeof order !== 'number' || !Number.isInteger(order) || order < 0) {
    return NextResponse.json({ error: 'Order must be a non-negative integer.' }, { status: 400 });
  }

  const normalizedDescription =
    typeof description === 'string' && description.trim().length > 0 ? description.trim() : null;
  const normalizedCompleted = typeof completed === 'boolean' ? completed : false;

  const { data, error } = await supabaseAdmin
    .from('tasks')
    .insert({
      title: title.trim(),
      description: normalizedDescription,
      priority,
      category: category.trim(),
      category_color: categoryColor.trim(),
      order,
      completed: normalizedCompleted,
      user_id: userResult.user.id,
    })
    .select()
    .single();

  if (error) {
    return NextResponse.json(
      { error: error.message || 'Unable to save task. Please try again.' },
      { status: 400 },
    );
  }

  return NextResponse.json({ task: data }, { status: 201 });
}
