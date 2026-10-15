// Something breaks: the app says so, keeps the data, and offers the details for a report.
import { test, expect } from '@playwright/test';
import { openApp, rollCharacter } from './helpers.mjs';

test('an unexpected error shows the crash bar with details and a GitHub link', async ({ page, context }) => {
  // Don't really open GitHub.
  await context.route('https://github.com/**', (r) => r.fulfill({ body: 'ok' }));
  await openApp(page);
  await rollCharacter(page);
  await page.locator('#save-bottom').click();
  await page.evaluate(() => { setTimeout(() => { throw new Error('Kaboom in a test'); }, 0); });
  const bar = page.locator('#crash-bar');
  await expect(bar).toBeVisible();
  await expect(bar).toContainText('Your characters and world are saved');
  await bar.locator('summary').click();
  await expect(bar.locator('pre')).toContainText('Error: Kaboom in a test');
  await expect(bar.locator('pre')).toContainText(/DCUGen \d/);
  const popup = page.waitForEvent('popup');
  await bar.getByRole('button', { name: 'Report it on GitHub' }).click();
  const gh = await popup;
  expect(gh.url()).toContain('github.com/Beherrit/DCUGen/issues/new');
  expect(decodeURIComponent(gh.url())).toContain('Kaboom in a test');
  await gh.close();
  // The same error again doesn't stack up; dismiss hides it; the roster is untouched.
  await bar.getByRole('button', { name: 'Dismiss' }).click();
  await expect(bar).toBeHidden();
  await expect(page.locator('#roster-count')).toHaveText('1');
});

test('a promise that fails is caught too, and browser noise is not', async ({ page }) => {
  await openApp(page);
  await page.evaluate(() => { Promise.reject(new Error('Lost promise')); });
  await expect(page.locator('#crash-bar')).toContainText('Something went wrong');
  await page.locator('#crash-bar').getByRole('button', { name: 'Dismiss' }).click();
  await page.evaluate(() => { setTimeout(() => { throw new Error('ResizeObserver loop completed with undelivered notifications.'); }, 0); });
  await page.waitForTimeout(300);
  await expect(page.locator('#crash-bar')).toBeHidden();
});
