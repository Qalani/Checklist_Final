import { fetchDashboardLayout, persistDashboardLayout } from '@/features/dashboard/persistence';
import { DEFAULT_DASHBOARD_LAYOUT, normalizeLayout } from '@/features/dashboard/layout-metadata';
import type { DashboardLayout } from '@/features/dashboard/types';

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
  });

  it('returns the default layout when no data exists', async () => {
    const layout = await fetchDashboardLayout('user-1');
    const defaultTypes = DEFAULT_DASHBOARD_LAYOUT.widgets.map(widget => widget.type).sort();
    const loadedTypes = layout.widgets.map(widget => widget.type).sort();
    expect(loadedTypes).toEqual(defaultTypes);
    expect(layout.widgets.every(widget => widget.visible)).toBe(true);
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
