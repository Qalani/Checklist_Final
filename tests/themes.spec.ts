import { test, expect, TEST_USER_ID } from './calendar-fixture';

// Measure the rendered colours, including opacity, rather than comparing tokens.
async function contrast(locator: import('@playwright/test').Locator) {
  return locator.evaluate(element => {
    const rgb = (value: string) => value.match(/[\d.]+/g)!.map(Number);
    const luminance = (channels: number[]) => channels.slice(0, 3).map(value => {
      const s = value / 255;
      return s <= 0.04045 ? s / 12.92 : ((s + 0.055) / 1.055) ** 2.4;
    }).reduce((sum, value, i) => sum + value * [0.2126, 0.7152, 0.0722][i], 0);
    const backgrounds: number[][] = [];
    for (let node: Element | null = element; node; node = node.parentElement) {
      backgrounds.push(rgb(getComputedStyle(node).backgroundColor));
    }
    const background = backgrounds.reverse().reduce((base, color) => {
      const alpha = color[3] ?? 1;
      return base.map((value, i) => value * (1 - alpha) + color[i] * alpha);
    }, [255, 255, 255]);
    const foreground = rgb(getComputedStyle(element).color);
    const alpha = foreground[3] ?? 1;
    const blended = foreground.slice(0, 3).map((value, i) => value * alpha + background[i] * (1 - alpha));
    const values = [luminance(background), luminance(blended)].sort((a, b) => a - b);
    return (values[1] + 0.05) / (values[0] + 0.05);
  });
}

for (const theme of ['midnight-dark', 'forest-dark']) {
  test(`${theme}: readable actions, forms and calendar on desktop and mobile`, async ({ page, calendarApi }, testInfo) => {
    calendarApi.events.push({id:'theme-event',user_id:TEST_USER_ID,title:'Design review',start_time:'2026-10-29T11:00:00Z',end_time:'2026-10-29T12:00:00Z',all_day:false});
    await page.addInitScript(value => localStorage.setItem('zen-workspace-theme', value), theme);
    await page.setViewportSize({width:1440,height:1000});
    await page.goto('/');
    await expect(page.getByRole('heading', {name:'Find clarity in your day'})).toBeVisible();
    await expect(page.locator('html')).toHaveAttribute('data-theme', theme);
    const primary = page.getByRole('link',{name:'View my tasks'});
    expect(await contrast(primary)).toBeGreaterThanOrEqual(4.5);
    await primary.hover();
    expect(await contrast(primary)).toBeGreaterThanOrEqual(4.5);
    await page.screenshot({path:testInfo.outputPath(`${theme}-home.png`),fullPage:true});
    await primary.click();
    await expect(page.getByRole('button',{name:'New Task',exact:true})).toBeVisible();
    expect(await contrast(page.getByRole('button',{name:'New Task',exact:true}))).toBeGreaterThanOrEqual(4.5);
    await page.getByRole('button',{name:'New Task',exact:true}).click();
    const title = page.getByPlaceholder('What needs to be done?');
    await expect(title).toBeVisible();
    await title.fill('Plan a clear day');
    expect(await contrast(title)).toBeGreaterThanOrEqual(4.5);
    await title.focus();
    await page.keyboard.press('Tab');
    await page.screenshot({path:testInfo.outputPath(`${theme}-task-form.png`)});
    await page.goto('/calendar');
    await expect(page.getByText('Design review', {exact:true}).first()).toBeVisible();
    await page.screenshot({path:testInfo.outputPath(`${theme}-calendar.png`),fullPage:true});
    await page.setViewportSize({width:320,height:740});
    await page.getByRole('button',{name:/Change theme/}).click();
    const picker = page.getByRole('dialog',{name:'Choose your theme'});
    await expect(picker).toBeVisible();
    await expect(picker.getByRole('heading')).toBeInViewport({ ratio: 1 });
    await expect(picker.getByRole('button', { name: 'Done', exact: true })).toBeInViewport({ ratio: 1 });
    await expect(picker.getByRole('radio',{checked:true})).toBeFocused();
    await expect(picker.getByRole('radio',{checked:true})).toHaveValue(theme);
    await page.screenshot({path:testInfo.outputPath(`${theme}-mobile-picker.png`)});
    expect(await page.evaluate(()=>document.documentElement.scrollWidth <= innerWidth)).toBe(true);
    await page.keyboard.press('Escape');
    await expect(picker).not.toBeVisible();
    await expect(page.getByRole('button',{name:/Change theme/})).toBeFocused();
    await page.screenshot({path:testInfo.outputPath(`${theme}-mobile-calendar.png`),fullPage:true});
  });
}

test('theme choices work by keyboard, persist and remain inside mobile settings', async ({page,calendarApi}) => {
  void calendarApi;
  await page.setViewportSize({width:320,height:740});
  await page.goto('/');
  await page.getByRole('button',{name:'Settings',exact:true}).click();
  const settings=page.getByRole('dialog',{name:'Workspace settings'});
  await settings.getByRole('radio',{name:/Midnight dark/}).check();
  await expect(page.locator('html')).toHaveAttribute('data-theme','midnight-dark');
  await page.keyboard.press('ArrowRight');
  await expect(settings.getByRole('radio',{name:/Forest dark/})).toBeChecked();
  await expect(page.locator('html')).toHaveAttribute('data-theme','forest-dark');
  const bounds=await settings.boundingBox();
  expect(bounds!.x).toBeGreaterThanOrEqual(0);
  expect(bounds!.x+bounds!.width).toBeLessThanOrEqual(320);
  await page.reload();
  await expect(page.locator('html')).toHaveAttribute('data-theme','forest-dark');
  await page.getByRole('button',{name:'Settings',exact:true}).click();
  await expect(settings.getByRole('radio',{name:/Forest dark/})).toBeChecked();
  await settings.getByRole('radio',{name:/Zen light/}).check();
  await expect(page.locator('html')).toHaveAttribute('data-theme-mode','light');
  await expect(page.locator('html')).not.toHaveClass(/dark/);
  await expect.poll(()=>page.locator('body').evaluate(el=>getComputedStyle(el).backgroundColor)).toBe('rgb(250, 252, 255)');
});
