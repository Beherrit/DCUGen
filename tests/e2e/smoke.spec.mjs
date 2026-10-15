// The everyday paths: roll, edit, save, reload, share by key, and every tab opening cleanly.
import { test, expect } from '@playwright/test';
import { openApp, rollCharacter, showTab, codename } from './helpers.mjs';

const TABS = ['forge', 'roster', 'table', 'lab', 'garage', 'workshop', 'bestiary', 'screen', 'battle', 'world', 'gm', 'rules'];

test('starts with nothing open and no errors', async ({ page }) => {
  const errors = await openApp(page);
  await expect(page.getByText('No character open')).toBeVisible();
  expect(errors).toEqual([]);
});

test('every tab opens without errors', async ({ page }) => {
  const errors = await openApp(page);
  for (const t of TABS) await showTab(page, t);
  expect(errors).toEqual([]);
});

test('a seed rolls the same character twice', async ({ page }) => {
  await openApp(page);
  await rollCharacter(page, 'e2e-seed-1');
  const first = await codename(page).textContent();
  await rollCharacter(page, 'e2e-seed-1');
  await expect(codename(page)).toHaveText(first);
});

test('roll, save to the roster, and it is still there after a reload', async ({ page }) => {
  const errors = await openApp(page);
  await rollCharacter(page);
  const name = (await codename(page).textContent()).trim();
  await page.locator('#save-bottom').click();
  await expect(page.locator('#roster-count')).toHaveText('1');
  await page.reload();
  await expect(page.locator('#roster-count')).toHaveText('1');
  await showTab(page, 'roster');
  await expect(page.locator('#view-roster')).toContainText(name);
  expect(errors).toEqual([]);
});

test('edit mode opens and closes', async ({ page }) => {
  await openApp(page);
  await rollCharacter(page);
  await page.getByRole('button', { name: 'Edit', exact: true }).click();
  await expect(page.locator('#edit-codename')).toBeVisible();
  await page.locator('#edit-codename').fill('E2E Tester');
  await page.locator('#edit-codename').press('Tab');
  await page.getByRole('button', { name: 'Done editing' }).click();
  await expect(codename(page)).toHaveText('E2E Tester');
});

test('undo brings back the previous codename', async ({ page }) => {
  await openApp(page);
  await rollCharacter(page);
  const before = (await codename(page).textContent()).trim();
  await page.getByRole('button', { name: 'Edit', exact: true }).click();
  await page.locator('#edit-codename').fill('Changed Name');
  await page.locator('#edit-codename').press('Tab');
  await page.getByRole('button', { name: 'Done editing' }).click();
  await page.locator('#undo').click();
  await expect(codename(page)).toHaveText(before);
});

test('a share key opens the same character in a new browser', async ({ page, browser }) => {
  await openApp(page);
  await rollCharacter(page);
  const name = (await codename(page).textContent()).trim();
  await page.getByRole('button', { name: /^More/ }).first().click();
  await page.getByRole('menuitem', { name: /Share \/ Key/ }).click();
  const field = page.locator('#dialog input[readonly], #dialog textarea').first();
  await expect(field).toBeVisible();
  const key = (await field.inputValue()).trim();
  expect(key).toMatch(/DCU/);

  const other = await browser.newContext();
  const p2 = await other.newPage();
  await openApp(p2);
  await p2.locator('#open-key').fill(key);
  await p2.locator('#open-key').press('Enter');
  await expect(codename(p2)).toHaveText(name);
  await other.close();
});

test('the Bestiary throws a creature into the Battle Room', async ({ page }) => {
  const errors = await openApp(page);
  await showTab(page, 'bestiary');
  await page.locator('#view-bestiary .bst-card').first().click();
  await page.getByRole('button', { name: '⚔ Throw in Battle Room' }).click();
  await showTab(page, 'battle');
  await expect(page.locator('#view-battle')).not.toContainText('The arena is empty');
  expect(errors).toEqual([]);
});

test('works on a phone @phone', async ({ page }) => {
  const errors = await openApp(page);
  await rollCharacter(page);
  await page.locator('#save-bottom').click();
  await expect(page.locator('#roster-count')).toHaveText('1');
  await showTab(page, 'table');
  expect(errors).toEqual([]);
});
