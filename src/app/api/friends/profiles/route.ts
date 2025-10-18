import { NextResponse } from 'next/server';
import { authenticateRequest, AuthError } from '@/lib/api/supabase-admin';
import { fetchProfileSummaries } from '../shared';

type RequestBody = {
  ids?: unknown;
};

export async function POST(request: Request) {
  try {
    const { user } = await authenticateRequest(request);
    const body = (await request.json().catch(() => ({}))) as RequestBody;
    const rawIds = Array.isArray(body.ids) ? body.ids : [];

    const sanitized = rawIds
      .map((value) => (typeof value === 'string' ? value.trim() : ''))
      .filter((value) => value && value !== user.id);

    const uniqueIds = Array.from(new Set(sanitized));

    if (!uniqueIds.length) {
      return NextResponse.json({ profiles: [] });
    }

    const profiles = await fetchProfileSummaries(uniqueIds);

    return NextResponse.json({ profiles });
  } catch (error) {
    if (error instanceof AuthError) {
      return NextResponse.json({ error: error.message }, { status: error.status });
    }

    console.error('Failed to load friend profiles', error);
    return NextResponse.json({ error: 'Unable to load friend profiles.' }, { status: 500 });
  }
}
