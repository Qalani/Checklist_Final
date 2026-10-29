import { expect, test } from '@playwright/test';

test.use({ serviceWorkers: 'block' });

test('a false browser connection flag does not keep the workspace offline', async ({ page }) => {
  await page.addInitScript(() => {
    Object.defineProperty(navigator, 'onLine', { configurable: true, get: () => false });
  });
  const healthRequest = page.waitForResponse((response) => response.url().endsWith('/api/health'));
  await page.goto('/?demo=1');
  await healthRequest;
  await expect(page.getByRole('heading', { name: 'Find clarity in your day' })).toBeVisible();
  await expect(page.getByText('You’re offline', { exact: true })).toHaveCount(0);
  await expect(page.getByRole('link', { name: 'Go to Tasks', exact: true })).toHaveAttribute(
    'href',
    '/tasks?demo=1'
  );
});

test('confirmed offline status clears when connectivity returns', async ({ page, context }) => {
  const healthRequest = page.waitForResponse((response) => response.url().endsWith('/api/health'));
  await page.goto('/?demo=1');
  await healthRequest;
  await context.setOffline(true);
  await expect(page.getByText('You’re offline', { exact: true })).toBeVisible();
  await expect(page.getByRole('heading', { name: 'Find clarity in your day' })).toBeVisible();
  await context.setOffline(false);
  await expect(page.getByText('You’re offline', { exact: true })).toHaveCount(0);
});

test('mobile navigation keeps every workspace reachable at narrow widths', async ({ page }) => {
  await page.setViewportSize({ width: 320, height: 740 });
  await page.goto('/?demo=1');
  await expect(page.getByRole('heading', { name: 'Find clarity in your day' })).toBeVisible();
  expect(await page.evaluate(() => document.documentElement.scrollWidth <= window.innerWidth)).toBe(true);
  await page.getByRole('button', { name: 'More navigation' }).click();
  const moreNav = page.getByRole('navigation', { name: 'More navigation' });
  await expect(moreNav.getByRole('link', { name: 'Lists', exact: true })).toBeFocused();
  await expect(moreNav.getByRole('link', { name: 'Lists', exact: true })).toHaveAttribute(
    'href',
    '/lists?demo=1'
  );
  await expect(moreNav.getByRole('link', { name: 'Reminders', exact: true })).toBeVisible();
  await expect(moreNav.getByRole('link', { name: 'Friends', exact: true })).toBeVisible();
  await expect(moreNav.getByRole('link', { name: 'Zen Insights', exact: true })).toBeVisible();
  await page.keyboard.press('Escape');
  await expect(moreNav).toHaveCount(0);
  await expect(page.getByRole('button', { name: 'More navigation' })).toBeFocused();
  await page.getByRole('button', { name: 'Settings', exact: true }).click();
  await expect(page.getByRole('dialog', { name: 'Workspace settings' })).toBeVisible();
});
