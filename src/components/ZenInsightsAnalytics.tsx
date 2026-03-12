'use client';

import { useMemo, useState, type ReactNode } from 'react';
import { motion } from 'framer-motion';
import { AlertTriangle, BarChart2, Calendar, FileText, TrendingUp } from 'lucide-react';
import type { Category, Note, Task } from '@/types';

interface ZenInsightsAnalyticsProps {
  tasks: Task[];
  categories: Category[];
  notes: Note[];
}

type TimeRange = '7d' | '30d' | '90d';

// ─── Reusable SVG bar chart ────────────────────────────────────────────────

interface BarDatum {
  label: string;
  value: number;
}

function BarChart({ data, color }: { data: BarDatum[]; color: string }) {
  const max = Math.max(...data.map(d => d.value), 1);
  const chartH = 96;
  const gap = 6;
  const totalGap = gap * (data.length - 1);
  const barW = `calc((100% - ${totalGap}px) / ${data.length})`;

  return (
    <div className="flex items-end justify-between gap-[6px] px-1" style={{ height: chartH + 28 }}>
      {data.map((d, i) => {
        const barH = Math.max(3, (d.value / max) * chartH);
        return (
          <div
            key={`${d.label}-${i}`}
            className="flex flex-1 flex-col items-center gap-1"
            style={{ maxWidth: barW }}
          >
            <span
              className="text-[9px] font-medium text-zen-500 dark:text-zen-300"
              style={{ visibility: d.value > 0 ? 'visible' : 'hidden' }}
            >
              {d.value}
            </span>
            <motion.div
              initial={{ scaleY: 0 }}
              animate={{ scaleY: 1 }}
              transition={{ duration: 0.4, delay: i * 0.03, ease: 'easeOut' }}
              className="w-full origin-bottom rounded-t-md"
              style={{ height: barH, backgroundColor: color, opacity: d.value === 0 ? 0.18 : 0.82 }}
            />
            <span className="text-[9px] text-zen-400 dark:text-zen-300">{d.label}</span>
          </div>
        );
      })}
    </div>
  );
}

// ─── Card shell ───────────────────────────────────────────────────────────

function ChartCard({
  title,
  icon,
  children,
}: {
  title: string;
  icon: ReactNode;
  children: ReactNode;
}) {
  return (
    <div className="rounded-2xl border border-zen-200/60 bg-surface/80 p-5 shadow-soft backdrop-blur-sm dark:border-zen-700/40">
      <div className="mb-4 flex items-center gap-2">
        {icon}
        <h3 className="text-sm font-medium text-zen-700 dark:text-zen-200">{title}</h3>
      </div>
      {children}
    </div>
  );
}

function EmptyChart({ label = 'No activity in this period' }: { label?: string }) {
  return (
    <p className="py-10 text-center text-xs text-zen-400 dark:text-zen-300">{label}</p>
  );
}

// ─── Stat card ────────────────────────────────────────────────────────────

function StatCard({
  icon,
  label,
  value,
  sub,
  gradient,
}: {
  icon: ReactNode;
  label: string;
  value: string | number;
  sub: string;
  gradient: string;
}) {
  return (
    <div className="flex items-center gap-3 rounded-2xl border border-zen-200/60 bg-surface/80 p-4 shadow-soft backdrop-blur-sm dark:border-zen-700/40">
      <div
        className={`flex h-10 w-10 flex-shrink-0 items-center justify-center rounded-xl bg-gradient-to-br text-white ${gradient}`}
      >
        {icon}
      </div>
      <div className="min-w-0">
        <p className="text-xs text-zen-500 dark:text-zen-300">{label}</p>
        <p className="text-xl font-semibold text-zen-900">{value}</p>
        <p className="truncate text-xs text-zen-400 dark:text-zen-300">{sub}</p>
      </div>
    </div>
  );
}

// ─── Main component ───────────────────────────────────────────────────────

