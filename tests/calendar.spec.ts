import { mkdir, writeFile } from 'node:fs/promises';
import { join } from 'node:path';
import type { Locator, Page, TestInfo } from '@playwright/test';
import { test, expect, TEST_DATE, TEST_USER_ID, type CalendarRow } from './calendar-fixture';

/**
 * Start Next with these dummy values before running this isolated suite:
 * NEXT_PUBLIC_SUPABASE_URL=https://calendar-test.supabase.co NEXT_PUBLIC_SUPABASE_ANON_KEY=calendar-test-anon-key npm run dev
 * npx playwright test tests/calendar.spec.ts
 * Optional: PLAYWRIGHT_CHROMIUM_EXECUTABLE_PATH=/usr/bin/chromium
 * Optional: CALENDAR_QA_SCREENSHOT_DIR=<directory> copies QA screenshots there.
 * The fixture aborts any Supabase request to another project.
 */
test.use({
  launchOptions: process.env.PLAYWRIGHT_CHROMIUM_EXECUTABLE_PATH ? { executablePath: process.env.PLAYWRIGHT_CHROMIUM_EXECUTABLE_PATH } : {},
  locale: 'en-GB',
  timezoneId: 'Europe/London',
  serviceWorkers: 'block',
});

const calendarItem = (page: Page, title: string) => page.locator('.fc-event').filter({ hasText: title }).first();
const seedEvent = (title: string, extra: Partial<CalendarRow> = {}): CalendarRow => ({
  id: '22222222-2222-4222-8222-222222222222', user_id: TEST_USER_ID,
  title, start_time: `${TEST_DATE}T13:00:00Z`, end_time: `${TEST_DATE}T14:00:00Z`, all_day: false,
  ...extra,
});

async function openCalendar(page: Page) {
  await page.goto('/calendar');
  await expect(page.getByRole('heading', { name: 'Calendar', exact: true })).toBeVisible();
  await expect(page.locator('.calendar-body')).toHaveAttribute('aria-busy', 'false');
  await expect(page.getByText('You’re offline', { exact: true })).toHaveCount(0);
}

async function screenshot(page: Page, testInfo: TestInfo, name: string) {
  const bytes = await page.screenshot({ path: testInfo.outputPath(name), fullPage: true });
  if (process.env.CALENDAR_QA_SCREENSHOT_DIR) {
    await mkdir(process.env.CALENDAR_QA_SCREENSHOT_DIR, { recursive: true });
    await writeFile(join(process.env.CALENDAR_QA_SCREENSHOT_DIR, name), bytes);
  }
}

async function fillTimedEvent(dialog: Locator, title: string) {
  await dialog.getByLabel('Title', { exact: true }).fill(title);
  await dialog.getByLabel('Start date', { exact: true }).fill(TEST_DATE);
  await dialog.getByLabel('End date', { exact: true }).fill(TEST_DATE);
  await dialog.getByLabel('Start time', { exact: true }).fill('13:00');
  await dialog.getByLabel('End time', { exact: true }).fill('14:00');
}

