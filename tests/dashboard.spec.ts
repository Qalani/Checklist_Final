import { test, expect } from '@playwright/test';

test('widget visibility toggles persist across reloads in demo mode', async ({ page }) => {
  await page.goto('/zen-insights?demo=1');

  await expect(page.getByText('Demo mode: changes are stored locally in this browser.')).toBeVisible();
  const productivityWidget = page.locator('[data-widget-type="productivity"]');
  await expect(productivityWidget).toBeVisible();

  const productivityToggle = page
    .locator('li', { hasText: 'Productivity Pulse' })
    .locator('input[type="checkbox"]');

  await productivityToggle.click();
  await expect(productivityWidget).toHaveCount(0);

  await page.reload();
  await expect(page.getByText('Demo mode: changes are stored locally in this browser.')).toBeVisible();
  await expect(page.locator('[data-widget-type="productivity"]')).toHaveCount(0);

  await productivityToggle.click();
  await expect(page.locator('[data-widget-type="productivity"]')).toBeVisible();
});
