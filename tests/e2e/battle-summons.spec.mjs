// The Battle Room shows what a fighter calls: summoned minions as dashed tokens in their team colour with plain words
// ("summoned by ...") in their label. No icon glyphs, and nothing in the console.
import { test, expect } from '@playwright/test';
import { openApp, showTab } from './helpers.mjs';

async function addBeast(page, q, team) {
  await page.locator('#bt-beast-q').fill(q);
  await page.locator('#bt-beasts .bt-pick').first().getByRole('button', { name: new RegExp(`team ${team}$`) }).click();
}

test('a fighter that summons: its minions appear on the grid with a dashed ring, a plain-word label, and no console errors', async ({ page }) => {
  const errors = await openApp(page);
  await showTab(page, 'battle');
  await addBeast(page, 'vampire lord', 'A');
  await addBeast(page, 'ogre', 'B');
  await page.locator('#bt-fight').click();
  await page.keyboard.press('e'); // run it out
  await expect(page.locator('#bt-comic')).toBeVisible();
  const minions = page.locator('svg.bt-grid .bg-token.summoned');
  expect(await minions.count()).toBeGreaterThan(0);
  const label = await minions.first().getAttribute('aria-label');
  expect(label).toMatch(/summoned by Vampire Lord/);
  expect(label).not.toMatch(/[\u{1F300}-\u{1FAFF}☀-➿]/u);
  await expect(minions.first().locator('circle')).toHaveAttribute('stroke-dasharray', /.+/);
  await expect(page.locator('#bt-log-panel')).toContainText(/Vampire Lord uses Children of the Night/);
  expect(errors).toEqual([]);
});
