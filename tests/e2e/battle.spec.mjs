// The Battle Room: pick fighters onto teams from the list, one Fight! button, and a turn-by-turn log.
import { test, expect } from '@playwright/test';
import { openApp, rollCharacter, showTab } from './helpers.mjs';

async function addBeast(page, q, team) {
  await page.locator('#bt-beast-q').fill(q);
  await page.locator('#bt-beasts .bt-pick').first().getByRole('button', { name: new RegExp(`team ${team}$`) }).click();
}

test('pick onto teams from the list, Fight! plays straight away, and the log reads turn by turn', async ({ page }) => {
  const errors = await openApp(page);
  await showTab(page, 'battle');
  await addBeast(page, 'ogre', 'A');
  await addBeast(page, 'wolf', 'B');
  await expect(page.locator('#bt-versus')).toContainText('vs');
  await expect(page.locator('#bt-versus')).toContainText('Ogre');
  await page.locator('#bt-fight').click();
  // No second click: it is already playing.
  await expect(page.locator('#bt-play')).toHaveText(/Pause/);
  await expect(page.locator('#bt-log-panel .bt-turn').first()).toBeVisible();
  await expect(page.locator('#bt-log-panel .bt-turn-head').first()).toContainText(/Ogre|Wolf/);
  // Run it out and filter the log to one fighter.
  await page.keyboard.press('e');
  await expect(page.locator('#bt-comic')).toBeVisible();
  await page.locator('#bt-log-who').selectOption({ label: 'Ogre (A)' });
  const heads = await page.locator('#bt-log-panel .bt-turn-head b').allTextContents();
  expect(heads.every((t) => t === 'Ogre' || t === 'Wolf')).toBe(true);
  expect(errors).toEqual([]);
});

test('Step through it starts paused, one action at a time', async ({ page }) => {
  await openApp(page);
  await showTab(page, 'battle');
  await addBeast(page, 'ogre', 'A');
  await addBeast(page, 'wolf', 'B');
  await page.locator('#bt-stepwise').click();
  await expect(page.locator('#bt-play')).toHaveText(/Play/);
  const before = await page.locator('#bt-log-panel .bt-turn').count();
  await page.getByRole('button', { name: 'Step', exact: true }).click();
  await expect(page.locator('#bt-log-panel .bt-turn')).toHaveCount(before + 1);
});

test('your characters sort by name or PL', async ({ page }) => {
  await openApp(page);
  for (const seed of ['sort-a', 'sort-b', 'sort-c']) { await rollCharacter(page, seed); await page.locator('#save-bottom').click(); }
  await showTab(page, 'battle');
  await page.locator('#bt-mine-sort').selectOption('name');
  const names = await page.locator('#bt-mine .bt-pick-name').allTextContents();
  expect(names).toEqual([...names].sort((a, b) => a.toLowerCase().localeCompare(b.toLowerCase())));
  await page.locator('#bt-mine-sort').selectOption('plDesc');
  const pls = (await page.locator('#bt-mine .bt-pick-meta').allTextContents()).map((t) => Number(/PL (\d+)/.exec(t)[1]));
  expect(pls).toEqual([...pls].sort((a, b) => b - a));
  // Remembered.
  await page.reload();
  await showTab(page, 'battle');
  await expect(page.locator('#bt-mine-sort')).toHaveValue('plDesc');
});

test('a character with alternate forms fights in the form picked on their card', async ({ page }) => {
  await openApp(page);
  await rollCharacter(page, 'forms-1');
  await page.getByRole('button', { name: /^More/ }).first().click();
  await page.locator('#add-forms').click();
  await page.locator('#dialog').getByRole('button', { name: /Blank second form/ }).click();
  await page.locator('#save-bottom').click();
  await showTab(page, 'battle');
  await page.locator('#bt-mine .bt-pick').first().getByRole('button', { name: /team A$/ }).click();
  const formSel = page.locator('.bt-card select[aria-label$="form"]');
  await expect(formSel).toHaveCount(1);
  await formSel.selectOption({ index: 0 });
  await expect(page.locator('.bt-card .bt-names')).toContainText('form: ');
});

test('a fighter card shows its attack descriptors and what it is immune to', async ({ page }) => {
  const errors = await openApp(page);
  await showTab(page, 'battle');
  await addBeast(page, 'storm elemental', 'A');
  const card = page.locator('.bt-card').first();
  await expect(card.locator('.bt-tag').first()).toContainText('Descriptors:');
  await expect(card.locator('.bt-tag.imm')).toContainText('electricity damage');
  expect(errors).toEqual([]);
});
