// Jump-anywhere search: Ctrl+K opens one box for sections, actions, characters, World pages, rules, creatures.
import { test, expect } from '@playwright/test';
import { openApp, rollCharacter, codename } from './helpers.mjs';

test('Ctrl+K finds a saved character, a rule and a creature, and opens each', async ({ page }) => {
  const errors = await openApp(page);
  await rollCharacter(page);
  const hero = (await codename(page).textContent()).trim();
  await page.locator('#save-bottom').click();
  await page.locator('#tab-rules').click();

  await page.keyboard.press('Control+k');
  await expect(page.locator('#palette-q')).toBeFocused();
  await page.locator('#palette-q').fill(hero);
  await expect(page.locator('.palette-item.on')).toContainText(hero);
  await page.keyboard.press('Enter');
  await expect(page.locator('#view-forge')).toBeVisible();
  await expect(codename(page)).toHaveText(hero);

  await page.keyboard.press('Control+k');
  await page.locator('#palette-q').fill('vulnerable');
  await page.keyboard.press('Enter');
  await expect(page.locator('#dialog h2')).toHaveText('Vulnerable');
  await page.keyboard.press('Escape');

  await page.locator('#palette-btn').click();
  await page.locator('#palette-q').fill('chicken flock');
  await page.keyboard.press('Enter');
  await expect(page.locator('#view-bestiary #bst-detail')).toContainText(/Chicken Flock/i);
  expect(errors).toEqual([]);
});

test('arrow keys move, Escape closes, and an empty box offers things to do', async ({ page }) => {
  await openApp(page);
  await page.keyboard.press('Control+k');
  await expect(page.locator('.palette-kind').first()).toHaveText('Do');
  await page.keyboard.press('ArrowDown');
  await expect(page.locator('.palette-item').nth(1)).toHaveClass(/on/);
  await page.locator('#palette-q').fill('sessions');
  await page.keyboard.press('Enter');
  await expect(page.locator('#view-world')).toBeVisible();
  await expect(page.locator('#view-world h1')).toContainText('Sessions');
  await page.keyboard.press('Control+k');
  await page.keyboard.press('Escape');
  await expect(page.locator('.palette')).toHaveCount(0);
});
