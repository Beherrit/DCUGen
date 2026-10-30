// The Battle Room with a martial artist: the fighter card shows the style, its tier and the stance held, the app loads clean
// (the bundle has no import cycle from the martial arts files), and a fight with a styled fighter runs to the end without a hitch.
import { test, expect } from '@playwright/test';
import { openApp, rollCharacter, showTab } from './helpers.mjs';

async function setUp(page) {
  const errors = await openApp(page);
  await page.locator('#rail-more summary').click().catch(() => {});
  await page.locator('#archetype').selectOption('martialartist');
  await rollCharacter(page, 'e2e-battle-style');
  await page.locator('#save-bottom').click();
  await showTab(page, 'battle');
  await page.locator('#bt-mine .bt-pick').first().getByRole('button', { name: /team A$/ }).click();
  await page.locator('#bt-beast-q').fill('ogre');
  await page.locator('#bt-beasts .bt-pick').first().getByRole('button', { name: /team B$/ }).click();
  return errors;
}

test('a martial artist\'s card shows the style, its tier and its stance, and the line fits the card', async ({ page }) => {
  const errors = await setUp(page);
  const line = page.locator('.bt-card .bt-style').first();
  await expect(line).toBeVisible();
  await expect(line).toContainText(/\((Initiate|Student|Master)\)/);
  await expect(line).toContainText(/Neutral stance|stance/);
  const card = await page.locator('.bt-card').first().boundingBox();
  const text = await line.boundingBox();
  expect(text.x + text.width).toBeLessThanOrEqual(card.x + card.width + 1);
  expect(errors).toEqual([]);
});

test('a fight with a martial artist runs clean and fits a phone @phone', async ({ page }) => {
  const errors = await setUp(page);
  await page.locator('#bt-fight').click();
  await page.keyboard.press('e');
  await expect(page.locator('#bt-comic')).toBeVisible();
  const overflow = await page.evaluate(() => document.documentElement.scrollWidth - document.documentElement.clientWidth);
  expect(overflow).toBeLessThanOrEqual(1);
  const log = (await page.locator('#bt-log-panel').innerText()).replace(/\s+/g, ' ');
  expect(log).not.toMatch(/hesitates/);
  expect(errors).toEqual([]);
});
