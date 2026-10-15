// Homebrew packs: make a theme, an archetype and a creature, roll with them, share the pack, load it elsewhere.
import { test, expect } from '@playwright/test';
import { openApp, rollCharacter, showTab, codename } from './helpers.mjs';

async function openHomebrew(page) {
  await showTab(page, 'workshop');
  await page.getByRole('button', { name: '🧪 Homebrew' }).click();
}

test('make a theme and an archetype, roll with them, and share the pack with another browser', async ({ page, browser }) => {
  const errors = await openApp(page);
  await openHomebrew(page);
  await page.locator('#hb-new').click();
  await page.locator('#hb-pack-name').fill('Ravensport');
  await page.locator('#hb-pack-name').press('Tab');

  await page.locator('#hb-add-themes').click();
  await page.locator('#hb-theme-base').selectOption('fire');
  await page.locator('#hb-theme-name').fill('Hellfire');
  await page.locator('.hb-power input[type=text]').first().fill('Hellfire Blast, Brimstone Bolt');
  await page.locator('#dialog').getByRole('button', { name: 'Add theme' }).click();
  await expect(page.locator('.hb-items')).toContainText('Hellfire');

  await page.locator('#hb-add-archetypes').click();
  await page.locator('#hb-arch-name').fill('Fallen Angel');
  await page.locator('#dialog').getByRole('button', { name: 'Add archetype' }).click();
  await expect(page.locator('.hb-items').nth(1)).toContainText('Fallen Angel');

  // Roll one with the theme: it opens on the Forge and the theme list has it.
  await page.locator('.hb-item', { hasText: 'Hellfire' }).getByRole('button', { name: '🎲 Roll one' }).click();
  await expect(page.locator('#view-forge')).toBeVisible();
  await expect(codename(page)).toBeVisible();
  await expect(page.locator('#theme option', { hasText: 'Hellfire ✦' })).toHaveCount(1);
  await expect(page.locator('#archetype option', { hasText: 'Fallen Angel ✦' })).toHaveCount(1);

  // Share as a code; another browser loads it.
  await openHomebrew(page);
  await page.context().grantPermissions(['clipboard-read', 'clipboard-write']);
  await page.locator('#hb-copy-code').click();
  const code = await page.evaluate(() => navigator.clipboard.readText());
  expect(code).toMatch(/^DCUB1\./);

  const other = await browser.newContext();
  const p2 = await other.newPage();
  await openApp(p2);
  await openHomebrew(p2);
  await p2.locator('#hb-code').fill(code);
  await p2.locator('#hb-code-go').click();
  await expect(p2.locator('#toast')).toContainText('Ravensport: 1 theme, 1 archetype, 0 creatures loaded');
  await showTab(p2, 'forge');
  await expect(p2.locator('#theme option', { hasText: 'Hellfire ✦' })).toHaveCount(1);
  await other.close();
  expect(errors).toEqual([]);
});

test('a creature built on the Forge joins the Bestiary, and switching the pack off takes it out', async ({ page }) => {
  await openApp(page);
  await rollCharacter(page, 'brute-1');
  await openHomebrew(page);
  await page.locator('#hb-new').click();
  await page.locator('#hb-add-creatures').click();
  await page.locator('#hb-cr-name').fill('Sewer Brute');
  await page.locator('#dialog').getByRole('button', { name: 'Add creature' }).click();
  await page.locator('.hb-item', { hasText: 'Sewer Brute' }).getByRole('button', { name: 'Bestiary' }).click();
  await expect(page.locator('#bst-detail')).toContainText('Sewer Brute');
  await expect(page.locator('.bst-realm', { hasText: 'Homebrew' })).toBeVisible();

  await openHomebrew(page);
  await page.locator('.hb-pack-row input[type=checkbox]').uncheck();
  await showTab(page, 'bestiary');
  await expect(page.locator('.bst-realm', { hasText: 'Homebrew' })).toHaveCount(0);
  // Still off after a reload.
  await page.reload();
  await showTab(page, 'bestiary');
  await expect(page.locator('.bst-realm', { hasText: 'Homebrew' })).toHaveCount(0);
});
