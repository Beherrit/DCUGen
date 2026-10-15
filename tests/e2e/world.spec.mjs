// The World: pages, what happened, the timeline, the graph and the vault.
import { test, expect } from '@playwright/test';
import { openApp, rollCharacter, showTab, codename } from './helpers.mjs';

test('a saved character gets a page, and what happened lands on the timeline', async ({ page }) => {
  const errors = await openApp(page);
  await rollCharacter(page);
  const name = (await codename(page).textContent()).trim();
  await page.locator('#save-bottom').click();
  await showTab(page, 'world');
  await page.locator('#view-world .wd-tree, #view-world .wd-card-head').filter({ hasText: name }).first().click();
  await expect(page.locator('#view-world h1')).toContainText(name);

  // Record a moment: this character founded a new faction.
  await page.getByRole('button', { name: '⚡ What happened' }).first().click();
  const dlg = page.locator('#dialog');
  await dlg.getByLabel('Who').fill(name);
  await dlg.getByLabel('What happened').selectOption({ label: 'founded' });
  await dlg.getByLabel('Other party').fill('The Night Watch');
  await dlg.getByRole('button', { name: 'Record' }).click();
  await expect(page.locator('#toast')).toContainText('Recorded');

  await page.locator('.wd-tab', { hasText: 'Timeline' }).click();
  await expect(page.locator('#view-world .wd-tl')).toContainText('The Night Watch');
  await page.locator('.wd-tab', { hasText: 'Graph' }).click();
  await expect(page.locator('#view-world svg.wd-graph')).toBeVisible();
  await page.locator('.wd-tab', { hasText: 'Share & export' }).click();
  await expect(page.locator('#world-link')).toBeVisible();
  expect(errors).toEqual([]);
});