export default function ZenInsightsAnalytics({ tasks, categories, notes }: ZenInsightsAnalyticsProps) {
  const [timeRange, setTimeRange] = useState<TimeRange>('30d');
  const rangeDays = timeRange === '7d' ? 7 : timeRange === '30d' ? 30 : 90;

  const rangeStart = useMemo(() => {
    const d = new Date();
    d.setDate(d.getDate() - rangeDays);
    d.setHours(0, 0, 0, 0);
    return d;
  }, [rangeDays]);

  const now = new Date();

  // Tasks completed within the selected range, using updated_at as completion time
  const completedInRange = useMemo(
    () =>
      tasks.filter(
        t => t.completed && t.updated_at && new Date(t.updated_at) >= rangeStart,
      ),
    [tasks, rangeStart],
  );

  // Notes created within the selected range
  const notesInRange = useMemo(
    () => notes.filter(n => n.created_at && new Date(n.created_at) >= rangeStart),
    [notes, rangeStart],
  );

  // ── Completion over time ──────────────────────────────────────────────
  const completionChartData = useMemo((): BarDatum[] => {
    const now = new Date();
    if (timeRange === '7d') {
      return Array.from({ length: 7 }, (_, i) => {
        const d = new Date(now);
        d.setDate(d.getDate() - (6 - i));
        const dayStr = d.toDateString();
        return {
          label: d.toLocaleDateString(undefined, { weekday: 'short' }),
          value: completedInRange.filter(t => new Date(t.updated_at!).toDateString() === dayStr).length,
        };
      });
    }
    const weeks = timeRange === '30d' ? 4 : 13;
    return Array.from({ length: weeks }, (_, i) => {
      const weekEnd = new Date(now);
      weekEnd.setDate(weekEnd.getDate() - (weeks - 1 - i) * 7);
      const weekStart = new Date(weekEnd);
      weekStart.setDate(weekStart.getDate() - 6);
      return {
        label: `W${i + 1}`,
        value: completedInRange.filter(t => {
          const d = new Date(t.updated_at!);
          return d >= weekStart && d <= weekEnd;
        }).length,
      };
    });
  }, [completedInRange, timeRange]);

  // ── Day-of-week productivity ──────────────────────────────────────────
  const dayOfWeekData = useMemo((): BarDatum[] => {
    const DAY_LABELS = ['Sun', 'Mon', 'Tue', 'Wed', 'Thu', 'Fri', 'Sat'];
    return DAY_LABELS.map((label, i) => ({
      label,
      value: completedInRange.filter(t => new Date(t.updated_at!).getDay() === i).length,
    }));
  }, [completedInRange]);

  // ── Note-writing frequency ────────────────────────────────────────────
  const noteChartData = useMemo((): BarDatum[] => {
    const now = new Date();
    if (timeRange === '7d') {
      return Array.from({ length: 7 }, (_, i) => {
        const d = new Date(now);
        d.setDate(d.getDate() - (6 - i));
        const dayStr = d.toDateString();
        return {
          label: d.toLocaleDateString(undefined, { weekday: 'short' }),
          value: notesInRange.filter(n => new Date(n.created_at!).toDateString() === dayStr).length,
        };
      });
    }
    const weeks = timeRange === '30d' ? 4 : 13;
    return Array.from({ length: weeks }, (_, i) => {
      const weekEnd = new Date(now);
      weekEnd.setDate(weekEnd.getDate() - (weeks - 1 - i) * 7);
      const weekStart = new Date(weekEnd);
      weekStart.setDate(weekStart.getDate() - 6);
      return {
        label: `W${i + 1}`,
        value: notesInRange.filter(n => {
          const d = new Date(n.created_at!);
          return d >= weekStart && d <= weekEnd;
        }).length,
      };
    });
  }, [notesInRange, timeRange]);

  // ── Category breakdown ────────────────────────────────────────────────
  const categoryData = useMemo(
    () =>
      categories
        .map(cat => {
          const catTasks = tasks.filter(t => t.category === cat.name);
          const completed = catTasks.filter(t => t.completed).length;
          return {
            ...cat,
            total: catTasks.length,
            completed,
            pct: catTasks.length > 0 ? Math.round((completed / catTasks.length) * 100) : 0,
          };
        })
        .filter(c => c.total > 0)
        .sort((a, b) => b.total - a.total)
        .slice(0, 8),
    [tasks, categories],
  );

  // ── Summary numbers ───────────────────────────────────────────────────
  const overdueCount = tasks.filter(
    t => !t.completed && t.due_date && new Date(t.due_date) < now,
  ).length;

  const allTimeRate =
    tasks.length > 0
      ? Math.round((tasks.filter(t => t.completed).length / tasks.length) * 100)
      : 0;

  const totalCompletedInRange = completionChartData.reduce((s, d) => s + d.value, 0);
  const totalNotesInRange = noteChartData.reduce((s, d) => s + d.value, 0);

  return (
    <section className="space-y-6">
      {/* Section header + time range toggle */}
      <div className="flex flex-wrap items-center justify-between gap-3">
        <div className="flex items-center gap-2">
          <BarChart2 className="h-5 w-5 text-sage-600" />
          <h2 className="text-lg font-semibold text-zen-900">Activity Insights</h2>
        </div>
        <div className="flex gap-1 rounded-xl border border-zen-200/60 bg-surface/60 p-1 shadow-small dark:border-zen-700/40">
          {(['7d', '30d', '90d'] as TimeRange[]).map(r => (
            <button
              key={r}
              type="button"
              onClick={() => setTimeRange(r)}
              className={`rounded-lg px-3 py-1.5 text-xs font-medium transition-colors ${
                timeRange === r
                  ? 'bg-sage-500 text-white shadow-small'
                  : 'text-zen-600 hover:text-zen-900 dark:text-zen-200 dark:hover:text-zen-900'
              }`}
            >
              {r === '7d' ? '7 days' : r === '30d' ? '30 days' : '90 days'}
            </button>
          ))}
        </div>
      </div>

      {/* Summary stat cards */}
      <div className="grid gap-4 sm:grid-cols-2 lg:grid-cols-4">
        <StatCard
          icon={<TrendingUp className="h-4 w-4" />}
          label="Completed"
          value={totalCompletedInRange}
          sub={`in the last ${rangeDays} days`}
          gradient="from-sage-500 to-sage-600"
        />
        <StatCard
          icon={<FileText className="h-4 w-4" />}
          label="Notes written"
          value={totalNotesInRange}
          sub={`in the last ${rangeDays} days`}
          gradient="from-zen-500 to-zen-600"
        />
        <StatCard
          icon={<AlertTriangle className="h-4 w-4" />}
          label="Overdue tasks"
          value={overdueCount}
          sub="past their due date"
          gradient={overdueCount > 0 ? 'from-warm-400 to-warm-500' : 'from-sage-400 to-sage-500'}
        />
        <StatCard
          icon={<Calendar className="h-4 w-4" />}
          label="All-time rate"
          value={`${allTimeRate}%`}
          sub={`${tasks.filter(t => t.completed).length} of ${tasks.length} tasks done`}
          gradient="from-zen-400 to-zen-600"
        />
      </div>

      {/* Charts grid */}
      <div className="grid gap-4 md:grid-cols-2">
        <ChartCard
          title="Tasks completed over time"
          icon={<TrendingUp className="h-4 w-4 text-sage-500" />}
        >
          {totalCompletedInRange === 0 ? (
            <EmptyChart />
          ) : (
            <BarChart data={completionChartData} color="#6B9F7C" />
          )}
        </ChartCard>

        <ChartCard
          title="Most productive days"
          icon={<Calendar className="h-4 w-4 text-zen-500" />}
        >
          {dayOfWeekData.every(d => d.value === 0) ? (
            <EmptyChart />
          ) : (
            <BarChart data={dayOfWeekData} color="#8BAEC7" />
          )}
        </ChartCard>

        <ChartCard
          title="Notes written over time"
          icon={<FileText className="h-4 w-4 text-warm-500" />}
        >
          {totalNotesInRange === 0 ? (
            <EmptyChart />
          ) : (
            <BarChart data={noteChartData} color="#C4975A" />
          )}
        </ChartCard>

        <ChartCard
          title="Category breakdown"
          icon={<BarChart2 className="h-4 w-4 text-zen-500" />}
        >
          {categoryData.length === 0 ? (
            <EmptyChart label="No categories yet" />
          ) : (
            <div className="space-y-3 pt-1">
              {categoryData.map((cat, i) => (
                <motion.div
                  key={cat.id}
                  initial={{ opacity: 0, x: -8 }}
                  animate={{ opacity: 1, x: 0 }}
                  transition={{ delay: i * 0.05 }}
                  className="space-y-1"
                >
                  <div className="flex items-center justify-between text-xs">
                    <span className="flex items-center gap-1.5 font-medium text-zen-700 dark:text-zen-200">
                      <span className="h-2 w-2 rounded-full" style={{ backgroundColor: cat.color }} />
                      {cat.name}
                    </span>
                    <span className="text-zen-500 dark:text-zen-300">
                      {cat.completed}/{cat.total} · {cat.pct}%
                    </span>
                  </div>
                  <div className="h-1.5 overflow-hidden rounded-full bg-zen-100 dark:bg-zen-800/40">
                    <motion.div
                      initial={{ width: 0 }}
                      animate={{ width: `${cat.pct}%` }}
                      transition={{ duration: 0.5, delay: i * 0.05 }}
                      className="h-full rounded-full"
                      style={{ backgroundColor: cat.color }}
                    />
                  </div>
                </motion.div>
              ))}
            </div>
          )}
        </ChartCard>
      </div>
    </section>
  );
}
