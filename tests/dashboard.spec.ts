import { test, expect } from '@playwright/test';

test('widget visibility toggles persist across reloads in demo mode', async ({ page }) => {
  await page.goto('/zen-insights?demo=1', { waitUntil: 'networkidle' });

  await expect(page.getByText('Demo mode: changes are stored locally in this browser.')).toBeVisible();
  const productivityWidget = page.locator('[data-widget-type="productivity"]');
  await expect(productivityWidget).toBeVisible();

  // Enter edit mode so the visibility toggle is enabled
  await page.getByRole('button', { name: 'Enter edit mode' }).first().click();

  const productivityToggle = page
    .locator('li', { hasText: 'Productivity Pulse' })
    .locator('input[type="checkbox"]');

  await productivityToggle.click();
  await expect(productivityWidget).toHaveCount(0);

  await page.reload({ waitUntil: 'networkidle' });
  await expect(page.getByText('Demo mode: changes are stored locally in this browser.')).toBeVisible();
  await expect(page.locator('[data-widget-type="productivity"]')).toHaveCount(0);

  // Enter edit mode again after reload to re-enable the toggle
  await page.getByRole('button', { name: 'Enter edit mode' }).first().click();

  await productivityToggle.click();
  await expect(page.locator('[data-widget-type="productivity"]')).toBeVisible();
});
