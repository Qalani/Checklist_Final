import { NextResponse } from 'next/server';
import { authenticateRequest, AuthError } from '@/lib/api/supabase-admin';
import { ensureFriendCodeForUser } from '../shared';

export async function POST(request: Request) {
  try {
    const { user } = await authenticateRequest(request);
    const friendCode = await ensureFriendCodeForUser(user.id);

    return NextResponse.json({ friendCode });
  } catch (error) {
    if (error instanceof AuthError) {
      return NextResponse.json({ error: error.message }, { status: error.status });
    }

    console.error('Failed to ensure friend identity', error);
    return NextResponse.json({ error: 'Unable to generate a friend code.' }, { status: 500 });
  }
}
