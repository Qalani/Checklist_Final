import type { BrowserContext } from '@playwright/test';

// Isolated browser fixture; requests never reach a real account.
const ORIGIN = 'https://calendar-test.supabase.co';
const USER_ID = '11111111-1111-4111-8111-111111111111';

export async function installMobileAccount(context: BrowserContext) {
  const records = new Map<string, Record<string, unknown>[]>();
  const writes: { table: string; method: string; body: Record<string, unknown> }[] = [];
  const user = {
    id: USER_ID, aud: 'authenticated', role: 'authenticated',
    email: 'offline-test@example.invalid', app_metadata: { provider: 'email' },
    user_metadata: {}, identities: [], created_at: '2026-01-01T00:00:00Z',
  };
  const expiresAt = Math.floor(Date.now() / 1000) + 86_400;
  const encode = (value: unknown) => Buffer.from(JSON.stringify(value)).toString('base64url');
  const token = `${encode({ alg: 'HS256', typ: 'JWT' })}.${encode({ sub: USER_ID, role: 'authenticated', aud: 'authenticated', exp: expiresAt })}.isolated-test-signature`;
  const session = { access_token: token, refresh_token: 'isolated-offline-test', token_type: 'bearer', expires_in: 86_400, expires_at: expiresAt, user };
  await context.addInitScript((value) => {
    localStorage.setItem('sb-calendar-test-auth-token', JSON.stringify(value));
  }, session);
  await context.routeWebSocket(/wss:\/\/[^/]+\.supabase\.co\//, (socket) => socket.close());
  await context.route(/^https:\/\/[^/]+\.supabase\.co\//, (route) => {
    const request = route.request();
    const url = new URL(request.url());
    if (url.origin !== ORIGIN) return route.abort('blockedbyclient');
    let table = url.pathname.split('/').pop() ?? '';
    if (table === 'get_tasks_with_access') table = 'tasks';
    const method = request.method();
    let data: unknown = [];
    if (url.pathname.startsWith('/auth/')) data = url.pathname.endsWith('/user') ? user : session;
    else if (url.pathname.startsWith('/rest/') && method !== 'OPTIONS') {
      const rows = records.get(table) ?? [];
      const id = url.searchParams.get('id')?.replace(/^eq\./, '');
      if (method === 'GET' || table === 'tasks' && url.pathname.includes('/rpc/')) data = rows.filter((row) => !id || row.id === id);
      else {
        const body = request.postDataJSON() as Record<string, unknown>;
        writes.push({ table, method, body });
        if (method === 'POST') {
          const existing = rows.find((row) => row.id === body.id);
          if (existing) Object.assign(existing, body);
          else rows.push(body);
          data = [body];
        } else if (method === 'PATCH') {
          const row = rows.find((value) => value.id === id);
          if (row) Object.assign(row, body);
          data = row ? [row] : [];
        } else if (method === 'DELETE') {
          records.set(table, rows.filter((row) => row.id !== id));
        }
        if (method !== 'DELETE') records.set(table, rows);
      }
    }
    if (request.headers().accept?.includes('vnd.pgrst.object+json') && Array.isArray(data)) data = data[0] ?? null;
    return route.fulfill({
      status: 200,
      headers: { 'access-control-allow-origin': '*', 'access-control-allow-headers': '*' },
      contentType: 'application/json',
      body: JSON.stringify(data),
    });
  });
  return { writes, records };
}

