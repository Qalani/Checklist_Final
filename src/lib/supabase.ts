import { createClient, SupabaseClient } from '@supabase/supabase-js';

const supabaseUrl = process.env.NEXT_PUBLIC_SUPABASE_URL ?? '';
const supabaseAnonKey = process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY ?? '';

const UNCONFIGURED_MSG = 'Supabase is not configured. Set NEXT_PUBLIC_SUPABASE_URL and NEXT_PUBLIC_SUPABASE_ANON_KEY.';

// Returns a recursive proxy where:
//  - property access returns another proxy (supports chaining like supabase.auth.getSession)
//  - function calls return a rejected Promise (async-safe, caught by .catch() handlers)
//  - onAuthStateChange returns a safe stub with an unsubscribe noop
// This prevents synchronous throws that would bypass Promise .catch() handlers.
function makeUnconfiguredProxy(): any {
  return new Proxy(
    function unconfigured() {
      return Promise.reject(new Error(UNCONFIGURED_MSG));
    },
    {
      get(_t, prop) {
        if (prop === 'then') return undefined; // not a thenable
        if (prop === 'onAuthStateChange') {
          return () => ({ data: { subscription: { unsubscribe: () => {} } } });
        }
        return makeUnconfiguredProxy();
      },
      apply() {
        return Promise.reject(new Error(UNCONFIGURED_MSG));
      },
    },
  );
}

// createClient throws when the URL is empty (e.g. during static-export
// prerendering with no env vars set). Defer construction so the module
// loads safely; all API calls will still fail with a clear error at runtime.
export const supabase: SupabaseClient = supabaseUrl && supabaseAnonKey
  ? createClient(supabaseUrl, supabaseAnonKey)
  : makeUnconfiguredProxy();
