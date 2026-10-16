// GM Tools, "In play": pick who is playing, keep a condition, bonus points and a note on them, and open
// their sheet from the list.
import { test, expect } from '@playwright/test';
import { openApp, rollCharacter, showTab, codename } from './helpers.mjs';

test('put a hero in play, note their condition and points, and open their sheet', async ({ page }) => {
  const errors = await openApp(page);
  await rollCharacter(page, 'team-a');
  const hero = (await codename(page).textContent()).trim();
  await page.locator('#save-bottom').click();
  await showTab(page, 'gm');
  await page.locator('#view-gm .ae-tabs button', { hasText: 'In play' }).click();

  const heroes = page.locator('#team-heroes');
  await heroes.locator('.team-pick .chip', { hasText: hero }).click();
  const row = heroes.locator('.team-row', { hasText: hero });
  await expect(row).toBeVisible();
  await row.getByLabel(`Condition for ${hero}`).selectOption('Dazed');
  await expect(heroes.locator('.team-row .team-cond')).toContainText('Dazed');
  await heroes.getByLabel(`Raise bonus points for ${hero}`).click();
  await heroes.getByLabel(`Raise bonus points for ${hero}`).click();
  await heroes.getByLabel(`Notes for ${hero}`).fill('Owes the Penguin a favour');

  // Kept after a reload.
  await page.reload();
  await showTab(page, 'gm');
  const again = page.locator('#team-heroes .team-row', { hasText: hero });
  await expect(again.locator('.team-xp .num')).toHaveText('2');
  await expect(again.getByLabel(`Notes for ${hero}`)).toHaveValue('Owes the Penguin a favour');
  await expect(again.getByLabel(`Condition for ${hero}`)).toHaveValue('Dazed');

  await again.getByRole('button', { name: 'Open sheet' }).click();
  await expect(page.locator('#view-forge')).toBeVisible();
  await expect(codename(page)).toHaveText(hero);
  expect(errors).toEqual([]);
});
