# Zen Workspace App — Comprehensive Audit Report

**Date:** 2026-03-02
**Scope:** Full codebase audit covering security, performance, code quality, testing, accessibility, CI/CD, and dependencies.

---

## Executive Summary

Zen Workspace is a well-architected Next.js 15 + Supabase productivity app with Capacitor mobile support and offline-first design. The codebase shows solid fundamentals (TypeScript strict mode, feature-based structure, error boundaries, RLS policies) but has **actionable gaps in 7 areas** ranked below by severity.

---

## 1. CRITICAL — Security Vulnerabilities in Dependencies

**Impact: HIGH | Effort: LOW**

`next@15.5.9` has two known HIGH-severity vulnerabilities:
- DoS via Image Optimizer `remotePatterns` configuration
- HTTP request deserialization DoS when using React Server Components

Additional dependency vulnerabilities:
- `glob` (via sucrase) — command injection via `-c/--cmd`
- `minimatch` — 3 distinct ReDoS vulnerabilities affecting `@capacitor/cli` and `@typescript-eslint`
- `ajv` — ReDoS with `$data` option
- `js-yaml` — prototype pollution in merge
- `mdast-util-to-hast` — unsanitized class attribute

**Action:**
```bash
# Upgrade Next.js to patched version
npm install next@latest

# Fix remaining vulnerabilities
npm audit fix
```

---

## 2. CRITICAL — CI/CD Pipeline Has No Quality Gates

**Impact: HIGH | Effort: LOW**

The `build-apk.yml` workflow builds and ships an APK **without running any checks**:
- No linting (`npm run lint`)
- No type-checking (`npx tsc --noEmit`)
- No unit tests (`npm test`)
- No security audit (`npm audit`)

A single broken import or type error can ship to users.

**Action:** Add these steps before the build step in `.github/workflows/build-apk.yml`:
```yaml
- name: Lint
  run: npm run lint

- name: Type check
  run: npx tsc --noEmit

- name: Unit tests
  run: npm test

- name: Security audit
  run: npm audit --audit-level=high
```

---

## 3. HIGH — Exposed Supabase Project Reference

**Impact: HIGH | Effort: LOW**

`.mcp.json` is committed to the repository and contains:
```json
"url": "https://mcp.supabase.com/mcp?project_ref=sqnudxrcezzwigcmzvde"
```

This exposes the Supabase project identifier publicly. While the anon key is already public by design, coupling it with the project ref makes targeted attacks easier.

**Action:** Add `.mcp.json` to `.gitignore` and remove it from git tracking, or move the project ref to an environment variable.

---

## 4. HIGH — Minimal Test Coverage (~3-5%)

**Impact: HIGH | Effort: MEDIUM**

Only **4 test files** exist for an app with 95+ source files:

| Test File | Lines | Covers |
|-----------|-------|--------|
| `dashboardPersistence.test.ts` | 72 | Dashboard layout |
| `homeSelectors.test.ts` | 91 | Home selectors |
| `syncEngine.test.ts` | 303 | Sync conflict resolution |
| `dashboard.spec.ts` | E2E | Dashboard smoke test |

**Critical untested areas:**
- All API routes (`/api/tasks`, `/api/calendar`, `/api/categories`)
- Core hooks (`useChecklist`, `useLists`, `useNotes`, `useReminders`)
- Authentication flows (`AuthPanel`, `useAuthSession`)
- Offline sync queue (`sync-queue.ts`)
- Form validation (`TaskForm`, `CategoryManager`)

**Priority test targets (highest ROI):**
1. API route handlers — validate auth checks, rate limiting, error responses
2. `ChecklistManager.ts` (1,006 lines) — core business logic
3. `useLists.ts` (1,289 lines) — list CRUD and sharing logic
4. `sync-engine.ts` — data integrity under conflict scenarios

---

## 5. HIGH — Monolithic Files Need Decomposition

**Impact: MEDIUM | Effort: MEDIUM**

Five files exceed 800 lines, mixing UI, state, and business logic:

| File | Lines | Issue |
|------|-------|-------|
| `src/app/lists/page.tsx` | 1,468 | Page with forms, dialogs, drag-drop, sharing all inline |
| `src/features/lists/useLists.ts` | 1,289 | Every list operation in a single hook |
| `src/app/tasks/page.tsx` | 1,108 | Monolithic task page |
| `src/features/checklist/ChecklistManager.ts` | 1,006 | All task CRUD in one class |
| `src/components/TaskForm.tsx` | 853 | Large form component |

**Action:** Extract sub-components and split hooks:
- `lists/page.tsx` → `ListHeader`, `ListSidebar`, `ListShareDialog`, `ListItemsView`
- `useLists.ts` → `useListCrud`, `useListSharing`, `useListSync`, `useListFilters`
- `tasks/page.tsx` → `TaskHeader`, `TaskFilters`, `TaskViewSwitcher`
- `ChecklistManager.ts` → `TaskCrudService`, `TaskSyncService`, `TaskFilterService`

---

## 6. MEDIUM — Missing Security Headers

**Impact: MEDIUM | Effort: LOW**

`next.config.js` sets good baseline headers but is missing:

| Header | Purpose |
|--------|---------|
| `Strict-Transport-Security` | Enforce HTTPS (HSTS) |
| `Content-Security-Policy` | Prevent XSS, data injection |

