type NetworkModule = typeof import('@/lib/network-status');

describe('verified network status', () => {
  let network: NetworkModule;
  let fetchMock: jest.Mock;
  let browserListeners: Array<[string, EventListenerOrEventListenerObject]>;
  let documentListeners: Array<[string, EventListenerOrEventListenerObject]>;
  let originalOnline: PropertyDescriptor | undefined;
  const originalFetch = global.fetch;
  const originalSupabaseUrl = process.env.NEXT_PUBLIC_SUPABASE_URL;
  const originalSupabaseKey = process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY;

  const settle = async () => {
    // Flush the request, publication, and retry scheduling microtasks.
    for (let i = 0; i < 8; i += 1) await Promise.resolve();
  };

  const setBrowserOnline = (value: boolean) => {
    Object.defineProperty(navigator, 'onLine', { configurable: true, value });
  };

  beforeEach(() => {
    jest.resetModules();
    delete process.env.NEXT_PUBLIC_SUPABASE_URL;
    delete process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY;
    jest.useFakeTimers();
    originalOnline = Object.getOwnPropertyDescriptor(navigator, 'onLine');
    setBrowserOnline(true);
    fetchMock = jest.fn().mockResolvedValue({ status: 200, ok: true });
    global.fetch = fetchMock;
    browserListeners = [];
    documentListeners = [];
    const addWindowListener = window.addEventListener.bind(window);
    const addDocumentListener = document.addEventListener.bind(document);
    jest.spyOn(window, 'addEventListener').mockImplementation((type, listener, options) => {
      browserListeners.push([type, listener]);
      addWindowListener(type, listener, options);
    });
    jest.spyOn(document, 'addEventListener').mockImplementation((type, listener, options) => {
      documentListeners.push([type, listener]);
      addDocumentListener(type, listener, options);
    });
    network = require('@/lib/network-status');
  });

  afterEach(() => {
    browserListeners.forEach(([type, listener]) => window.removeEventListener(type, listener));
    documentListeners.forEach(([type, listener]) => document.removeEventListener(type, listener));
    jest.clearAllTimers();
    jest.useRealTimers();
    jest.restoreAllMocks();
    global.fetch = originalFetch;
    if (originalSupabaseUrl === undefined) delete process.env.NEXT_PUBLIC_SUPABASE_URL;
    else process.env.NEXT_PUBLIC_SUPABASE_URL = originalSupabaseUrl;
    if (originalSupabaseKey === undefined) delete process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY;
    else process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY = originalSupabaseKey;
    if (originalOnline) Object.defineProperty(navigator, 'onLine', originalOnline);
    else delete (navigator as { onLine?: boolean }).onLine;
    delete (window as unknown as { Capacitor?: unknown }).Capacitor;
  });

  it('does not flash offline when the browser reports false but HTTP works', async () => {
    setBrowserOnline(false);
    const listener = jest.fn();
    network.onStatusChange(listener);

    expect(network.getOnlineSnapshot()).toBe(true);
    await settle();

    expect(network.isOnline()).toBe(true);
    expect(listener).not.toHaveBeenCalledWith(false);
    // The first verified success must notify the sync engine even though the
    // optimistic UI snapshot was already online.
    expect(listener).toHaveBeenCalledWith(true);
    expect(fetchMock).toHaveBeenCalledWith('/api/health', expect.objectContaining({ cache: 'no-store' }));
  });

  it('keeps offline cold-start data access local while the UI waits for verification', async () => {
    setBrowserOnline(false);
    fetchMock.mockRejectedValue(new TypeError('Failed to fetch'));
    network.onStatusChange(jest.fn());

    expect(network.isOnline()).toBe(false);
    expect(network.getOnlineSnapshot()).toBe(true);
    await settle();

    expect(network.isOnline()).toBe(false);
    expect(network.getOnlineSnapshot()).toBe(false);
  });

  it('publishes a genuine outage to every consumer after a failed probe', async () => {
    fetchMock.mockRejectedValue(new TypeError('Failed to fetch'));
    const ui = jest.fn();
    const sync = jest.fn();
    network.onStatusChange(ui);
    network.onStatusChange(sync);
    await settle();

    expect(network.isOnline()).toBe(false);
    expect(ui).toHaveBeenLastCalledWith(false);
    expect(sync).toHaveBeenLastCalledWith(false);
    expect(fetchMock).toHaveBeenCalledTimes(1);
  });

  it.each([404, 500, 503])('does not describe HTTP %i as offline', async (status) => {
    setBrowserOnline(false);
    fetchMock.mockResolvedValue({ status, ok: false });
    expect(await network.checkHttpConnectivity()).toBe(true);
    expect(network.isOnline()).toBe(true);
  });

  it('recovers without an online event while the browser flag remains false', async () => {
    setBrowserOnline(false);
    fetchMock.mockRejectedValueOnce(new TypeError('Failed to fetch'));
    const listener = jest.fn();
    network.onStatusChange(listener);
    await settle();
    expect(network.isOnline()).toBe(false);

    jest.advanceTimersByTime(15_000);
    await settle();

    expect(network.isOnline()).toBe(true);
    expect(listener.mock.calls).toEqual([[false], [true]]);
    expect(navigator.onLine).toBe(false);
  });

  it('rechecks and recovers when the app regains focus', async () => {
    fetchMock.mockRejectedValueOnce(new TypeError('Failed to fetch'));
    network.onStatusChange(jest.fn());
    await settle();
    expect(network.isOnline()).toBe(false);

    window.dispatchEvent(new Event('focus'));
    await settle();

    expect(network.isOnline()).toBe(true);
  });

  it('ignores a stale failed request after a newer online event succeeds', async () => {
    let rejectOldRequest!: (reason: Error) => void;
    fetchMock.mockImplementationOnce(() => new Promise((_resolve, reject) => {
      rejectOldRequest = reject;
    }));
    const listener = jest.fn();
    network.onStatusChange(listener);

    window.dispatchEvent(new Event('online'));
    await settle();
    rejectOldRequest(new Error('old request failed'));
    await settle();

    expect(fetchMock).toHaveBeenCalledTimes(2);
    expect(network.isOnline()).toBe(true);
    expect(listener).not.toHaveBeenCalledWith(false);
  });

  it('shares an in-flight probe between callers', async () => {
    const first = network.checkHttpConnectivity();
    const second = network.checkHttpConnectivity();
    expect(first).toBe(second);
    await first;
    expect(fetchMock).toHaveBeenCalledTimes(1);
  });

  it('times out an unresponsive probe and retries it later', async () => {
    fetchMock.mockImplementationOnce((_url, options: RequestInit) => new Promise((_resolve, reject) => {
      options.signal?.addEventListener('abort', () => reject(new Error('aborted')));
    }));
    const result = network.checkHttpConnectivity();
    jest.advanceTimersByTime(5_000);
    expect(await result).toBe(false);
    jest.advanceTimersByTime(15_000);
    await settle();
    expect(network.isOnline()).toBe(true);
  });

  it('keeps native Wi-Fi edits local when Supabase is unreachable and recovers on an upstream probe', async () => {
    (window as unknown as { Capacitor: unknown }).Capacitor = { isNativePlatform: () => true };
    process.env.NEXT_PUBLIC_SUPABASE_URL = 'https://project.supabase.co/';
    process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY = 'public-anon-key';
    fetchMock.mockRejectedValueOnce(new TypeError('No Internet access'));
    const listener = jest.fn();
    network.onStatusChange(listener);
    expect(navigator.onLine).toBe(true);
    expect(network.isOnline()).toBe(false);
    await settle();
    expect(network.isOnline()).toBe(false);
    expect(fetchMock).toHaveBeenCalledWith('https://project.supabase.co/auth/v1/health', expect.objectContaining({
      cache: 'no-store', headers: { apikey: 'public-anon-key' }, signal: expect.any(AbortSignal),
    }));
    expect(fetchMock).not.toHaveBeenCalledWith('/api/health', expect.anything());
    jest.advanceTimersByTime(15_000);
    await settle();
    expect(network.isOnline()).toBe(true);
    expect(listener.mock.calls).toEqual([[false], [true]]);
  });

  it('times out a native upstream probe rather than trusting its Wi-Fi hint', async () => {
    (window as unknown as { Capacitor: unknown }).Capacitor = { isNativePlatform: () => true };
    process.env.NEXT_PUBLIC_SUPABASE_URL = 'https://project.supabase.co';
    fetchMock.mockImplementationOnce((_url, options: RequestInit) => new Promise((_resolve, reject) => {
      options.signal?.addEventListener('abort', () => reject(new Error('aborted')));
    }));
    const result = network.checkHttpConnectivity();
    jest.advanceTimersByTime(5_000);
    expect(await result).toBe(false);
    expect(network.isOnline()).toBe(false);
  });

  it('uses the native hint only when no upstream is configured', async () => {
    (window as unknown as { Capacitor: unknown }).Capacitor = { isNativePlatform: () => true };
    setBrowserOnline(false);
    const listener = jest.fn();
    network.onStatusChange(listener);
    await settle();
    expect(network.isOnline()).toBe(false);
    expect(fetchMock).not.toHaveBeenCalled();

    setBrowserOnline(true);
    window.dispatchEvent(new Event('online'));
    await settle();
    expect(network.isOnline()).toBe(true);
    expect(listener.mock.calls).toEqual([[false], [true]]);
  });
});
