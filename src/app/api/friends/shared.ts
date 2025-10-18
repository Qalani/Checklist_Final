import { randomInt } from 'crypto';
import { supabaseAdmin } from '@/lib/api/supabase-admin';
import type { PostgrestError } from '@supabase/supabase-js';

export interface ProfileRecord {
  id: string;
  email: string | null;
  raw_user_meta_data: Record<string, unknown> | null;
}

export interface ProfileSummary {
  id: string;
  email: string | null;
  name: string | null;
}

interface FriendCodeRecord {
  code: string;
}

const FRIEND_CODE_ALPHABET = 'ABCDEFGHJKLMNPQRSTUVWXYZ23456789';
const FRIEND_CODE_LENGTH = 8;
const FRIEND_CODE_MAX_ATTEMPTS = 12;

export function resolveDisplayName(profile: ProfileRecord | undefined): string | null {
  if (!profile) return null;

  const metadata = profile.raw_user_meta_data ?? {};

  if (metadata && typeof metadata === 'object') {
    const fullName = (metadata as { full_name?: unknown }).full_name;
    if (typeof fullName === 'string' && fullName.trim()) {
      return fullName;
    }

    const name = (metadata as { name?: unknown }).name;
    if (typeof name === 'string' && name.trim()) {
      return name;
    }
  }

  return null;
}

export async function fetchProfileSummaries(userIds: string[]): Promise<ProfileSummary[]> {
  if (!supabaseAdmin) {
    throw new Error('Supabase is not configured on the server.');
  }

  if (!userIds.length) {
    return [];
  }

  const { data, error } = await supabaseAdmin
    .schema('auth')
    .from('users')
    .select('id, email, raw_user_meta_data')
    .in('id', userIds)
    .returns<ProfileRecord[]>();

  if (error) {
    throw error;
  }

  const records = Array.isArray(data) ? data : [];

  return records.map((record) => ({
    id: record.id,
    email: record.email,
    name: resolveDisplayName(record),
  } satisfies ProfileSummary));
}

function generateFriendCode(): string {
  let code = '';
  for (let index = 0; index < FRIEND_CODE_LENGTH; index += 1) {
    const charIndex = randomInt(0, FRIEND_CODE_ALPHABET.length);
    code += FRIEND_CODE_ALPHABET[charIndex];
  }
  return code;
}

async function fetchExistingFriendCode(userId: string): Promise<string | null> {
  if (!supabaseAdmin) {
    throw new Error('Supabase is not configured on the server.');
  }

  const { data, error } = await supabaseAdmin
    .from('friend_codes')
    .select('code')
    .eq('user_id', userId)
    .maybeSingle<FriendCodeRecord>();

  if (error && error.code !== 'PGRST116') {
    throw error;
  }

  return data?.code ?? null;
}

function isUniqueViolation(error: unknown): error is PostgrestError {
  if (!error || typeof error !== 'object') {
    return false;
  }

  const candidate = error as PostgrestError & { message?: string };
  if (candidate.code === '23505') {
    return true;
  }

  const message = candidate.message ?? candidate.details ?? '';
  return typeof message === 'string' && message.includes('duplicate key value violates');
}

async function tryInsertFriendCode(userId: string, candidate: string): Promise<string | null> {
  if (!supabaseAdmin) {
    throw new Error('Supabase is not configured on the server.');
  }

  const { data, error } = await supabaseAdmin
    .from('friend_codes')
    .insert({
      user_id: userId,
      code: candidate,
    })
    .select('code')
    .single<FriendCodeRecord>();

  if (!error && data?.code) {
    return data.code;
  }

  if (error && isUniqueViolation(error)) {
    return null;
  }

  if (error) {
    throw error;
  }

  return null;
}

function shouldFallbackForEnsureFriendCodeError(error: PostgrestError): boolean {
  if (error.code === '42883') {
    return true;
  }

  if (error.code === '42501') {
    return true;
  }

  const haystack = `${error.message ?? ''} ${error.details ?? ''} ${error.hint ?? ''}`.toLowerCase();

  if (haystack.includes('ensure_friend_code') && haystack.includes('does not exist')) {
    return true;
  }

  if (haystack.includes('row level security') || haystack.includes('permission denied')) {
    return true;
  }

  return false;
}

async function ensureFriendCodeViaRpc(userId: string): Promise<string | null> {
  if (!supabaseAdmin) {
    throw new Error('Supabase is not configured on the server.');
  }

  const { data, error } = await supabaseAdmin.rpc('ensure_friend_code', {
    target_user_id: userId,
  });

  if (error) {
    if (shouldFallbackForEnsureFriendCodeError(error)) {
      return null;
    }

    throw error;
  }

  return typeof data === 'string' && data.trim() ? data : null;
}

async function ensureFriendCodeWithFallback(userId: string): Promise<string> {
  const existing = await fetchExistingFriendCode(userId);
  if (existing) {
    return existing;
  }

  for (let attempt = 0; attempt < FRIEND_CODE_MAX_ATTEMPTS; attempt += 1) {
    const candidate = generateFriendCode();
    const inserted = await tryInsertFriendCode(userId, candidate);

    if (inserted) {
      return inserted;
    }

    const refreshed = await fetchExistingFriendCode(userId);
    if (refreshed) {
      return refreshed;
    }
  }

  const finalCheck = await fetchExistingFriendCode(userId);
  if (finalCheck) {
    return finalCheck;
  }

  throw new Error('Unable to generate a unique friend code at this time.');
}

export async function ensureFriendCodeForUser(userId: string): Promise<string> {
  if (!supabaseAdmin) {
    throw new Error('Supabase is not configured on the server.');
  }

  const ensured = await ensureFriendCodeViaRpc(userId);
  if (ensured) {
    return ensured;
  }

  return ensureFriendCodeWithFallback(userId);
}
