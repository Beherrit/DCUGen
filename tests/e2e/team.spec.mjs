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
  await expect(again.locator('.team-field', { hasText: 'Bonus points' }).locator('.num')).toHaveText('2');
  await expect(again.getByLabel(`Notes for ${hero}`)).toHaveValue('Owes the Penguin a favour');
  await expect(again.getByLabel(`Condition for ${hero}`)).toHaveValue('Dazed');

  await again.getByRole('button', { name: 'Open sheet' }).click();
  await expect(page.locator('#view-forge')).toBeVisible();
  await expect(codename(page)).toHaveText(hero);
  expect(errors).toEqual([]);
});

test('team-wide buttons: hero points, +1 for every hero, initiative and the Battle Room', async ({ page }) => {
  const errors = await openApp(page);
  await rollCharacter(page, 'team-b');
  const hero = (await codename(page).textContent()).trim();
  await page.locator('#save-bottom').click();
  await showTab(page, 'gm');
  await page.locator('#view-gm .ae-tabs button', { hasText: 'In play' }).click();
  await page.locator('#team-heroes .team-pick .chip', { hasText: hero }).click();
  const row = page.locator('#team-heroes .team-row', { hasText: hero });
  const hp = row.locator('.team-field', { hasText: 'Hero points' }).locator('.num');
  await expect(hp).toHaveText('1');
  await row.getByLabel(`Lower hero points for ${hero}`).click();
  await expect(hp).toHaveText('0');
  await row.getByLabel(`Raise toughness penalty for ${hero}`).click();
  await page.getByRole('button', { name: '+1 bonus point to every hero' }).click();
  await expect(row.locator('.team-field', { hasText: 'Bonus points' }).locator('.num')).toHaveText('1');
  await page.getByRole('button', { name: 'Reset for a new session' }).click();
  await expect(hp).toHaveText('1');
  await expect(row.locator('.team-field', { hasText: 'Toughness penalty' }).locator('.num')).toHaveText('0');

  await page.getByRole('button', { name: 'Roll initiative for everyone' }).click();
  await expect(page.locator('#view-gm .init-list')).toContainText(hero);
  await page.locator('#view-gm .ae-tabs button', { hasText: 'In play' }).click();
  await page.getByRole('button', { name: '⚔ Everyone to the Battle Room' }).click();
  await expect(page.locator('#view-battle')).toBeVisible();
  await expect(page.locator('#view-battle')).toContainText(hero);
  expect(errors).toEqual([]);
});
