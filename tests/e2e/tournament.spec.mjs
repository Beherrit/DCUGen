// Tournament: quick fill 8 heroes, play every match, see the champion, open a match's game in the Fights viewer,
// try the other formats, keep the state over a reload, and keep the page inside a phone screen.
import { test, expect } from '@playwright/test';
import { openApp, showTab } from './helpers.mjs';

async function openTournament(page) {
  const errors = await openApp(page);
  await showTab(page, 'battle');
  await page.locator('#bt-sub-tournament').click();
  await expect(page.locator('#tn-setup-panel')).toBeVisible();
  return errors;
}

async function startQuick(page, format = '') {
  if (format) await page.locator(`#tn-format-${format}`).click();
  await page.locator('#tn-quickfill').click();
  await expect(page.locator('#tn-entrants .tn-entrant')).toHaveCount(8);
  await page.locator('#tn-start').click();
  await expect(page.locator('#tn-bracket')).toBeVisible();
}

test('quick fill 8, play all, see the champion, and open a match game in the Fights viewer', async ({ page }) => {
  const errors = await openTournament(page);
  await expect(page.locator('#tn-start')).toBeDisabled();
  await startQuick(page);
  await expect(page.locator('#tn-status')).toContainText('Ready: 8 entrants');
  await expect(page.locator('.tn-match')).toHaveCount(7);
  await expect(page.locator('#tn-champion')).toHaveCount(0);

  await page.locator('#tn-next').click();
  await expect(page.locator('#tn-status')).toContainText('1 match played');
  await expect(page.locator('#tn-games li').first()).toContainText('Quarterfinal 1, game 1');

  await page.locator('#tn-all').click();
  await expect(page.locator('#tn-champion')).toBeVisible();
  await expect(page.locator('#tn-champion b')).not.toBeEmpty();
  await expect(page.locator('#tn-all')).toBeDisabled();
  await expect(page.locator('#tn-standings tbody tr')).toHaveCount(8);
  await expect(page.locator('#tn-standings tbody tr').first()).toContainText('Champion');

  // A match lists its games; each opens the saved fight log in the Fights viewer.
  await page.locator('.tn-match[data-match="W3-1"]').click();
  await expect(page.locator('#tn-detail h2')).toHaveText('Final');
  await page.locator('#tn-games .tn-game-open').first().click();
  await expect(page.locator('#fv-log-panel')).toBeVisible();
  await expect(page.locator('#fv-log .bt-turn').first()).toBeVisible();
  await expect(page.locator('.bt-result').first()).toContainText(/Tournament · Final, game 1/);
  await page.locator('#fv-back').click();
  await page.locator('#fl-source').selectOption('tournament');
  expect(await page.locator('#fl-list .fl-row').count()).toBeGreaterThanOrEqual(7);

  // The tournament is still there after a reload, with its champion.
  await page.reload();
  await showTab(page, 'battle');
  await page.locator('#bt-sub-tournament').click();
  await expect(page.locator('#tn-champion')).toBeVisible();
  await page.locator('#tn-restart').click();
  await expect(page.locator('#tn-champion')).toHaveCount(0);
  await expect(page.locator('#tn-status')).toContainText('Ready');
  expect(errors).toEqual([]);
});

test('double elimination with six entrants shows the losers bracket and grand final, and plays out', async ({ page }) => {
  const errors = await openTournament(page);
  await page.locator('#tn-format-double').click();
  await page.locator('#tn-quickfill').click();
  await page.getByRole('button', { name: /^Remove / }).first().click();
  await page.getByRole('button', { name: /^Remove / }).first().click();
  await expect(page.locator('#tn-entrants .tn-entrant')).toHaveCount(6);
  await page.locator('#tn-bestof').selectOption('3');
  await page.locator('#tn-start').click();
  await expect(page.locator('.tn-section h3')).toHaveText(['Winners bracket', 'Losers bracket', 'Grand final']);
  await expect(page.locator('.tn-match.st-bye').first()).toBeVisible();
  await page.locator('#tn-round').click();
  await expect(page.locator('#tn-status')).toContainText(/\d+ matches? played/);
  await page.locator('#tn-all').click();
  await expect(page.locator('#tn-champion')).toBeVisible();
  await expect(page.locator('#tn-standings tbody tr')).toHaveCount(6);
  expect(errors).toEqual([]);
});

test('a round robin shows the results grid and a points table, and Run 50 tournaments shows title shares', async ({ page }) => {
  await openTournament(page);
  await page.locator('#tn-format-round-robin').click();
  await expect(page.locator('#tn-bestof')).toBeDisabled();
  await startQuick(page);
  await page.locator('#tn-all').click();
  await expect(page.locator('#tn-grid tbody tr')).toHaveCount(8);
  await expect(page.locator('#tn-standings thead')).toContainText('Points');
  await expect(page.locator('#tn-champion')).toBeVisible();
  await page.locator('#tn-odds').click();
  await expect(page.locator('#tn-odds')).toHaveText('Run 50 tournaments', { timeout: 55_000 });
  const rows = page.locator('#tn-odds-list li');
  await expect(rows).toHaveCount(8);
  const shares = await rows.locator('b.num').allInnerTexts();
  expect(shares.reduce((s, t) => s + parseInt(t, 10), 0)).toBeGreaterThanOrEqual(90);
});

test('entrants can be grouped into a team and reordered', async ({ page }) => {
  await openTournament(page);
  await page.locator('#tn-quickfill').click();
  const names = await page.locator('.tn-ename').evaluateAll((els) => els.map((e) => e.value));
  await page.locator('.tn-check').nth(0).check();
  await page.locator('.tn-check').nth(1).check();
  await page.locator('#tn-teamname').fill('Duo');
  await page.locator('#tn-maketeam').click();
  await expect(page.locator('#tn-entrants .tn-entrant')).toHaveCount(7);
  await expect(page.locator('.tn-ename').first()).toHaveValue('Duo');
  await expect(page.locator('.tn-members').first()).toContainText('2 members');
  await page.getByRole('button', { name: 'Move Duo down' }).click();
  await expect(page.locator('.tn-ename').nth(1)).toHaveValue('Duo');
  await expect(page.locator('.tn-ename').first()).toHaveValue(names[2]);
});

test('the tournament page fits a phone screen and the bracket scrolls inside its own box @phone', async ({ page }) => {
  await openTournament(page);
  await startQuick(page, 'double');
  await page.locator('#tn-all').click();
  await expect(page.locator('#tn-champion')).toBeVisible();
  const page_ = await page.evaluate(() => document.documentElement.scrollWidth - document.documentElement.clientWidth);
  expect(page_).toBeLessThanOrEqual(1);
  const box = await page.evaluate(() => { const b = document.getElementById('tn-bracket'); return { inner: b.scrollWidth, outer: b.clientWidth }; });
  expect(box.inner).toBeGreaterThan(box.outer);
  await page.locator('#tn-standings').scrollIntoViewIfNeeded();
  expect(await page.evaluate(() => document.documentElement.scrollWidth - document.documentElement.clientWidth)).toBeLessThanOrEqual(1);
});

test('the setup page fits a phone screen too @phone', async ({ page }) => {
  await openTournament(page);
  await page.locator('#tn-quickfill').click();
  await expect(page.locator('#tn-entrants .tn-entrant')).toHaveCount(8);
  expect(await page.evaluate(() => document.documentElement.scrollWidth - document.documentElement.clientWidth)).toBeLessThanOrEqual(1);
});
