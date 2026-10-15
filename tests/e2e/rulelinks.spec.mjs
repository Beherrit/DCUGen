// Tap a rule name on the sheet, in Play and on the GM Screen to read the rule.
import { test, expect } from '@playwright/test';
import { openApp, rollCharacter, showTab } from './helpers.mjs';

test('advantages and power effects on the sheet open their rule cards', async ({ page }) => {
  const errors = await openApp(page);
  await rollCharacter(page, 'rules-1');
  const adv = page.locator('.adv-row .rule-link').first();
  const advName = (await adv.textContent()).trim();
  await adv.click();
  await expect(page.locator('#dialog')).toBeVisible();
  await expect(page.locator('#dialog h2')).toHaveText(advName);
  await expect(page.locator('#dialog .rule-card')).toContainText('Advantages');
  await page.keyboard.press('Escape');

  const eff = page.locator('.power-top .rule-link').first();
  const effName = await eff.getAttribute('data-rule');
  await eff.click();
  await expect(page.locator('#dialog h2')).toHaveText(effName);
  await expect(page.locator('#dialog .rule-card')).toContainText('Effects');
  expect(errors).toEqual([]);
});

test('a condition on the GM Screen opens its rule, by mouse or keyboard', async ({ page }) => {
  await openApp(page);
  await rollCharacter(page);
  await page.locator('#save-bottom').click();
  await showTab(page, 'screen');
  await page.locator('#gm-add').click();
  await page.locator('#gm-add-list').selectOption({ index: 0 });
  await page.locator('#dialog').getByRole('button', { name: 'Add' }).click();
  await page.locator('.gm-card select').selectOption('Vulnerable');
  const chip = page.locator('.gm-card [data-rule="Vulnerable"]');
  await chip.focus();
  await page.keyboard.press('Enter');
  await expect(page.locator('#dialog h2')).toHaveText('Vulnerable');
  await expect(page.locator('#dialog .rule-card')).toContainText('Conditions');
});
