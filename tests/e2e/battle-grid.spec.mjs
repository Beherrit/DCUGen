// The Battle Room board: a 12 by 12 grid with tokens, range shading for the selected fighter, a scale picker,
// click-to-place cover, and no sideways scroll on a phone.
import { test, expect } from '@playwright/test';
import { openApp, showTab } from './helpers.mjs';

async function addBeast(page, q, team) {
  await page.locator('#bt-beast-q').fill(q);
  await page.locator('#bt-beasts .bt-pick').first().getByRole('button', { name: new RegExp(`team ${team}$`) }).click();
}

async function setUp(page) {
  const errors = await openApp(page);
  await showTab(page, 'battle');
  await addBeast(page, 'ogre', 'A');
  await addBeast(page, 'wolf', 'B');
  return errors;
}

test('the board is a 12 by 12 grid with a token for each fighter; picking one shades its ranges', async ({ page }) => {
  const errors = await setUp(page);
  const grid = page.locator('svg.bt-grid');
  await expect(grid).toBeVisible();
  await expect(grid.locator('rect.bg-cell')).toHaveCount(144);
  await expect(grid).toHaveAttribute('aria-label', /12 by 12 squares of 30 ft/);
  await expect(grid.locator('.bg-token')).toHaveCount(2);
  await grid.locator('.bg-token').first().click();
  await expect(page.locator('.bt-grid-info')).toContainText(/reaches the same or a next square|short to/);
  await expect(grid.locator('rect.bg-cell.move').first()).toBeVisible();
  await expect(grid.locator('rect.bg-cell.band-short').first()).toBeVisible();
  expect(errors).toEqual([]);
});

test('the scale picker changes the square size, and click-to-place drops cover on a square', async ({ page }) => {
  await setUp(page);
  await page.locator('#bt-rail-arena').click(); // the scale picker lives in the Arena tab of the setup rail
  await page.locator('#bt-scale-street').click();
  await expect(page.locator('svg.bt-grid')).toHaveAttribute('aria-label', /squares of 5 ft/);
  await page.locator('#bt-scale-district').click();
  await expect(page.locator('svg.bt-grid')).toHaveAttribute('aria-label', /squares of 250 ft/);
  await page.locator('#bt-cover-add').click();
  await page.locator('svg.bt-grid rect.bg-cell[data-x="5"][data-y="5"]').click({ force: true });
  await expect(page.locator('svg.bt-grid .bg-piece')).toHaveCount(1);
  await expect(page.locator('.bt-scenery-text').first()).toContainText('F6');
});

test('the board and the log fit a phone screen @phone', async ({ page }) => {
  await setUp(page);
  await page.locator('#bt-fight').click();
  await expect(page.locator('#bt-log-panel .bt-turn').first()).toBeVisible();
  const box = await page.locator('svg.bt-grid').boundingBox();
  expect(box.width).toBeGreaterThan(200);
  expect(Math.abs(box.width - box.height)).toBeLessThan(box.width * 0.1);
  const overflow = await page.evaluate(() => document.documentElement.scrollWidth - document.documentElement.clientWidth);
  expect(overflow).toBeLessThanOrEqual(1);
});

test('in setup a token can be dragged to another square', async ({ page }) => {
  await setUp(page);
  await page.locator('svg.bt-grid').scrollIntoViewIfNeeded();
  const token = page.locator('svg.bt-grid .bg-token').first();
  const from = await token.boundingBox();
  const target = await page.locator('svg.bt-grid rect.bg-cell[data-x="4"][data-y="2"]').boundingBox();
  await page.mouse.move(from.x + from.width / 2, from.y + from.height / 2);
  await page.mouse.down();
  await page.mouse.move(target.x + target.width / 2, target.y + target.height / 2, { steps: 6 });
  await page.mouse.up();
  await expect(page.locator('svg.bt-grid .bg-token').first()).toHaveAttribute('aria-label', /at E3/);
});
