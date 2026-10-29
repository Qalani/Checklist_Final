import { readFileSync } from 'fs';
import { join } from 'path';
import { runInNewContext } from 'vm';

describe('production service worker', () => {
  const source = readFileSync(join(process.cwd(), 'public/service-worker.js'), 'utf8');
  const origin = 'https://zen.example';
  const assets = ['/', '/tasks', '/notes', '/_next/static/chunks/notes.js', '/_next/static/media/font.woff2'];

  function loadWorker() {
    const handlers: Record<string, (event: any) => void> = {};
    const entries = new Map<string, any>();
    const key = (request: string | { url: string }) => typeof request === 'string' ? new URL(request, origin).href : request.url;
    const cacheMatch = jest.fn(async (request) => entries.get(key(request)));
    const cacheAddAll = jest.fn(async (paths: string[]) => {
      for (const path of paths) entries.set(key(path), { status: 200, url: key(path), headers: { get: () => path.endsWith('.js') ? 'text/javascript' : 'text/html' } });
    });
    const cache = { match: cacheMatch, addAll: cacheAddAll };
    const cacheOpen = jest.fn().mockResolvedValue(cache);
    const cacheDelete = jest.fn().mockResolvedValue(true);
    const fetch = jest.fn().mockRejectedValue(new TypeError('Failed to fetch'));
    const skipWaiting = jest.fn();
    const claim = jest.fn().mockResolvedValue(undefined);
    const self: any = {
      location: { origin },
      clients: { claim, matchAll: jest.fn().mockResolvedValue([]) },
      skipWaiting,
      addEventListener: (type: string, handler: any) => { handlers[type] = handler; },
    };
    runInNewContext(source, {
      self,
      importScripts: () => { self.__ZEN_PRECACHE = { version: 'new-build', assets, routes: ['/', '/tasks', '/notes'] }; },
      caches: { open: cacheOpen, keys: jest.fn().mockResolvedValue(['zen-workspace-cache-v5', 'zen-api-cache-v1', 'unrelated-cache']), delete: cacheDelete },
      fetch,
      URL,
      Response: class { constructor(public body: string, public options: any) {} },
    });
    const request = (path: string, headers: Record<string, string> = {}) => ({ method: 'GET', url: new URL(path, origin).href, headers: { get: (name: string) => headers[name] ?? '' } });
    async function dispatch(type: string, event: any = {}) {
      let promise: Promise<any> | undefined;
      handlers[type]({ ...event, waitUntil: (value: Promise<any>) => { promise = value; }, respondWith: (value: Promise<any>) => { promise = value; } });
      return promise;
    }
    return { handlers, request, dispatch, cacheMatch, cacheAddAll, cacheOpen, cacheDelete, fetch, skipWaiting };
  }

  it.each(['/api/health', '/api/health?check=1', '/api/tasks', '/api/categories', 'https://example.supabase.co/rest/v1/tasks', '/lists/share/private-token'])('leaves %s outside the app-shell cache', async (path) => {
    const worker = loadWorker();
    expect(await worker.dispatch('fetch', { request: worker.request(path) })).toBeUndefined();
    expect(worker.cacheMatch).not.toHaveBeenCalled();
    expect(worker.fetch).not.toHaveBeenCalled();
  });

  it('installs every route and its unvisited lazy chunks before becoming usable offline', async () => {
    const worker = loadWorker();
    await worker.dispatch('install');
    expect(worker.cacheAddAll).toHaveBeenCalledWith(assets);
    expect(worker.skipWaiting).not.toHaveBeenCalled();
    const page = await worker.dispatch('fetch', { request: worker.request('/notes') });
    expect(page.url).toBe(origin + '/notes');
    const chunk = await worker.dispatch('fetch', { request: worker.request('/_next/static/chunks/notes.js') });
    expect(chunk.headers.get('content-type')).toBe('text/javascript');
    // The route is fetched from network once, while the chunk is cache-only.
    expect(worker.fetch).toHaveBeenCalledTimes(1);
  });

  it('returns cached HTML for an offline RSC request so Next performs a full route navigation', async () => {
    const worker = loadWorker();
    await worker.dispatch('install');
    const response = await worker.dispatch('fetch', { request: worker.request('/notes?_rsc=router-tree-specific', { RSC: '1' }) });
    expect(response.headers.get('content-type')).toBe('text/html');
    expect(response.url).toBe(origin + '/notes');
  });

  it('rejects installation if any required asset fails, preserving the previous worker', async () => {
    const worker = loadWorker();
    worker.cacheAddAll.mockRejectedValueOnce(new Error('missing chunk'));
    await expect(worker.dispatch('install')).rejects.toThrow('missing chunk');
    expect(worker.skipWaiting).not.toHaveBeenCalled();
  });

  it('purges the old authenticated API cache without deleting other applications caches', async () => {
    const worker = loadWorker();
    await worker.dispatch('activate');
    expect(worker.cacheDelete.mock.calls).toEqual([['zen-workspace-cache-v5'], ['zen-api-cache-v1']]);
  });

  it('keeps background sync pending when no authenticated app page is open', async () => {
    const worker = loadWorker();
    await expect(worker.dispatch('sync', { tag: 'zen-sync' })).rejects.toThrow('Open Zen Workspace to sync');
  });
});
