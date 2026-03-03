# Zen Workspace App — Comprehensive Audit Report

**Date:** 2026-03-02
**Scope:** Full codebase audit covering security, correctness, performance, configuration, testing, and maintainability.

---

## Executive Summary

Zen Workspace is a well-architected Next.js 15 + Supabase productivity app with Capacitor mobile support and offline-first design. The codebase shows solid fundamentals (TypeScript strict mode, feature-based structure, error boundaries, RLS policies, rate limiting) but has **critical bugs and actionable gaps** ranked below by severity.

---

## CRITICAL — Bugs That Break Features

### 1. `force-static` on authenticated calendar API route (BROKEN FEATURE)

**File:** `src/app/api/calendar/route.ts:18`

```ts
export const dynamic = 'force-static';
```

This tells Next.js to pre-render this route at build time as a static response. However, the route exports a `GET` handler that authenticates users via Bearer tokens and queries Supabase for per-user calendar data. With `force-static`, the handler **never executes at runtime** — Next.js serves a cached static response instead. This completely breaks the calendar feature for all users.

**Fix:** Remove `export const dynamic = 'force-static'` (or change to `'force-dynamic'`).

---

### 2. Sync engine silently deletes failed entries (DATA LOSS)

**File:** `src/lib/sync-engine.ts:149-151`

```ts
if (entry.retries >= MAX_RETRIES) {
  await remove(entry.id!);  // Permanently deletes user data!
  continue;
}
```

The code comment at line 143 says entries that reach MAX_RETRIES should be "skipped and left in the queue for manual inspection / future recovery." But the code **deletes them instead**. When a user makes changes offline and the sync fails 3 times (e.g., transient server issue), their queued writes are permanently and silently lost.

**Fix:** Remove the `await remove(entry.id!)` call — just `continue` to skip the entry while preserving it for later recovery.

---

### 3. Tailwind content paths missing `src/features/` (BROKEN STYLES IN PROD)

**File:** `tailwind.config.ts:5-9`

```ts
content: [
  "./src/pages/**/*.{js,ts,jsx,tsx,mdx}",
  "./src/components/**/*.{js,ts,jsx,tsx,mdx}",
  "./src/app/**/*.{js,ts,jsx,tsx,mdx}",
],
```

The `src/features/` directory contains 20+ `.tsx` files with Tailwind classes (dashboard widgets, feature cards, home components, etc.), but is **not scanned** by Tailwind. In production builds, Tailwind purges all unused classes — so every Tailwind class used exclusively in `src/features/` components will be **removed**, causing broken layouts in production.

**Fix:** Add `"./src/features/**/*.{js,ts,jsx,tsx,mdx}"` to the content array.

---

## HIGH — Security & Robustness

### 4. Missing Content-Security-Policy and HSTS headers

**File:** `next.config.js:17-21`

The config sets `X-Content-Type-Options`, `X-Frame-Options`, `Referrer-Policy`, and `Permissions-Policy` — but is missing the two most important headers:

| Missing Header | Risk |
|----------------|------|
| `Content-Security-Policy` | No browser-enforced XSS protection — injected scripts execute freely |
| `Strict-Transport-Security` | No HSTS — users can be downgraded to HTTP via MITM attacks |

**Fix:** Add both headers to the `next.config.js` headers array.

---

### 5. No input length validation on categories API

**File:** `src/app/api/categories/route.ts:45-51`

The handler validates that `name` and `color` are non-empty strings but enforces **no maximum length**. The tasks route correctly has `MAX_TITLE_LENGTH = 500` and `MAX_DESCRIPTION_LENGTH = 10_000`, but categories has no equivalent. A malicious user can POST multi-megabyte strings.

**Fix:** Add `MAX_NAME_LENGTH` and `MAX_COLOR_LENGTH` constants with length validation.

---

### 6. No query timeout on categories API

**File:** `src/app/api/categories/route.ts:53-61`

The `/api/tasks` and `/api/calendar/events` routes wrap their Supabase calls in `withTimeout(query, QUERY_TIMEOUT_MS)` to prevent hung queries from blocking the serverless function for its full `maxDuration` (30s). The categories route does **not** use this pattern, meaning a single hung Supabase connection blocks the function until it times out.

**Fix:** Wrap the Supabase insert call in `withTimeout(...)`.

---

### 7. `@capacitor/cli` in production dependencies

**File:** `package.json:21`

`@capacitor/cli` is a development-only build tool but is listed under `dependencies` instead of `devDependencies`. This adds unnecessary weight to production installs.

**Fix:** Move to `devDependencies`.

---

