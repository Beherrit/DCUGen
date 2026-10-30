// City war: quick fill 12 teams, step a few turns, run to the end, see a winner and standings, watch one fight from
// the log in the One fight view, and keep the page inside a phone screen.
import { test, expect } from '@playwright/test';
import { openApp, showTab } from './helpers.mjs';

async function openCityWar(page) {
  const errors = await openApp(page);
  await showTab(page, 'battle');
  await page.locator('#bt-sub-citywar').click();
  await expect(page.locator('#cw-map')).toBeVisible();
  return errors;
}

async function quickFill(page) {
  await page.locator('#cw-quickfill').click();
  await expect(page.locator('#cw-teams .cw-team-row')).toHaveCount(12);
}

test('quick fill 12 teams, step, run to the end, see the winner and standings, and watch a fight', async ({ page }) => {
  const errors = await openCityWar(page);
  await expect(page.locator('.cw-cell')).toHaveCount(144);
  await expect(page.locator('#cw-step')).toBeDisabled();
  await quickFill(page);
  await expect(page.locator('.cw-team')).toHaveCount(12);
  // every cell carries one of the three terrain marks
  await expect(page.locator('.cw-cell .cw-mark').first()).toHaveText(/^[BSP]$/);

  await page.locator('#cw-step').click();
  await page.locator('#cw-step').click();
  await expect(page.locator('#cw-turn')).toHaveText('Turn 2');
  await expect(page.locator('#cw-log li').first()).toBeVisible();
  await expect(page.locator('#cw-standings')).toBeVisible();

  await page.locator('#cw-end').click();
  await expect(page.locator('#cw-status')).toContainText(/won after \d+ turns|No single winner/);
  await expect(page.locator('#cw-step')).toBeDisabled();
  await expect(page.locator('#cw-standings tbody tr')).toHaveCount(12);
  await expect(page.locator('#cw-standings tbody tr').first()).toContainText('Winner');
  await expect(page.locator('.cw-team')).toHaveCount(1);
  await expect(page.locator('#cw-log li.cw-log-end').first()).toContainText('last team standing');

  // The fights were kept in Fights with the City war source.
  await page.locator('#bt-sub-fights').click();
  await page.locator('#fl-source').selectOption('city-war');
  expect(await page.locator('#fl-list .fl-row').count()).toBeGreaterThanOrEqual(11);
  await expect(page.locator('#fl-list .fl-row').first()).toContainText(/Turn \d+: .+ at [A-L]\d+/);
  await page.locator('#bt-sub-citywar').click();

  // Watch one fight from the log: it loads into One fight, ready to play with the same fighters.
  const fightLine = page.locator('#cw-log li.cw-log-fight').last();
  const text = await fightLine.locator('span').innerText();
  await fightLine.getByRole('button', { name: /Watch this fight/ }).click();
  await expect(page.locator('#bt-fight')).toBeVisible();
  const names = text.match(/^Turn \d+: (.+?)(?: \(| ambush| fight| walk)/)[1];
  await expect(page.locator('.bt-name')).toHaveValue(new RegExp(`^${names.replace(/[.*+?^${}()|[\]\\]/g, '\\$&')} vs `));
  await page.locator('#bt-fight').click();
  await page.keyboard.press('e');
  await expect(page.locator('#bt-comic')).toBeVisible();
  await expect(page.locator('#bt-kept')).toHaveCount(0);
  expect(errors).toEqual([]);
});

test('clicking a free cell cycles its terrain, and Place team moves the selected team', async ({ page }) => {
  await openCityWar(page);
  await quickFill(page);
  const free = page.locator('.cw-cell:not(:has(.cw-team))').first();
  const before = await free.getAttribute('data-terrain');
  await free.click();
  const after = await page.locator(`.cw-cell[data-cell="${await free.getAttribute('data-cell')}"]`).getAttribute('data-terrain');
  expect(after).not.toBe(before);

  await page.locator('#cw-teams .cw-team-pick').nth(1).click();
  await page.locator('#cw-place').click();
  const target = page.locator('.cw-cell:not(:has(.cw-team))').nth(5);
  const cell = await target.getAttribute('data-cell');
  await target.click();
  await expect(page.locator(`.cw-cell[data-cell="${cell}"] .cw-team`)).toHaveCount(1);
  await expect(page.locator('.cw-team')).toHaveCount(12);
});

test('Run 50 cities shows each team a win share', async ({ page }) => {
  await openCityWar(page);
  await quickFill(page);
  await page.locator('#cw-odds').click();
  await expect(page.locator('#cw-odds')).toHaveText('Run 50 cities', { timeout: 50_000 });
  const rows = page.locator('#cw-odds-list li');
  await expect(rows).toHaveCount(12);
  const shares = await rows.locator('b.num').allInnerTexts();
  const sum = shares.reduce((s, t) => s + parseInt(t, 10), 0);
  expect(sum).toBeGreaterThanOrEqual(90);
});

test('the city war page fits a phone screen @phone', async ({ page }) => {
  await openCityWar(page);
  await quickFill(page);
  await page.locator('#cw-end').click();
  await expect(page.locator('#cw-standings')).toBeVisible();
  const map = await page.locator('#cw-map').boundingBox();
  expect(map.width).toBeGreaterThan(250);
  expect(Math.abs(map.width - map.height)).toBeLessThan(map.width * 0.1);
  const overflow = await page.evaluate(() => document.documentElement.scrollWidth - document.documentElement.clientWidth);
  expect(overflow).toBeLessThanOrEqual(1);
  // the side panel stacks under the map
  const side = await page.locator('.cw-side').boundingBox();
  expect(side.y).toBeGreaterThan(map.y + map.height - 1);
});
