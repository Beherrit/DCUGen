// Finding your way: where to start on an empty Forge, and the player / GM sections switch.
import { test, expect } from '@playwright/test';
import { openApp } from './helpers.mjs';

test('the empty Forge offers where to start, and each card goes there', async ({ page }) => {
  const errors = await openApp(page);
  await expect(page.locator('.start-cards .start-card')).toHaveCount(6);
  await page.locator('.start-card', { hasText: 'Run a fight' }).click();
  await expect(page.locator('#view-battle')).toBeVisible();
  await page.locator('#tab-forge').click();
  await page.locator('.start-card', { hasText: 'Roll a character' }).click();
  await expect(page.locator('#save-bottom')).toBeVisible();
  expect(errors).toEqual([]);
});

test('players can hide the GM sections, and a GM link brings them back', async ({ page }) => {
  await openApp(page);
  await page.locator('#mode-toggle').click();
  await expect(page.locator('#tab-screen')).toBeHidden();
  await expect(page.locator('#tab-battle')).toBeVisible();
  await page.reload();
  await expect(page.locator('#tab-world')).toBeHidden();
  // Search still reaches everything, and opening a GM section shows them again.
  await page.keyboard.press('Control+k');
  await page.locator('#palette-q').fill('GM Screen');
  await page.keyboard.press('Enter');
  await expect(page.locator('#view-screen')).toBeVisible();
  await expect(page.locator('#tab-world')).toBeVisible();
});

test('the first-visit choice "I\'m a player" shows the player sections', async ({ page }) => {
  await page.goto('/');
  await page.getByRole('button', { name: 'I\'m a player' }).click();
  await page.keyboard.press('Escape');
  await expect(page.locator('#tab-gm')).toBeHidden();
});

test('Easier reading: text size, colour-coded powers and the easy-read font stick after a reload', async ({ page }) => {
  await openApp(page);
  await page.locator('#read-btn').click();
  await page.locator('.read-sizes [data-size="xl"]').click();
  await page.locator('#read-font').check();
  await page.getByRole('button', { name: 'Done' }).click();
  await page.reload();
  const html = page.locator('html');
  await expect(html).toHaveClass(/read-zoom/);
  await expect(html).toHaveClass(/read-color/);
  await expect(html).toHaveClass(/read-font/);
  expect(await page.evaluate(() => getComputedStyle(document.documentElement).getPropertyValue('--read-zoom').trim())).toBe('1.3');
});
