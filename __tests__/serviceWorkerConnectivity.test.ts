import { readFileSync } from 'fs';
import { join } from 'path';
import { runInNewContext } from 'vm';

describe('service worker connectivity probes', () => {
  const source = readFileSync(join(process.cwd(), 'public/service-worker.js'), 'utf8');

  function loadWorker() {
    let handleFetch!: (event: {
      request: { method: string; url: string; mode: string; headers: { get: () => string } };
      respondWith: jest.Mock;
    }) => void;
    const cacheMatch = jest.fn().mockResolvedValue({ status: 200, body: 'cached app asset' });
    const fetch = jest.fn().mockRejectedValue(new TypeError('Failed to fetch'));
    runInNewContext(source, {
      self: {
        addEventListener: (type: string, handler: typeof handleFetch) => {
          if (type === 'fetch') handleFetch = handler;
        },
      },
      caches: { match: cacheMatch },
      fetch,
      URL,
    });
    return { handleFetch, cacheMatch, fetch };
  }

  it.each([
    ['/api/health', 'cors', '*/*'],
    ['/api/health?check=1', 'cors', '*/*'],
    ['/api/health', 'navigate', 'text/html'],
  ])('leaves %s to the browser network instead of an offline fallback', (path, mode, accept) => {
    const worker = loadWorker();
    const respondWith = jest.fn();
    worker.handleFetch({
      request: {
        method: 'GET',
        url: `https://zen.example${path}`,
        mode,
        headers: { get: () => accept },
      },
      respondWith,
    });

    expect(respondWith).not.toHaveBeenCalled();
    expect(worker.cacheMatch).not.toHaveBeenCalled();
    expect(worker.fetch).not.toHaveBeenCalled();
  });

  it('continues handling cached app assets while exempting only the probe route', async () => {
    const worker = loadWorker();
    const respondWith = jest.fn();
    worker.handleFetch({
      request: {
        method: 'GET',
        url: 'https://zen.example/icon.png',
        mode: 'cors',
        headers: { get: () => '*/*' },
      },
      respondWith,
    });

    expect(respondWith).toHaveBeenCalledTimes(1);
    expect(worker.cacheMatch).toHaveBeenCalledTimes(1);
    expect(await respondWith.mock.calls[0][0]).toEqual({ status: 200, body: 'cached app asset' });
  });
});
