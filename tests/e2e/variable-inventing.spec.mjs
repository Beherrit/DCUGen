// A Variable's menu of configurations (DCA 121) and the Inventing and Rituals bench (DCA 145-146), in the browser.
import { test, expect } from '@playwright/test';
import { openApp, rollCharacter, showTab } from './helpers.mjs';
import { RULES as R } from '../../src/engine/index.js';
import { generateCharacter } from '../../src/engine/generator.js';

async function openJson(page, ch) {
  await page.locator('#open-key').fill(JSON.stringify(ch));
  await page.locator('#open-key').press('Enter');
  await expect(page.locator('#save-bottom')).toBeVisible();
}

test('build a Variable menu in the Power Lab, switch it on the sheet, in Play and in the Battle Room', async ({ page }) => {
  const errors = await openApp(page);
  await rollCharacter(page, 'variable-e2e');
  await showTab(page, 'lab');
  await page.locator('#lab-effect').selectOption('Variable');
  await page.locator('#lab-name').fill('Cosmic Power');
  await page.locator('#lab-name').press('Tab');
  await page.locator('#lab-rank').fill('6');
  await page.locator('#lab-rank').press('Tab');
  await page.locator('#lab-add-config').click();
  const menu = page.locator('#lab-variable-menu');
  await expect(menu.locator('.var-cfg-name')).toHaveValue('Configuration 1');
  await expect(menu).toContainText('0/30 pp');
  await menu.getByRole('button', { name: '+ Add a power' }).click();

  // Now building the configuration's power
  await expect(page.locator('#lab-sub')).toContainText('Cosmic Power › Configuration 1');
  await page.locator('#lab-effect').selectOption('Damage');
  await page.locator('#lab-name').fill('Omni Blast');
  await page.locator('#lab-name').press('Tab');
  await page.locator('#lab-rank').fill('7');
  await page.locator('#lab-rank').press('Tab');
  await page.locator('#lab-sub-done').click();
  await expect(page.locator('#lab-sub')).toHaveCount(0);
  await expect(page.locator('#lab-name')).toHaveValue('Cosmic Power');
  await expect(menu).toContainText('Omni Blast');
  await expect(menu).toContainText('7/30 pp');
  await page.getByRole('button', { name: /^Add as new power to/ }).click();

  await showTab(page, 'forge');
  const sheet = page.locator('#view-forge');
  await expect(sheet.locator('.var-menu')).toBeVisible();
  await expect(sheet).not.toContainText('Omni Blast 7');
  await sheet.locator('.var-pick', { hasText: 'Configuration 1' }).first().click();
  await expect(sheet.locator('.var-pick[aria-pressed="true"]')).toContainText('Configuration 1');
  await expect(sheet.locator('table').filter({ hasText: 'Omni Blast' }).first()).toBeVisible();

  await page.locator('#view-play').click();
  await expect(page.locator('#play-variable')).toBeVisible();
  const attacks = page.locator('.play .play-card').filter({ has: page.locator('h3', { hasText: /^Attacks$/ }) });
  await expect(attacks).toContainText('Omni Blast');
  await page.locator('#play-variable .var-pick', { hasText: 'Off' }).click();
  await expect(attacks).not.toContainText('Omni Blast');
  await page.locator('#play-variable .var-pick', { hasText: 'Configuration 1' }).click();
  await expect(attacks).toContainText('Omni Blast');
  await page.getByRole('button', { name: 'Character sheet' }).click();

  await page.getByRole('button', { name: 'Battle Room', exact: true }).first().click();
  await showTab(page, 'battle');
  const pick = page.locator('#view-battle select[aria-label$="Variable configuration"]').first();
  await expect(pick).toBeVisible();
  await expect(pick).toHaveValue(/\|cfg-/);
  await pick.selectOption({ label: 'Cosmic Power: off' });
  await expect(page.locator('#view-battle select[aria-label$="Variable configuration"]').first()).toHaveValue(/\|$/);
  expect(errors).toEqual([]);
});

test('the bench: build an invention in the Lab, design it, build it, use it for a scene', async ({ page }) => {
  const errors = await openApp(page);
  const ch = generateCharacter(R, { pl: 10, seed: 'bench-e2e' });
  ch.advantages = [...(ch.advantages || []).filter((a) => a.name !== 'Inventor'), { name: 'Inventor' }];
  ch.skills = [...(ch.skills || []).filter((s) => s.name !== 'Technology'), { name: 'Technology', ranks: 12 }];
  ch.play = { heroPoints: 2 };
  delete ch.inventions;
  await openJson(page, ch);

  await page.getByRole('button', { name: /^More/ }).first().click();
  await page.getByRole('menuitem', { name: /Inventing and rituals/ }).click();
  const bench = page.locator('#invent-bench');
  await expect(bench).toContainText('Invention: Technology');
  await page.locator('#invent-new-lab').click();

  await expect(page.locator('#lab-sub')).toContainText('A new invention');
  await page.locator('#lab-name').fill('Shock Glove');
  await page.locator('#lab-name').press('Tab');
  await page.locator('#lab-rank').fill('4');
  await page.locator('#lab-rank').press('Tab');
  await page.locator('#lab-sub-done').click();

  // Back on the Forge with the bench open again
  await expect(bench).toBeVisible();
  const card = bench.locator('.bench-card', { hasText: 'Shock Glove' });
  await expect(card).toContainText('Needs a design');
  await expect(card).toContainText('Design: DC 18'); // ranged Damage 4 = 8 pp
  await expect(card).toContainText('8 hours');
  await card.getByRole('button', { name: /^Routine/ }).click();
  await expect(card).toContainText('Designed: ready to build');
  await expect(card).toContainText('Construction: DC 18');
  await expect(card).toContainText('32 hours');
  await card.locator('.bench-faster').fill('2');
  await card.locator('.bench-faster').press('Tab');
  await expect(card).toContainText('8 hours (cut from 32 hours)');
  await expect(card).toContainText('-10 on the check');
  await card.locator('.bench-faster').fill('0');
  await card.locator('.bench-faster').press('Tab');
  await card.getByRole('button', { name: /^Routine/ }).click();
  await expect(card).toContainText('Built: ready to use');
  await card.getByRole('button', { name: 'Use it this scene' }).click();
  await expect(card).toContainText('In use this scene');
  await page.locator('#dialog').getByRole('button', { name: 'Close' }).first().click();

  const sheet = page.locator('#view-forge');
  await expect(sheet.locator('table').filter({ hasText: 'Shock Glove' }).first()).toBeVisible();
  await page.locator('#view-play').click();
  await expect(page.locator('#play-inventions')).toContainText('Shock Glove');
  await expect(page.locator('.play')).toContainText('Shock Glove');
  await page.getByRole('button', { name: 'End of scene' }).click();
  await expect(page.locator('#play-inventions')).toContainText('Used up');
  await page.locator('#play-inventions').getByRole('button', { name: /Again: 1 hero point/ }).click();
  await expect(page.locator('#play-inventions')).toContainText('In use this scene');
  expect(errors).toEqual([]);
});
