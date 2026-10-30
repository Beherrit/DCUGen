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

test('in the play view, assuming a stance changes the defense and Neutral clears it', async ({ page }) => {
  await page.addInitScript(() => { Math.random = () => 0.97; }); // every d20 is a 20, so the stance check passes
  const errors = await openApp(page);
  await startBlank(page);
  await addAikidoAtStudent(page);
  await page.getByRole('button', { name: 'Done editing' }).click();
  await page.locator('#view-play').click();
  const stance = page.locator('#play-stance');
  await expect(stance).toBeVisible();
  await expect(stance.locator('.fs-stance-btn', { hasText: 'Blocking' })).toContainText('DC 13');
  const parry = page.locator('.play-tile', { hasText: 'Parry' }).locator('b');
  const before = Number(await parry.textContent());
  await stance.locator('.fs-stance-btn[data-stance="Blocking"]').click();
  await expect(page.locator('#play-stance-now')).toHaveText('Blocking');
  await expect(parry).toHaveText(String(before + 2));
  await expect(page.locator('#defense-stance')).toContainText('Blocking');
  // Being prone ends the stance.
  await page.locator('.play-chip', { hasText: /^Prone$/ }).click();
  await expect(page.locator('#play-stance-now')).toHaveText('Neutral');
  await page.locator('.play-chip', { hasText: /^Prone$/ }).click();
  await stance.locator('.fs-stance-btn[data-stance="Blocking"]').click();
  await expect(parry).toHaveText(String(before + 2));
  await stance.locator('.fs-stance-btn[data-stance="Neutral"]').click();
  await expect(parry).toHaveText(String(before));
  expect(errors).toEqual([]);
});

test('the Rules tab has the Martial Arts book: styles, stances and maneuvers with their pages', async ({ page }) => {
  const errors = await openApp(page);
  await showTab(page, 'rules');
  for (const cat of ['Fighting styles', 'Stances', 'Combat maneuvers', 'Optional rules']) {
    await expect(page.locator('.ae-tabs button', { hasText: new RegExp(`^${cat}$`) })).toBeVisible();
  }
  await page.locator('.ae-tabs button', { hasText: /^Stances$/ }).click();
  const table = page.locator('.rule-card', { hasText: 'Stances (table)' });
  await expect(table.locator('tbody tr')).toHaveCount(33);
  await expect(table.locator('tr', { hasText: 'Blocking' })).toContainText('13');
  await page.locator('.ae-tabs button', { hasText: /^Everything$/ }).click();
  await page.locator('#rules-q').fill('Soft Landing');
  await expect(page.locator('.rule-card', { has: page.locator('.rule-title', { hasText: /^Soft Landing$/ }) })).toContainText('MA 154');
  expect(errors).toEqual([]);
});

test('the styles section and the stance picker stay inside the screen on a phone @phone', async ({ page }) => {
  await openApp(page);
  await startBlank(page);
  await addAikidoAtStudent(page);
  await page.locator('#fs-man-Aikido').selectOption({ label: 'Soft Landing' });
  await page.locator('.fs-card[data-style="Aikido"]').getByRole('button', { name: 'Add maneuver' }).click();
  const overflow = () => page.evaluate(() => document.documentElement.scrollWidth - document.documentElement.clientWidth);
  expect(await overflow()).toBeLessThanOrEqual(1);
  await page.getByRole('button', { name: 'Done editing' }).click();
  await page.locator('#view-play').click();
  await expect(page.locator('#play-stance')).toBeVisible();
  expect(await overflow()).toBeLessThanOrEqual(1);
  await showTab(page, 'forge');
});
