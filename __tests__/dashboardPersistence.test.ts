import { fetchDashboardLayout, persistDashboardLayout } from '@/features/dashboard/persistence';
import { DEFAULT_DASHBOARD_LAYOUT, normalizeLayout } from '@/features/dashboard/layout-metadata';
import type { DashboardLayout } from '@/features/dashboard/types';

let mockOnline = true;
jest.mock('@/lib/network-status', () => ({ isOnline: () => mockOnline }));

const storage = new Map<string, DashboardLayout>();

class QueryBuilder {
  private userId: string | null = null;

  select() {
    return this;
  }

  eq(column: string, value: string) {
    if (column === 'user_id') {
      this.userId = value;
    }
    return this;
  }

  async maybeSingle() {
    if (!this.userId) {
      return { data: null, error: null };
    }
    const layout = storage.get(this.userId) ?? null;
    return {
      data: layout ? { dashboard_layout: layout } : null,
      error: null,
    };
  }

  async upsert(payload: { user_id: string; dashboard_layout: DashboardLayout }) {
    storage.set(payload.user_id, normalizeLayout(payload.dashboard_layout));
    return { error: null };
  }
}

jest.mock('@/lib/supabase', () => ({
  supabase: {
    from: () => new QueryBuilder(),
  },
}));

describe('dashboard layout persistence', () => {
  beforeEach(() => {
    storage.clear();
    localStorage.clear();
    mockOnline = true;
  });

  it('returns the default layout when no data exists', async () => {
    const layout = await fetchDashboardLayout('user-1');
    const defaultTypes = DEFAULT_DASHBOARD_LAYOUT.widgets.map(widget => widget.type).sort();
    const loadedTypes = layout.widgets.map(widget => widget.type).sort();
    expect(loadedTypes).toEqual(defaultTypes);
    expect(layout.widgets.every(widget => widget.visible)).toBe(true);
  });

  it('keeps an offline edit across reloads and replays it before loading server data', async () => {
    const layout = normalizeLayout(DEFAULT_DASHBOARD_LAYOUT);
    layout.widgets[0].visible = false;
    mockOnline = false;
    await persistDashboardLayout('offline-user', layout);
    expect(storage.has('offline-user')).toBe(false);
    expect((await fetchDashboardLayout('offline-user')).widgets[0].visible).toBe(false);
    mockOnline = true;
    expect((await fetchDashboardLayout('offline-user')).widgets[0].visible).toBe(false);
    expect(storage.get('offline-user')?.widgets[0].visible).toBe(false);
  });

  it('does not replay another account’s pending layout on account switch', async () => {
    const layout = normalizeLayout(DEFAULT_DASHBOARD_LAYOUT);
    layout.widgets[0].visible = false;
    mockOnline = false;
    await persistDashboardLayout('alice', layout);
    expect((await fetchDashboardLayout('bob')).widgets[0].visible).toBe(true);
    mockOnline = true;
    await fetchDashboardLayout('bob');
    expect(storage.has('alice')).toBe(false);
    expect((await fetchDashboardLayout('alice')).widgets[0].visible).toBe(false);
  });

  it('persists widget visibility toggles across saves', async () => {
    const userId = 'user-42';
    const initial = await fetchDashboardLayout(userId);
    const toggled = {
      widgets: initial.widgets.map(widget =>
        widget.type === initial.widgets[0]?.type ? { ...widget, visible: false } : widget,
      ),
    } satisfies DashboardLayout;

    await persistDashboardLayout(userId, toggled);

    const reloaded = await fetchDashboardLayout(userId);
    const persistedWidget = reloaded.widgets.find(widget => widget.type === initial.widgets[0]?.type);
    expect(persistedWidget?.visible).toBe(false);
  });
});
