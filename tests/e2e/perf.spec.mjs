// Starting fast: the 3D library waits until the first 3D view, and the rules data still loads whole.
import { test, expect } from '@playwright/test';
import { openApp, showTab } from './helpers.mjs';

test('the 3D library is not run at start, and the 3D view still opens', async ({ page }) => {
  const errors = await openApp(page);
  expect(await page.evaluate(() => typeof window.THREE)).toBe('undefined');
  await showTab(page, 'screen');
  await page.locator('#gm-view-map').click();
  await page.locator('#bm-3d').click();
  await expect(page.locator('.m3d')).toBeVisible();
  expect(await page.evaluate(() => typeof window.THREE)).toBe('object');
  expect(errors).toEqual([]);
});

test('every rules list made it through the faster data loading', async ({ page }) => {
  await openApp(page);
  await showTab(page, 'bestiary');
  await expect(page.locator('#view-bestiary')).toContainText('429');
  await showTab(page, 'rules');
  await expect(page.locator('#view-rules')).toContainText('Affliction');
});
