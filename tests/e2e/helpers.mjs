// Shared steps for the browser tests.
import { expect } from '@playwright/test';

/** Open the app fresh and fail the test on any uncaught page error. Returns the list of errors seen. */
export async function openApp(page, hash = '') {
  const errors = [];
  page.on('pageerror', (e) => errors.push(e.message));
  // Skip the first-run tour unless a test asks for it.
  await page.addInitScript(() => { try { if (!sessionStorage.getItem('e2e.tour')) localStorage.setItem('dcugen.tour.v1', 'done'); } catch { /* ignore */ } });
  await page.goto(`/${hash}`);
  await expect(page.locator('#tab-forge')).toBeVisible();
  return errors;
}

export async function rollCharacter(page, seed) {
  if (seed) {
    if (!(await page.locator('#seed').isVisible())) await page.locator('#rail-more summary').click();
    await page.locator('#seed').fill(seed);
  }
  await page.locator('#roll').click();
  await expect(page.locator('#save-bottom')).toBeVisible();
}

export async function showTab(page, name) {
  await page.locator(`#tab-${name}`).click();
  await expect(page.locator(`#view-${name}`)).toBeVisible();
}

/** The codename on the open sheet. */
export const codename = (page) => page.locator('#view-forge h1.codename').first();
