// Fighting styles (Martial Arts 3e): add a style on the Forge, see what it costs, buy a maneuver, then use its stances.
import { test, expect } from '@playwright/test';
import { openApp, showTab } from './helpers.mjs';

async function startBlank(page) {
  await page.locator('#start-scratch, #build-scratch').first().click();
  await expect(page.locator('#add-adv-name')).toBeVisible(); // edit mode
}

async function addAikidoAtStudent(page) {
  await page.locator('#fs-add summary').click();
  await page.locator('#fs-search').fill('aikido');
  await page.locator('#fs-list .fs-pick', { hasText: 'Aikido' }).first().click();
  await expect(page.locator('.fs-card[data-style="Aikido"]')).toBeVisible();
  await page.locator('#fs-tier-Aikido').selectOption('student');
}

const points = (page) => page.locator('#fighting-styles h3 .pts');

test('add Aikido at Student on a new character, see the cost, and buy a maneuver', async ({ page }) => {
  const errors = await openApp(page);
  await startBlank(page);
  await addAikidoAtStudent(page);
  const card = page.locator('.fs-card[data-style="Aikido"]');
  await expect(card).toContainText('Student');
  // Student 2 tiers + stances 1 + style extras 2 + style flaws -3 = 2 points, plus nothing else yet.
  await expect(card.locator('.fs-costs')).toContainText('tier 2');
  await expect(card.locator('.fs-costs')).toContainText('stances 1');
  const before = Number((await points(page).textContent()).replace(/\D/g, ''));
  await expect(card.locator('.fs-stances li')).toContainText(['Neutral', 'Blocking']);
  await card.locator('#fs-man-Aikido').selectOption({ label: 'Soft Landing' });
  await card.getByRole('button', { name: 'Add maneuver' }).click();
  await expect(card.locator('.fs-man', { hasText: 'Soft Landing' })).toBeVisible();
  const after = Number((await points(page).textContent()).replace(/\D/g, ''));
  expect(after).toBeGreaterThan(before);
  // Removing the style takes everything it added with it.
  await card.getByRole('button', { name: 'Remove Aikido' }).click();
  await expect(page.locator('.fs-card')).toHaveCount(0);
  expect(errors).toEqual([]);
});

test('the styles section stays inside the screen on a phone @phone', async ({ page }) => {
  await openApp(page);
  await startBlank(page);
  await addAikidoAtStudent(page);
  await expect(page.locator('.fs-card[data-style="Aikido"]')).toBeVisible();
  const overflow = await page.evaluate(() => document.documentElement.scrollWidth - document.documentElement.clientWidth);
  expect(overflow).toBeLessThanOrEqual(1);
  await showTab(page, 'forge');
});
