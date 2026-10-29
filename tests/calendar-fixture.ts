import { randomUUID } from 'node:crypto';
import { test as base, expect } from '@playwright/test';

export const TEST_USER_ID = '11111111-1111-4111-8111-111111111111';
export const TEST_DATE = '2026-10-29';
export const SUPABASE_TEST_ORIGIN = 'https://calendar-test.supabase.co';

export interface CalendarRow {
  id: string;
  user_id: string;
  title: string;
  description?: string | null;
  location?: string | null;
  start_time: string;
  end_time: string;
  all_day: boolean;
  import_source?: string | null;
  import_uid?: string | null;
  created_at?: string;
  updated_at?: string;
}

export interface CalendarApi {
  events: CalendarRow[];
  tasks: Record<string, unknown>[];
  sharedTasks: Record<string, unknown>[];
  notes: Record<string, unknown>[];
  reminders: Record<string, unknown>[];
  writes: { method: string; table: string; body: unknown }[];
  failNextWrite?: { message: string; status?: number };
  pageErrors: string[];
}

/**
 * This is a fully isolated Supabase double. Every Supabase HTTP request and
 * websocket is intercepted before navigation, and any unexpected real project
 * origin is aborted. No credentials or production records are used.
 */
export const test = base.extend<{ calendarApi: CalendarApi; calendarOnline: boolean }>({
  calendarOnline: [true, { option: true }],
  calendarApi: async ({ context, page, calendarOnline }, use) => {
    const api: CalendarApi = { events: [], tasks: [], sharedTasks: [], notes: [], reminders: [], writes: [], pageErrors: [] };
    page.on('pageerror', (error) => api.pageErrors.push(error.message));
    page.on('console', (message) => {
      if (message.type() === 'error' && /hydration|hydrated|server.rendered/i.test(message.text())) api.pageErrors.push(message.text());
    });
    const user = {
      id: TEST_USER_ID,
      aud: 'authenticated',
      role: 'authenticated',
      email: 'calendar-test@example.invalid',
      email_confirmed_at: '2026-01-01T00:00:00Z',
      app_metadata: { provider: 'email', providers: ['email'] },
      user_metadata: {},
      identities: [],
      created_at: '2026-01-01T00:00:00Z',
      updated_at: '2026-01-01T00:00:00Z',
    };
    const expiresAt = 1_893_456_000; // 2030-01-01: no refresh required in a test.
    const encode = (value: unknown) => Buffer.from(JSON.stringify(value)).toString('base64url');
    const accessToken = `${encode({ alg: 'HS256', typ: 'JWT' })}.${encode({ sub: TEST_USER_ID, role: 'authenticated', aud: 'authenticated', exp: expiresAt })}.dummy-test-signature`;
    const session = { access_token: accessToken, refresh_token: 'calendar-test-refresh-token', token_type: 'bearer', expires_in: 3600, expires_at: expiresAt, user };

    await context.setOffline(false);
    await context.addInitScript(({ authSession, online }) => {
      localStorage.setItem('sb-calendar-test-auth-token', JSON.stringify(authSession));
      Object.defineProperty(Navigator.prototype, 'onLine', { configurable: true, get: () => online });
    }, { authSession: session, online: calendarOnline });
    await page.clock.install({ time: new Date(`${TEST_DATE}T11:00:00Z`) });

    await context.route('**/api/health', (route) => route.fulfill({
      status: 200, contentType: 'application/json', body: JSON.stringify({ healthy: true }),
    }));

    await context.routeWebSocket(/wss:\/\/[^/]+\.supabase\.co\//, (socket) => socket.close());
    await context.route(/^https:\/\/[^/]+\.supabase\.co\//, async (route) => {
      const request = route.request();
      const url = new URL(request.url());
      if (url.origin !== SUPABASE_TEST_ORIGIN) {
        await route.abort('blockedbyclient');
        return;
      }
      const headers = {
        'access-control-allow-origin': '*',
        'access-control-allow-headers': '*',
        'access-control-allow-methods': 'GET, POST, PATCH, DELETE, OPTIONS',
        'content-type': 'application/json',
      };
      const reply = (data: unknown, status = 200) => route.fulfill({ status, headers, body: JSON.stringify(data) });
      if (request.method() === 'OPTIONS') { await reply(null); return; }
      if (url.pathname.startsWith('/auth/v1/')) {
        await reply(url.pathname.endsWith('/user') ? user : session);
        return;
      }
      if (!url.pathname.startsWith('/rest/v1/')) { await reply({}); return; }

      const table = url.pathname.split('/')[3];
      const method = request.method();
      const objectResult = request.headers().accept?.includes('vnd.pgrst.object+json');
      const result = (rows: unknown[]) => objectResult ? rows[0] ?? null : rows;
      const requestedId = url.searchParams.get('id')?.replace(/^eq\./, '');
      const requestedOwner = url.searchParams.get('user_id')?.replace(/^eq\./, '');
      const matches = (row: CalendarRow) => (!requestedId || row.id === requestedId) && (!requestedOwner || row.user_id === requestedOwner);

      if (table === 'calendar_events') {
        if (method === 'GET') { await reply(result(api.events.filter(matches))); return; }
        const body = request.postDataJSON() as Record<string, unknown> | Record<string, unknown>[] | null;
        api.writes.push({ method, table, body });
        if (api.failNextWrite) {
          const failure = api.failNextWrite;
          api.failNextWrite = undefined;
          await reply({ message: failure.message, code: 'TEST_FAILURE', details: null, hint: null }, failure.status ?? 503);
          return;
        }
        if (method === 'POST') {
          const rows = (Array.isArray(body) ? body : [body]).map((input) => ({
            id: randomUUID(), user_id: TEST_USER_ID, description: null, location: null,
            import_source: null, import_uid: null, created_at: new Date().toISOString(), updated_at: new Date().toISOString(),
            ...input,
          } as CalendarRow));
          rows.forEach((row) => {
            const index = api.events.findIndex((existing) => existing.id === row.id);
            if (index === -1) api.events.push(row); else api.events[index] = row;
          });
          await reply(result(rows), 201); return;
        }
        if (method === 'PATCH') {
          const rows = api.events.filter(matches);
          rows.forEach((row) => Object.assign(row, body, { updated_at: new Date().toISOString() }));
          await reply(result(rows)); return;
        }
        if (method === 'DELETE') {
          const rows = api.events.filter(matches);
          api.events = api.events.filter((row) => !matches(row));
          await reply(result(rows)); return;
        }
      }

      if (method === 'GET') {
        const rows = table === 'tasks' ? api.tasks : table === 'task_collaborators' ? api.sharedTasks : table === 'notes' ? api.notes : table === 'zen_reminders' ? api.reminders : [];
        await reply(result(rows)); return;
      }
      await reply([]);
    });

    await use(api);
    expect(api.pageErrors, 'No runtime or hydration errors should occur in the calendar').toEqual([]);
  },
});

export { expect };