test('creates, edits, reloads and deletes a persisted calendar event', async ({ page, calendarApi }) => {
  await openCalendar(page);
  await page.getByRole('button', { name: 'New event', exact: true }).click();
  let dialog = page.getByRole('dialog', { name: 'New event', exact: true });
  await fillTimedEvent(dialog, 'Planning session');
  await dialog.getByLabel('Location').fill('Studio 3');
  await dialog.getByLabel('Description').fill('Bring the project notes.');
  await dialog.getByRole('button', { name: 'Create event', exact: true }).click();
  await expect(dialog).not.toBeVisible();
  await expect(calendarItem(page, 'Planning session')).toBeVisible();
  expect(calendarApi.events).toHaveLength(1);
  expect(calendarApi.events[0]).toMatchObject({ title: 'Planning session', location: 'Studio 3' });

  await calendarItem(page, 'Planning session').click();
  dialog = page.getByRole('dialog', { name: 'Planning session', exact: true });
  await expect(dialog.getByText('Studio 3', { exact: true })).toBeVisible();
  await dialog.getByRole('button', { name: 'Edit event', exact: true }).click();
  dialog = page.getByRole('dialog', { name: 'Edit event', exact: true });
  await dialog.getByLabel('Title', { exact: true }).fill('Updated planning session');
  await dialog.getByLabel('End time', { exact: true }).fill('14:30');
  await dialog.getByRole('button', { name: 'Save changes', exact: true }).click();
  await expect(dialog).not.toBeVisible();
  await expect(calendarItem(page, 'Updated planning session')).toBeVisible();
  expect(calendarApi.events[0]).toMatchObject({ title: 'Updated planning session', end_time: `${TEST_DATE}T14:30:00.000Z` });

  await page.reload();
  await expect(calendarItem(page, 'Updated planning session')).toBeVisible();
  await calendarItem(page, 'Updated planning session').click();
  dialog = page.getByRole('dialog', { name: 'Updated planning session', exact: true });
  await dialog.getByRole('button', { name: 'Delete', exact: true }).click();
  await expect(dialog.getByText('Delete this event?', { exact: true })).toBeVisible();
  await dialog.getByRole('button', { name: 'Delete event', exact: true }).click();
  await expect(dialog).not.toBeVisible();
  await expect(calendarItem(page, 'Updated planning session')).toHaveCount(0);
  expect(calendarApi.events).toHaveLength(0);
  expect(calendarApi.writes.map(({ method }) => method)).toEqual(['POST', 'PATCH', 'DELETE']);
});

test('search, calendar sources and shared scope filter real rendered items', async ({ page, calendarApi }) => {
  calendarApi.events.push(seedEvent('Personal focus', { location: 'Garden room' }));
  calendarApi.sharedTasks.push({ role: 'viewer', task: {
    id: '33333333-3333-4333-8333-333333333333', user_id: '44444444-4444-4444-8444-444444444444',
    title: 'Shared review', due_date: `${TEST_DATE}T15:00:00Z`, completed: false,
    priority: 'medium', category: '', category_color: '', order: 0,
  } });
  calendarApi.notes.push({ id: 'note', user_id: TEST_USER_ID, title: 'Private notes', updated_at: `${TEST_DATE}T10:00:00Z` });
  await openCalendar(page);
  await expect(calendarItem(page, 'Personal focus')).toBeVisible();
  await expect(calendarItem(page, 'Shared review')).toBeVisible();

  const search = page.getByRole('searchbox', { name: 'Search this calendar view' });
  await search.fill('garden');
  await expect(calendarItem(page, 'Personal focus')).toBeVisible();
  await expect(calendarItem(page, 'Shared review')).toHaveCount(0);
  await page.getByRole('button', { name: 'Reset filters', exact: true }).first().click();
  await expect(calendarItem(page, 'Shared review')).toBeVisible();
  await page.getByRole('group', { name: 'Calendar sources' }).getByRole('button', { name: 'Events', exact: true }).click();
  await expect(calendarItem(page, 'Personal focus')).toHaveCount(0);
  await expect(calendarItem(page, 'Shared review')).toBeVisible();
  await page.getByRole('button', { name: 'Reset filters', exact: true }).first().click();

  const scope = page.getByRole('combobox', { name: 'Filter calendar scope' });
  await scope.selectOption('shared');
  await expect(calendarItem(page, 'Shared review')).toBeVisible();
  await expect(calendarItem(page, 'Personal focus')).toHaveCount(0);
  await expect(calendarItem(page, 'Private notes')).toHaveCount(0);
  await scope.selectOption('personal');
  await expect(calendarItem(page, 'Personal focus')).toBeVisible();
  await expect(calendarItem(page, 'Shared review')).toHaveCount(0);
});