**Action:** Add to the headers array in `next.config.js`:
```js
{ key: 'Strict-Transport-Security', value: 'max-age=63072000; includeSubDomains; preload' },
{ key: 'Content-Security-Policy', value: "default-src 'self'; script-src 'self' 'unsafe-inline' 'unsafe-eval'; style-src 'self' 'unsafe-inline'; img-src 'self' data: https:; connect-src 'self' https://*.supabase.co wss://*.supabase.co;" },
```

---

## 7. MEDIUM — `any` Type Usage Undermines Type Safety

**Impact: MEDIUM | Effort: LOW**

9 instances of `any` across 4 files, with TypeScript strict mode enabled:

| File | Line(s) | Usage |
|------|---------|-------|
| `src/types/ical-js.d.ts` | 2 | `const ICAL: any` — missing type declaration |
| `src/lib/sync-engine.ts` | 44, 95, 158, 161 | `as any` casts on Supabase queries |
| `src/features/calendar/useCalendarEvents.ts` | 200, 239 | `let ICAL: any` and `as any` cast |
| `src/app/api/calendar/events/import/route.ts` | 90, 115 | `let ICAL: any` and `vevent: any` |

**Action:**
- Create a proper `ical.js` type declaration file with real types
- Use Supabase's typed client generation (`supabase gen types`) to eliminate `as any` casts in sync-engine

---

## 8. MEDIUM — Performance Optimization Opportunities

**Impact: MEDIUM | Effort: MEDIUM**

### 8a. Missing `React.memo` on Expensive Components
Components that render lists/grids re-render on every parent update:
- `TaskBentoGrid.tsx` (497 lines) — renders many task cards
- `ListItemsBoard.tsx` (393 lines) — drag-drop list with many items
- `ProgressDashboard.tsx` — frequently updated stats

### 8b. Bundle Size Concerns
- `framer-motion` — large animation library (~30KB gzipped)
- `@fullcalendar/*` — 6 packages imported; consider lazy-loading the calendar page
- Both `date-fns` and FullCalendar's built-in date handling are loaded

### 8c. Missing Code Splitting
Large feature pages could use `next/dynamic` for lazy loading:
```tsx
const CalendarView = dynamic(() => import('@/components/calendar/FullCalendarView'), {
  loading: () => <CalendarSkeleton />,
  ssr: false,
});
```

---

## 9. LOW — 42 Console Statements in Production Code

**Impact: LOW | Effort: LOW**

42 `console.log/warn/error` calls across 20 source files. These leak debug info in production and clutter browser devtools.

**Action:** Add an ESLint rule and replace with a proper logger:
```json
// .eslintrc.json
{ "rules": { "no-console": ["warn", { "allow": ["warn", "error"] }] } }
```

---

## 10. LOW — Accessibility Gaps

**Impact: LOW | Effort: LOW**

Only 24 `aria-label` attributes across 13 files. Many interactive icon-only buttons lack accessible names:

```tsx
// Common pattern missing aria-label:
<button onClick={onDelete}>
  <Trash2 className="w-4 h-4" />
</button>

// Should be:
<button onClick={onDelete} aria-label="Delete item">
  <Trash2 className="w-4 h-4" />
</button>
```

**Files needing accessibility review:**
- `TaskBentoGrid.tsx` — icon buttons for task actions
- `SettingsMenu.tsx` — menu toggle buttons
- `CategoryManager.tsx` — edit/delete buttons
- All dashboard widgets in `src/features/dashboard/widgets/`

---

## Positive Highlights

These areas are already well-implemented:

- **TypeScript strict mode** — enforces type safety across the codebase
- **Error boundaries** — `ErrorBoundary.tsx` catches render crashes gracefully
- **HTML sanitization** — `noteUtils.ts` uses whitelist-based tag/style filtering with JS protocol blocking
- **Rate limiting** — API routes limit to 25-30 requests per endpoint
- **Offline-first architecture** — Dexie + sync-engine with conflict resolution
- **Row-Level Security** — Supabase RLS policies protect data at the database level
- **Feature-based structure** — clean separation under `src/features/`
- **No `@ts-ignore` or `@ts-expect-error`** — zero suppression comments
- **Security headers** — X-Content-Type-Options, X-Frame-Options, Referrer-Policy configured
- **Capacitor build architecture** — smart static export toggle with route exclusion

---

## Priority Action Plan

| # | Item | Severity | Effort | Action |
|---|------|----------|--------|--------|
| 1 | Upgrade Next.js + audit deps | CRITICAL | 15 min | `npm install next@latest && npm audit fix` |
| 2 | Add CI quality gates | CRITICAL | 30 min | Add lint/typecheck/test steps to `build-apk.yml` |
| 3 | Remove `.mcp.json` from git | HIGH | 5 min | `.gitignore` + `git rm --cached` |
| 4 | Add tests for API routes + core hooks | HIGH | 2-3 days | Start with API routes, then hooks |
| 5 | Split monolithic files | HIGH | 1-2 days | Start with `lists/page.tsx` and `useLists.ts` |
| 6 | Add HSTS + CSP headers | MEDIUM | 30 min | Update `next.config.js` |
| 7 | Eliminate `any` types | MEDIUM | 1 hr | Type ICAL, use Supabase codegen |
| 8 | Add `React.memo` + lazy loading | MEDIUM | 2-3 hrs | Wrap expensive components, use `next/dynamic` |
| 9 | Remove console statements | LOW | 30 min | ESLint rule + find/replace |
| 10 | Add aria-labels to icon buttons | LOW | 1 hr | Audit all interactive elements |
