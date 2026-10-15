// The first-visit welcome, the tours and What's new.
import { test, expect } from '@playwright/test';
import { openApp } from './helpers.mjs';

test('a first visit offers the tours, and the player tour walks through every step', async ({ page }) => {
  const errors = [];
  page.on('pageerror', (e) => errors.push(e.message));
  await page.goto('/');
  await expect(page.locator('#dialog')).toContainText('Welcome to DCUGen');
  await page.getByRole('button', { name: 'I\'m a player' }).click();
  const card = page.locator('.tour-card');
  await expect(card).toContainText('1 of 7');
  for (let i = 2; i <= 7; i++) {
    await page.locator('#tour-next').click();
    await expect(card).toContainText(`${i} of 7`);
  }
  await page.locator('#tour-next').click();
  await expect(page.locator('.tour')).toHaveCount(0);
  // Not offered again.
  await page.reload();
  await expect(page.locator('#tab-forge')).toBeVisible();
  await page.waitForTimeout(800);
  await expect(page.locator('#dialog')).not.toBeVisible();
  expect(errors).toEqual([]);
});

test('the GM tour opens each section it talks about', async ({ page }) => {
  await openApp(page);
  await page.locator('.help-btn').click();
  await page.getByRole('menuitem', { name: /GM tour/ }).click();
  await page.locator('#tour-next').click();
  await expect(page.locator('#view-bestiary')).toBeVisible();
  await page.keyboard.press('Escape');
  await expect(page.locator('.tour')).toHaveCount(0);
});

test('What\'s new lists the release notes and the version', async ({ page }) => {
  await openApp(page);
  await page.locator('.help-btn').click();
  await page.locator('#whats-new').click();
  await expect(page.locator('#dialog')).toContainText('What\'s new');
  await expect(page.locator('#dialog')).toContainText(/DCUGen \d+\.\d+/);
  await expect(page.locator('#dialog .whatsnew li').first()).toBeVisible();
});