test('month navigation, jump to date, today and view switching stay synchronized', async ({ page, calendarApi }) => {
  expect(calendarApi.events).toHaveLength(0);
  await openCalendar(page);
  const title = page.locator('.calendar-toolbar-title');
  await expect(title).toHaveText('October 2026');
  await page.getByRole('button', { name: 'Next period' }).click();
  await expect(title).toHaveText('November 2026');
  await page.getByRole('button', { name: 'Previous period' }).click();
  await expect(title).toHaveText('October 2026');
  await page.getByLabel('Jump to date', { exact: true }).fill('2027-02-10');
  await expect(title).toHaveText('February 2027');
  await page.getByRole('button', { name: 'Today', exact: true }).click();
  await expect(title).toHaveText('October 2026');
  await expect(page.getByLabel('Jump to date', { exact: true })).toHaveValue(TEST_DATE);
  for (const [label, view] of [['Week', 'timeGridWeek'], ['Day', 'timeGridDay'], ['Agenda', 'listWeek'], ['Month', 'dayGridMonth']]) {
    await page.getByRole('group', { name: 'Change calendar view' }).getByRole('button', { name: label, exact: true }).click();
    await expect(page.locator('.calendar-body')).toHaveAttribute('data-view', view);
    await expect(page.getByRole('button', { name: label, exact: true })).toHaveAttribute('aria-pressed', 'true');
  }
});

test('imports an ICS file and updates its existing event on reimport', async ({ page, calendarApi }) => {
  await openCalendar(page);
  const ics = (title: string) => [
    'BEGIN:VCALENDAR', 'VERSION:2.0', 'PRODID:-//Zen Calendar Test//EN',
    'BEGIN:VEVENT', 'UID:planning-calendar-test', 'DTSTAMP:20261029T110000Z',
    'DTSTART:20261029T130000Z', 'DTEND:20261029T140000Z',
    `SUMMARY:${title}`, 'LOCATION:Studio 3', 'END:VEVENT', 'END:VCALENDAR', '',
  ].join('\r\n');
  const upload = (title: string) => page.getByLabel('Calendar file', { exact: true }).setInputFiles({
    name: 'planning.ics', mimeType: 'text/calendar', buffer: Buffer.from(ics(title)),
  });
  await upload('Imported planning');
  await expect(page.getByText('1 imported, 0 updated.', { exact: true })).toBeVisible();
  await expect(calendarItem(page, 'Imported planning')).toBeVisible();
  expect(calendarApi.events).toHaveLength(1);
  const importedId = calendarApi.events[0].id;
  await upload('Revised imported planning');
  await expect(page.getByText('0 imported, 1 updated.', { exact: true })).toBeVisible();
  await expect(calendarItem(page, 'Revised imported planning')).toBeVisible();
  expect(calendarApi.events).toHaveLength(1);
  expect(calendarApi.events[0]).toMatchObject({ id: importedId, title: 'Revised imported planning', location: 'Studio 3' });
  await page.reload();
  await expect(calendarItem(page, 'Revised imported planning')).toBeVisible();
});

test('keeps event details in the editor after a failed save and allows retry', async ({ page, calendarApi }) => {
  await openCalendar(page);
  await page.getByRole('button', { name: 'New event', exact: true }).click();
  const dialog = page.getByRole('dialog', { name: 'New event', exact: true });
  await fillTimedEvent(dialog, 'Retry planning');
  await dialog.getByLabel('Location').fill('Studio 3');
  calendarApi.failNextWrite = { message: 'Calendar save unavailable. Please retry.' };
  await dialog.getByRole('button', { name: 'Create event', exact: true }).click();
  await expect(dialog.getByRole('alert')).toHaveText('Calendar save unavailable. Please retry.');
  await expect(dialog.getByLabel('Title', { exact: true })).toHaveValue('Retry planning');
  await expect(dialog.getByLabel('Location')).toHaveValue('Studio 3');
  expect(calendarApi.events).toHaveLength(0);
  await dialog.getByRole('button', { name: 'Create event', exact: true }).click();
  await expect(dialog).not.toBeVisible();
  await expect(calendarItem(page, 'Retry planning')).toBeVisible();
  expect(calendarApi.events).toHaveLength(1);
});

