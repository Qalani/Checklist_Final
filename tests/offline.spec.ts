import { expect, test, type Page, type BrowserContext } from '@playwright/test';

// This suite uses a production worker and real HTTP/browser caches. The only
// mocked service is the isolated Supabase origin; no project data is touched.
const ORIGIN = 'https://calendar-test.supabase.co';
const USER_ID = '11111111-1111-4111-8111-111111111111';

async function installOfflineAccount(context: BrowserContext) {
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

async function localRows(page: Page, table: string): Promise<Record<string, unknown>[]> {
  return page.evaluate((name) => new Promise<Record<string, unknown>[]>((resolve, reject) => {
    const request = indexedDB.open('zen-workspace-db');
    request.onerror = () => reject(request.error);
    request.onsuccess = () => {
      const database = request.result;
      const rows = database.transaction(name).objectStore(name).getAll();
      rows.onsuccess = () => { resolve(rows.result); database.close(); };
      rows.onerror = () => reject(rows.error);
    };
  }), table);
}

async function chooseRoute(page: Page, label: string) {
  const link = page.getByRole('link', { name: label, exact: true });
  // Lists lives in the overflow navigation on a phone.
  if (!(await link.filter({ visible: true }).count())) {
    await page.getByRole('button', { name: 'More navigation' }).click();
  }
  await link.filter({ visible: true }).first().click();
}

test('opens unvisited workspace routes and reloads with the network disabled', async ({ page, context }) => {
  const api = await installOfflineAccount(context);
  const errors: string[] = [];
  const chunkFailures: string[] = [];
  page.on('pageerror', (error) => errors.push(error.message));
  page.on('requestfailed', (request) => {
    if (request.url().includes('/_next/static/')) chunkFailures.push(request.url());
  });

  await page.goto('/');
  await expect(page.getByRole('heading', { name: 'Find clarity in your day' })).toBeVisible();
  await page.evaluate(async () => {
    await navigator.serviceWorker.ready;
    if (!navigator.serviceWorker.controller) {
      await new Promise<void>((resolve) => navigator.serviceWorker.addEventListener('controllerchange', () => resolve(), { once: true }));
    }
  });
  // No feature page has been opened. Its assets must already exist in the
  // worker cache, rather than depending on a previous route visit.
  const cachedPaths = await page.evaluate(async () => {
    const names = await caches.keys();
    const cache = await caches.open(names.find((name) => name.startsWith('zen-workspace-cache-'))!);
    return (await cache.keys()).map((request) => new URL(request.url).pathname);
  });
  expect(cachedPaths).toEqual(expect.arrayContaining(['/calendar', '/notes', '/lists']));
  expect(cachedPaths.some((path) => /\/_next\/static\/chunks\/app\/calendar\/page-.*\.js/.test(path))).toBe(true);

  await context.setOffline(true);
  await page.evaluate(() => window.dispatchEvent(new Event('offline')));
  await expect(page.getByText('You’re offline', { exact: true })).toBeVisible();

  for (const [label, pathname, heading] of [
    ['Calendar', '/calendar', 'Calendar'],
    ['Notes', '/notes', 'Zen Notes'],
    ['Lists', '/lists', 'Zen Lists'],
  ]) {
    await chooseRoute(page, label);
    await expect(page).toHaveURL(new RegExp(`${pathname}$`));
    await expect(page.getByRole('heading', { name: heading, exact: true })).toBeVisible();
    await page.reload();
    await expect(page.getByRole('heading', { name: heading, exact: true })).toBeVisible();
    // Confirms hydration and interactive code loaded, not just static HTML.
    if (pathname === '/calendar') {
      await page.getByRole('button', { name: 'New event', exact: true }).click();
      await expect(page.getByRole('dialog')).toBeVisible();
      await page.getByRole('button', { name: 'Cancel', exact: true }).click();
    } else {
      await page.locator('button[aria-haspopup="dialog"]').filter({ visible: true }).first().click();
      await expect(page.getByText('Light themes', { exact: true })).toBeVisible();
      await page.keyboard.press('Escape');
    }
  }
  await chooseRoute(page, 'Notes');
  await page.getByRole('button', { name: 'New document', exact: true }).click();
  await page.getByPlaceholder('Untitled document', { exact: true }).fill('Written in airplane mode');
  await page.getByRole('button', { name: 'Save now', exact: true }).click();
  await expect.poll(async () => (await localRows(page, 'notes')).some((row) => row.title === 'Written in airplane mode')).toBe(true);
  await expect(page.getByRole('button', { name: 'Save now', exact: true })).toBeDisabled();
  const savedQueueIds = (await localRows(page, 'sync_queue')).map((row) => row.id);
  // Wait beyond the autosave debounce: an idle saved editor must not enqueue
  // the same change repeatedly just because save-status timers rerender it.
  await page.waitForTimeout(1_500);
  expect((await localRows(page, 'sync_queue')).map((row) => row.id)).toEqual(savedQueueIds);
  await page.reload();
  await expect(page.getByPlaceholder('Untitled document', { exact: true })).toHaveValue('Written in airplane mode');

  await chooseRoute(page, 'Tasks');
  await page.getByRole('button', { name: 'New Task', exact: true }).click();
  await page.getByPlaceholder('What needs to be done?').fill('Created in airplane mode');
  await page.getByPlaceholder('e.g. Wellness').fill('Offline category');
  await page.getByRole('button', { name: 'Create Category', exact: true }).click();
  await page.getByRole('button', { name: 'Save Task', exact: true }).click();
  await expect(page.getByText('Created in airplane mode', { exact: true })).toBeVisible();
  await page.reload();
  await expect(page.getByText('Created in airplane mode', { exact: true })).toBeVisible();

  await context.setOffline(false);
  await page.evaluate(() => window.dispatchEvent(new Event('online')));
  await expect(page.getByText('You’re offline', { exact: true })).toHaveCount(0);
  await expect.poll(() => api.writes.some((write) => write.table === 'tasks' && write.body.title === 'Created in airplane mode')).toBe(true);
  await expect.poll(() => api.writes.some((write) => write.table === 'notes' && write.body.title === 'Written in airplane mode')).toBe(true);
  await expect.poll(async () => (await localRows(page, 'sync_queue')).length).toBe(0);
  expect(api.writes.filter((write) => write.table === 'tasks' && write.method === 'POST')).toHaveLength(1);
  expect(api.writes.find((write) => write.table === 'tasks')?.body).not.toHaveProperty('access_role');
  expect(chunkFailures).toEqual([]);
  expect(errors).toEqual([]);
});
