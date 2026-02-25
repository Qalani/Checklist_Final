import { createClient } from '@supabase/supabase-js';

// Fall back to placeholder values so the module loads without throwing during
// static export / SSR prerendering when env vars are not set (e.g. CI builds).
// API calls will fail gracefully at runtime if real credentials are absent.
const supabaseUrl = process.env.NEXT_PUBLIC_SUPABASE_URL || 'https://placeholder.supabase.co';
const supabaseAnonKey = process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY || 'placeholder-anon-key';

export const supabase = createClient(supabaseUrl, supabaseAnonKey);