test('rejects recurring ICS files clearly without importing a partial series', async ({ page, calendarApi }) => {
  await openCalendar(page);
  const content = [
    'BEGIN:VCALENDAR', 'VERSION:2.0', 'PRODID:-//Zen Calendar Test//EN',
    'BEGIN:VEVENT', 'UID:recurring-calendar-test', 'DTSTART:20261029T130000Z',
    'DTEND:20261029T140000Z', 'RRULE:FREQ=DAILY;COUNT=3', 'SUMMARY:Daily planning',
    'END:VEVENT', 'END:VCALENDAR', '',
  ].join('\r\n');
  await page.getByLabel('Calendar file', { exact: true }).setInputFiles({ name: 'recurring.ics', mimeType: 'text/calendar', buffer: Buffer.from(content) });
  await expect(page.getByRole('alert').filter({ hasText: 'Recurring calendar events are not supported.' })).toContainText('Recurring calendar events are not supported. Export individual occurrences and import those instead.');
  expect(calendarApi.events).toHaveLength(0);
  expect(calendarApi.writes).toHaveLength(0);
});

test('preserves IANA timezone instants when importing a timed event', async ({ page, calendarApi }) => {
  await openCalendar(page);
  const content = [
    'BEGIN:VCALENDAR', 'VERSION:2.0', 'PRODID:-//Zen Calendar Test//EN',
    'BEGIN:VEVENT', 'UID:timezone-calendar-test', 'DTSTART;TZID=America/New_York:20261029T090000',
    'DTEND;TZID=America/New_York:20261029T100000', 'SUMMARY:New York planning',
    'END:VEVENT', 'END:VCALENDAR', '',
  ].join('\r\n');
  await page.getByLabel('Calendar file', { exact: true }).setInputFiles({ name: 'timezone.ics', mimeType: 'text/calendar', buffer: Buffer.from(content) });
  await expect(page.getByText('1 imported, 0 updated.', { exact: true })).toBeVisible();
  expect(calendarApi.events[0]).toMatchObject({ start_time: `${TEST_DATE}T13:00:00.000Z`, end_time: `${TEST_DATE}T14:00:00.000Z`, all_day: false });
  await expect(calendarItem(page, 'New York planning')).toBeVisible();
});

test('dragging and resizing a timed event persist its new schedule', async ({ page, calendarApi }) => {
  await page.setViewportSize({ width: 1440, height: 1100 });
  calendarApi.events.push(seedEvent('Move this event'));
  await openCalendar(page);
  await page.getByRole('button', { name: 'Day', exact: true }).click();
  await expect(page.locator('.calendar-body')).toHaveAttribute('data-view', 'timeGridDay');
  await expect(page.locator('.calendar-body')).toHaveAttribute('aria-busy', 'false');
  const event = calendarItem(page, 'Move this event');
  await event.scrollIntoViewIfNeeded();
  await expect(event).toBeVisible();
  await expect(event).toHaveClass(/fc-event-draggable/);
  const hourHeight = await page.locator('.fc-timegrid-slot[data-time="13:00:00"]').first().evaluate((node) => node.getBoundingClientRect().height * 2);
  const bounds = await event.boundingBox();
  expect(bounds).not.toBeNull();
  const x = bounds!.x + bounds!.width / 2;
  const y = bounds!.y + Math.min(15, bounds!.height / 3);
  await page.mouse.move(x, y);
  await page.mouse.down();
  await page.mouse.move(x, y + 8, { steps: 2 });
  await expect(page.locator('.fc-event-dragging').first()).toBeVisible({ timeout: 5000 });
  await page.mouse.move(x, y + hourHeight, { steps: 12 });
  await page.mouse.up();
  await expect.poll(() => calendarApi.events[0].start_time).toBe(`${TEST_DATE}T14:00:00.000Z`);
  await expect.poll(() => calendarApi.events[0].end_time).toBe(`${TEST_DATE}T15:00:00.000Z`);
  await expect(page.locator('.calendar-body')).toHaveAttribute('aria-busy', 'false');
  const resizer = event.locator('.fc-event-resizer-end');
  await event.hover();
  await expect(resizer).toBeVisible({ timeout: 5000 });
  await resizer.scrollIntoViewIfNeeded();
  await resizer.hover();
  const resizeBounds = await resizer.boundingBox();
  expect(resizeBounds).not.toBeNull();
  await page.mouse.move(resizeBounds!.x + resizeBounds!.width / 2, resizeBounds!.y + resizeBounds!.height / 2);
  await page.mouse.down();
  await page.mouse.move(resizeBounds!.x + resizeBounds!.width / 2, resizeBounds!.y + resizeBounds!.height / 2 + 8, { steps: 2 });
  await page.mouse.move(resizeBounds!.x + resizeBounds!.width / 2, resizeBounds!.y + resizeBounds!.height / 2 + hourHeight / 2, { steps: 12 });
  await page.mouse.up();
  await expect.poll(() => calendarApi.events[0].end_time).toBe(`${TEST_DATE}T15:30:00.000Z`);
  await page.reload();
  await calendarItem(page, 'Move this event').click();
  await expect(page.getByRole('dialog', { name: 'Move this event', exact: true })).toContainText('14:00 – 15:30');
});

