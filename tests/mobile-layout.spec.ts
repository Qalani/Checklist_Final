import { expect, test, type Page, type Locator } from '@playwright/test';
import { installMobileAccount } from './helpers/mobile-account';

test.use({ serviceWorkers: 'block' });

async function inFrame(page: Page, locator: Locator) {
  await expect(locator).toBeVisible();
  const box = await locator.boundingBox();
  const nav = await page.getByRole('navigation', { name: 'Main navigation', exact: true }).filter({ visible: true }).boundingBox();
  expect(box).not.toBeNull();
  expect(box!.y).toBeGreaterThanOrEqual(0);
  expect(box!.y + box!.height).toBeLessThanOrEqual(nav!.y + 1);
}

async function bounded(page: Page) {
  await expect.poll(() => page.evaluate(() => ({
    width: document.documentElement.scrollWidth <= innerWidth,
    height: document.documentElement.scrollHeight <= innerHeight,
    scroll: window.scrollY,
  }))).toEqual({ width: true, height: true, scroll: 0 });
  await inFrame(page, page.locator('main'));
}

for (const viewport of [{ width: 320, height: 568 }, { width: 390, height: 844 }, { width: 844, height: 390 }]) {
  test(`workspace panels fit ${viewport.width}x${viewport.height}`, async ({ page, context }) => {
    await page.setViewportSize(viewport);
    await installMobileAccount(context);
    for (const [route, sections] of [
      ['/', ['Today', 'Workspace']],
      ['/tasks', ['Tasks', 'Progress', 'Categories']],
      ['/notes', ['Library', 'Editor']],
      ['/reminders', ['Reminders', 'New reminder']],
      ['/friends', ['Friends', 'Invite', 'Requests']],
      ['/calendar', ['Calendar', 'Filters', 'Coming up']],
      ['/zen-insights?demo=1', ['Dashboard', 'Overview', 'Layout', 'Analytics']],
    ] as const) {
      await page.goto(route);
      if (route === '/tasks') await expect(page.locator('.tasks-panel')).toBeVisible();
      const controls = page.getByRole('navigation', { name: 'Page sections' });
      await inFrame(page, controls);
      for (const label of sections) {
        await controls.getByRole('button', { name: label, exact: true }).click();
        await bounded(page);
        if (route === '/calendar' && label === 'Calendar') {
          await inFrame(page, page.getByRole('combobox', { name: 'Calendar view', exact: true }));
          await inFrame(page, page.locator('.calendar-body'));
        }
        // Every active content pane starts inside the viewport, even with a
        // short landscape screen. Scrolling is confined to the pane itself.
        for (const panel of await page.locator('[data-mobile-panel="true"]').all()) {
          await expect(panel).toBeInViewport();
        }
      }
    }
    await page.goto('/lists');
    await inFrame(page, page.getByRole('button', { name: 'New list', exact: true }));
    await inFrame(page, page.locator('.lists-collection'));
    await bounded(page);
  });
}

test('opening a note shows its editor immediately and long text scrolls inside it', async ({ page, context }) => {
  await page.setViewportSize({ width: 390, height: 844 });
  const { records } = await installMobileAccount(context);
  records.set('notes', [{
    id: '22222222-2222-4222-8222-222222222222', user_id: '11111111-1111-4111-8111-111111111111',
    title: 'A long note', content: '<p>Writing space</p>'.repeat(150), summary: 'Writing space',
    created_at: new Date().toISOString(), updated_at: new Date().toISOString(), word_count: 300,
  }]);
  await page.goto('/notes');
  await page.getByRole('button', { name: /A long note/ }).click();
  const editor = page.locator('[contenteditable="true"]');
  await inFrame(page, editor);
  await inFrame(page, page.getByRole('button', { name: 'Save now' }));
  await editor.evaluate(el => { el.scrollTop = el.scrollHeight; });
  expect(await editor.evaluate(el => el.scrollTop)).toBeGreaterThan(0);
  await bounded(page);
  await page.setViewportSize({ width: 844, height: 390 });
  await inFrame(page, editor);
  expect((await editor.boundingBox())!.height).toBeGreaterThan(24);
  await inFrame(page, page.getByRole('button', { name: 'Save now' }));
  await page.getByRole('navigation', { name: 'Page sections' }).getByRole('button', { name: 'Library' }).click();
  await inFrame(page, page.getByPlaceholder('Search notes'));
});

test('creation forms keep their primary actions in view on a small phone', async ({ page, context }) => {
  await page.setViewportSize({ width: 320, height: 568 });
  await installMobileAccount(context);
  const visibleAction = async (action: Locator) => {
    await expect(action).toBeVisible();
    const box = await action.boundingBox();
    expect(box!.y).toBeGreaterThanOrEqual(0);
    expect(box!.y + box!.height).toBeLessThanOrEqual(568);
  };
  await page.goto('/tasks');
  await page.getByRole('button', { name: 'Page actions' }).click();
  await page.getByRole('button', { name: 'New Task', exact: true }).click();
  await visibleAction(page.getByRole('button', { name: 'Save Task', exact: true }));
  await page.getByRole('button', { name: 'Cancel', exact: true }).click();
  await page.getByRole('button', { name: 'Quick-create: New task' }).click();
  await visibleAction(page.getByRole('button', { name: 'Add task', exact: true }));
  await page.getByRole('button', { name: 'Close', exact: true }).click();

  await page.goto('/lists');
  await page.getByRole('button', { name: 'New list', exact: true }).click();
  const listForm = page.getByRole('dialog', { name: 'Create a new list' });
  await expect(listForm).toBeVisible();
  await visibleAction(listForm.getByRole('button', { name: 'Create list', exact: true }));
  await page.keyboard.press('Escape');
  await expect(listForm).toHaveCount(0);

  await page.goto('/calendar');
  await page.getByRole('button', { name: 'New event', exact: true }).click();
  await visibleAction(page.getByRole('button', { name: 'Create event', exact: true }));
  await page.getByRole('button', { name: 'Close dialog' }).click();

  await page.goto('/reminders');
  await page.getByRole('navigation', { name: 'Page sections' }).getByRole('button', { name: 'New reminder' }).click();
  await inFrame(page, page.getByRole('button', { name: 'Schedule reminder' }));
});

test('long task collections scroll without moving section controls or navigation', async ({ page, context }) => {
  await page.setViewportSize({ width: 390, height: 844 });
  const { records } = await installMobileAccount(context);
  records.set('tasks', Array.from({ length: 40 }, (_, i) => ({
    id: `task-${i}`, title: `Mobile task ${i + 1}`, completed: false, priority: 'medium',
    category_id: null, user_id: '11111111-1111-4111-8111-111111111111',
    created_at: new Date().toISOString(), updated_at: new Date().toISOString(), position: i,
  })));
  await page.goto('/tasks');
  await expect(page.getByText('Mobile task 1', { exact: true })).toBeVisible();
  const cards = page.locator('.tasks-panel > div > div:last-child');
  await cards.evaluate(el => { el.scrollTop = el.scrollHeight; });
  expect(await cards.evaluate(el => el.scrollTop)).toBeGreaterThan(0);
  await inFrame(page, page.getByRole('navigation', { name: 'Page sections' }));
  await bounded(page);
});