### 8. Exposed Supabase project reference in `.mcp.json`

**File:** `.mcp.json` (committed to git)

Contains the Supabase project ref (`sqnudxrcezzwigcmzvde`) in the repository. While the anon key is public by design, coupling it with the project identifier in a public repo makes targeted API abuse easier.

**Fix:** Add `.mcp.json` to `.gitignore`.

---

## MEDIUM — Code Quality & Performance

### 9. Monolithic files need decomposition

Five files exceed 800 lines, mixing UI, state, data-fetching, and business logic:

| File | Lines | Concern |
|------|-------|---------|
| `src/app/lists/page.tsx` | ~1,468 | Page + forms + dialogs + DnD + sharing |
| `src/features/lists/useLists.ts` | 1,289 | All list CRUD/sharing/realtime in one hook |
| `src/app/tasks/page.tsx` | ~1,108 | Monolithic task page |
| `src/features/checklist/ChecklistManager.ts` | 1,006 | All task CRUD in one class |
| `src/components/TaskForm.tsx` | 853 | Large form with many state variables |

**Recommendation:** Extract sub-hooks and sub-components to improve testability and readability.

---

### 10. Minimal test coverage (~3-5%)

Only 4 test files for 90+ source files:

| Test | Covers |
|------|--------|
| `syncEngine.test.ts` | Conflict resolution |
| `dashboardPersistence.test.ts` | Dashboard layout |
| `homeSelectors.test.ts` | Home selectors |
| `dashboard.spec.ts` (E2E) | Dashboard smoke |

**Untested critical paths:** API routes, auth flows, list/note/reminder hooks, calendar data assembly, offline sync queue, form validation.

---

### 11. CI/CD pipeline has no quality gates

The `build-apk.yml` workflow builds and ships an APK without running lint, type-check, or tests. A broken import or type error can ship directly to users.

**Fix:** Add lint, typecheck, and test steps before the build step.

---

### 12. `any` type usage (9 instances)

TypeScript strict mode is enabled, but 9 `any` casts exist across sync-engine, calendar event import, and ical.js handling. These bypass type safety at critical data boundaries.

**Fix:** Generate Supabase types (`supabase gen types`) and create proper ical.js type declarations.

---

### 13. Performance opportunities

- **Missing `React.memo`** on expensive list-rendering components (`TaskBentoGrid`, `ListItemsBoard`)
- **Heavy bundle:** `framer-motion` (~30KB gzip) + 6 `@fullcalendar/*` packages loaded eagerly
- **No code splitting:** Calendar and dashboard could use `next/dynamic` lazy loading
- **Duplicate date handling:** Both `date-fns` and FullCalendar's built-in dates are loaded

---

## LOW — Polish

### 14. 40 console statements in production code

40 `console.log/warn/error` calls across 19 source files leak implementation details in production.

### 15. Accessibility gaps

Only 24 `aria-label` attributes across 13 files. Many icon-only buttons lack accessible names for screen readers.

---

## Positive Highlights

These areas are already well-implemented:

- **TypeScript strict mode** — no `@ts-ignore` or `@ts-expect-error` anywhere
- **Error boundary** — catches render crashes with friendly recovery UI
- **HTML sanitization** — whitelist-based tag/style filtering with protocol blocking
- **Rate limiting** — per-user, per-endpoint limits on all mutation routes
- **Offline-first** — Dexie + sync queue + background sync + online/offline detection
- **Conflict resolution** — last-write-wins with timestamp comparison
- **Row-Level Security** — Supabase RLS policies protect data at the database level
- **Security headers** — X-Content-Type-Options, X-Frame-Options, Referrer-Policy
- **Feature-based structure** — clean separation under `src/features/`
- **Capacitor build architecture** — smart static-export toggle

---

## Fixes Applied in This Commit

| # | Severity | Fix | File |
|---|----------|-----|------|
| 1 | Critical | Removed `force-static` from calendar API route | `src/app/api/calendar/route.ts` |
| 2 | Critical | Fixed sync engine to preserve failed entries instead of deleting them | `src/lib/sync-engine.ts` |
| 3 | Critical | Added `src/features/` to Tailwind content paths | `tailwind.config.ts` |
| 4 | High | Added Content-Security-Policy and HSTS security headers | `next.config.js` |
| 5 | High | Added input length validation to categories API | `src/app/api/categories/route.ts` |
| 6 | High | Added query timeout to categories API | `src/app/api/categories/route.ts` |
| 7 | High | Moved `@capacitor/cli` to devDependencies | `package.json` |
| 8 | High | Added `.mcp.json` to `.gitignore` | `.gitignore` |