for (const width of [320, 390]) {
  test(`mobile ${width}px opens agenda and keeps the calendar and editor within the viewport`, async ({ page, calendarApi }, testInfo) => {
    await page.setViewportSize({ width, height: 844 });
    calendarApi.events.push(seedEvent('Mobile planning session'));
    await openCalendar(page);
    await expect(page.locator('.calendar-body')).toHaveAttribute('data-view', 'listWeek');
    await expect(page.getByRole('combobox', { name: 'Calendar view', exact: true })).toBeVisible();
    await expect(page.getByRole('group', { name: 'Change calendar view', includeHidden: true })).toBeHidden();
    await expect(calendarItem(page, 'Mobile planning session')).toBeVisible();
    expect(await page.evaluate(() => document.documentElement.scrollWidth <= window.innerWidth)).toBe(true);
    await screenshot(page, testInfo, `calendar-${width}.png`);
    await calendarItem(page, 'Mobile planning session').click();
    let dialog = page.getByRole('dialog', { name: 'Mobile planning session', exact: true });
    await dialog.getByRole('button', { name: 'Edit event', exact: true }).click();
    dialog = page.getByRole('dialog', { name: 'Edit event', exact: true });
    await expect(dialog.getByLabel('Title', { exact: true })).toHaveValue('Mobile planning session');
    expect(await dialog.evaluate((node) => node.scrollWidth <= node.clientWidth)).toBe(true);
    const bounds = await dialog.boundingBox();
    expect(bounds?.x).toBeGreaterThanOrEqual(0);
    expect((bounds?.x ?? 0) + (bounds?.width ?? 0)).toBeLessThanOrEqual(width);
    if (width === 390) await screenshot(page, testInfo, 'calendar-mobile-editor.png');
    await dialog.getByLabel('Title', { exact: true }).fill('Updated from mobile');
    await dialog.getByRole('button', { name: 'Save changes', exact: true }).click();
    await expect(calendarItem(page, 'Updated from mobile')).toBeVisible();
    expect(calendarApi.events[0].title).toBe('Updated from mobile');
    await page.getByRole('combobox', { name: 'Calendar view', exact: true }).selectOption('dayGridMonth');
    await expect(page.locator('.calendar-body')).toHaveAttribute('data-view', 'dayGridMonth');
    expect(await page.evaluate(() => document.documentElement.scrollWidth <= window.innerWidth)).toBe(true);
  });
}

for (const width of [768, 1440]) {
  test(`calendar fits a ${width}px viewport with a usable month view`, async ({ page, calendarApi }, testInfo) => {
    await page.setViewportSize({ width, height: 1000 });
    calendarApi.events.push(seedEvent('Afternoon planning'));
    await openCalendar(page);
    await expect(page.locator('.calendar-body')).toHaveAttribute('data-view', 'dayGridMonth');
    await expect(calendarItem(page, 'Afternoon planning')).toBeVisible();
    expect(await page.evaluate(() => document.documentElement.scrollWidth <= window.innerWidth)).toBe(true);
    await screenshot(page, testInfo, `calendar-${width}.png`);
  });
}

