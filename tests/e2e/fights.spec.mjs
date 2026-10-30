// Saved fights: a finished fight is kept with its log, opened from the Fights page, and counted on the leaderboard.
import { test, expect } from '@playwright/test';
import { openApp, showTab } from './helpers.mjs';

async function addBeast(page, q, team) {
  await page.locator('#bt-beast-q').fill(q);
  await page.locator('#bt-beasts .bt-pick').first().getByRole('button', { name: new RegExp(`team ${team}$`) }).click();
}

async function quickFight(page) {
  await showTab(page, 'battle');
  await addBeast(page, 'ogre', 'A');
  await addBeast(page, 'wolf', 'B');
  await page.locator('#bt-fight').click();
  await page.keyboard.press('e');
  await expect(page.locator('#bt-comic')).toBeVisible();
}

test('a finished fight is saved, listed on the Fights page, opened with its log, and counted on the leaderboard', async ({ page }) => {
  const errors = await openApp(page);
  await quickFight(page);
  await expect(page.locator('#bt-kept')).toContainText('Saved to Fights');

  // The link opens that fight in the viewer, with the same log controls as the Battle Room.
  await page.locator('#bt-kept-open').click();
  await expect(page.locator('#fv-log-panel')).toBeVisible();
  await expect(page.locator('#fv-log .bt-turn').first()).toBeVisible();
  await expect(page.locator('#fv-stats')).toContainText('Ogre');
  await page.getByRole('button', { name: 'Key moments' }).click();
  await expect(page.locator('#fv-log')).toContainText(/The fight is over/);
  await page.locator('#bt-log-dice').uncheck();
  await expect(page.locator('#fv-log .bt-log-roll')).toHaveCount(0);

  // Export downloads the text log.
  const download = page.waitForEvent('download');
  await page.locator('#fv-export').click();
  expect((await download).suggestedFilename()).toMatch(/-log\.txt$/);

  // The list shows the fight, and the filter by character finds it (or not).
  await page.locator('#fv-back').click();
  await expect(page.locator('#fl-list .fl-row')).toHaveCount(1);
  await expect(page.locator('#fl-list')).toContainText(/Ogre|Wolf/);
  await page.locator('#fl-q').fill('nobody-by-this-name');
  await expect(page.locator('#fl-list')).toHaveCount(0);
  await page.locator('#fl-q').fill('wolf');
  await expect(page.locator('#fl-list .fl-row')).toHaveCount(1);

  // The leaderboard counts both fighters once.
  await page.locator('#fl-page-board').click();
  await expect(page.locator('#fb-table tbody tr')).toHaveCount(2);
  await expect(page.locator('#fb-table')).toContainText('Ogre');

  // It is still there after a reload, and it can be deleted.
  await page.reload();
  await showTab(page, 'battle');
  await page.locator('#bt-sub-fights').click();
  await page.locator('#fl-page-list').click();
  await expect(page.locator('#fl-list .fl-row')).toHaveCount(1);
  await page.getByRole('button', { name: /^Delete:/ }).click();
  await page.getByRole('button', { name: 'Delete', exact: true }).click();
  await expect(page.locator('#fl-empty')).toBeVisible();
  expect(errors).toEqual([]);
});

test('with Keep fight logs off, a finished fight is not saved', async ({ page }) => {
  await openApp(page);
  await showTab(page, 'battle');
  await page.locator('#bt-sub-fights').click();
  await page.locator('#fl-keep').uncheck();
  await page.locator('#bt-sub-fight').click();
  await quickFight(page);
  await expect(page.locator('#bt-kept')).toHaveCount(0);
  await page.locator('#bt-sub-fights').click();
  await expect(page.locator('#fl-empty')).toBeVisible();
});

test('the Fights page fits a phone screen @phone', async ({ page }) => {
  await openApp(page);
  await quickFight(page);
  await page.locator('#bt-kept-open').click();
  await expect(page.locator('#fv-stats')).toBeVisible();
  const overflow = await page.evaluate(() => document.documentElement.scrollWidth - document.documentElement.clientWidth);
  expect(overflow).toBeLessThanOrEqual(1);
});