test('calendar and event details work in a persistent dark theme', async ({ page, calendarApi }, testInfo) => {
  await page.setViewportSize({ width: 1440, height: 1000 });
  calendarApi.events.push(seedEvent('Evening focus', { location: 'Quiet room' }));
  await openCalendar(page);
  await page.getByRole('button', { name: /Change theme/ }).click();
  await page.getByRole('radio', { name: /^Midnight dark / }).check();
  await page.getByRole('button', { name: 'Done', exact: true }).click();
  await expect(page.locator('html')).toHaveAttribute('data-theme', 'midnight-dark');
  await expect(calendarItem(page, 'Evening focus')).toBeVisible();
  await screenshot(page, testInfo, 'calendar-dark.png');
  await calendarItem(page, 'Evening focus').click();
  await expect(page.getByRole('dialog', { name: 'Evening focus', exact: true }).getByText('Quiet room', { exact: true })).toBeVisible();
  await page.keyboard.press('Escape');
  await page.reload();
  await expect(page.locator('html')).toHaveAttribute('data-theme', 'midnight-dark');
  await expect(calendarItem(page, 'Evening focus')).toBeVisible();
});

for (const timezoneId of ['America/Los_Angeles', 'Pacific/Auckland']) {
  test.describe(`all-day dates in ${timezoneId}`, () => {
    test.use({ timezoneId });
    test('creates and imports canonical dates on the selected calendar day', async ({ page, calendarApi }) => {
      await openCalendar(page);
      await page.getByRole('button', { name: 'New event', exact: true }).click();
      const dialog = page.getByRole('dialog', { name: 'New event', exact: true });
      await dialog.getByLabel('Title', { exact: true }).fill('A whole day');
      await dialog.getByLabel('All day', { exact: true }).check();
      await dialog.getByLabel('Start date', { exact: true }).fill(TEST_DATE);
      await dialog.getByLabel('End date', { exact: true }).fill(TEST_DATE);
      await dialog.getByRole('button', { name: 'Create event', exact: true }).click();
      await expect(dialog).not.toBeVisible();
      expect(calendarApi.events[0]).toMatchObject({ start_time: `${TEST_DATE}T00:00:00.000Z`, end_time: '2026-10-30T00:00:00.000Z', all_day: true });
      const content = [
        'BEGIN:VCALENDAR', 'VERSION:2.0', 'PRODID:-//Zen Calendar Test//EN',
        'BEGIN:VEVENT', 'UID:date-only-calendar-test', 'DTSTART;VALUE=DATE:20261029',
        'DTEND;VALUE=DATE:20261030', 'SUMMARY:Date-only import', 'END:VEVENT', 'END:VCALENDAR', '',
      ].join('\r\n');
      await page.getByLabel('Calendar file', { exact: true }).setInputFiles({ name: 'all-day.ics', mimeType: 'text/calendar', buffer: Buffer.from(content) });
      await expect(page.getByText('1 imported, 0 updated.', { exact: true })).toBeVisible();
      expect(calendarApi.events.find((event) => event.title === 'Date-only import')).toMatchObject({ start_time: `${TEST_DATE}T00:00:00.000Z`, end_time: '2026-10-30T00:00:00.000Z', all_day: true });
      await page.getByLabel('Jump to date', { exact: true }).fill(TEST_DATE);
      await page.getByRole('button', { name: 'Day', exact: true }).click();
      await expect(calendarItem(page, 'A whole day')).toBeVisible();
      await expect(calendarItem(page, 'Date-only import')).toBeVisible();
      await page.getByRole('button', { name: 'Next period' }).click();
      await expect(calendarItem(page, 'A whole day')).toHaveCount(0);
      await expect(calendarItem(page, 'Date-only import')).toHaveCount(0);
    });
  });
}
