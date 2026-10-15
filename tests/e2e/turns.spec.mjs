// Live turns: the GM's initiative, end-of-turn recovery checks, and (with a network) the players' turn bar.
import { test, expect } from '@playwright/test';
import { openApp, rollCharacter, showTab, codename } from './helpers.mjs';

async function saveOne(page, seed) {
  await rollCharacter(page, seed);
  const name = (await codename(page).textContent()).trim();
  await page.locator('#save-bottom').click();
  return name;
}

test('the GM runs turns on one screen: an affliction, a reminder, and a recovery check at the end of the turn', async ({ page }) => {
  const errors = await openApp(page);
  const name = await saveOne(page, 'turns-1');
  await showTab(page, 'screen');
  await page.locator('#gm-add').click();
  await page.locator('#gm-add-list').selectOption({ index: 0 });
  await page.locator('#dialog').getByRole('button', { name: 'Add' }).click();
  await page.locator('#gm-init-roll').click();
  await expect(page.locator('.gm-order li.now')).toContainText(name);

  // A strong affliction: they fail, and the GM sees what it means for the turn.
  await page.locator('#gm-hit').fill(`Affliction 30 vs Will on ${name}`);
  await page.locator('#gm-hit-go').click();
  await expect(page.locator('#gm-remind')).toBeVisible();

  // Ending the turn rolls to shake it off; the result goes to the Table feed.
  await page.locator('#gm-next').click();
  await showTab(page, 'table');
  await expect(page.locator('#view-table')).toContainText('end of turn');
  await expect(page.locator('#view-table')).toContainText(/shake off Affliction 30/);
  expect(errors).toEqual([]);
});

test('Delay moves the acting character after the next one', async ({ page }) => {
  await openApp(page);
  await saveOne(page, 'turns-a');
  await saveOne(page, 'turns-b');
  await showTab(page, 'screen');
  await page.locator('#gm-add').click();
  await page.locator('#gm-add-list').selectOption([{ index: 0 }, { index: 1 }]);
  await page.locator('#dialog').getByRole('button', { name: 'Add' }).click();
  await page.locator('#gm-init-roll').click();
  const first = (await page.locator('.gm-order li').nth(0).textContent()).replace(/^\d+\s*/, '').replace('acting', '').trim();
  await page.locator('#gm-delay').click();
  await expect(page.locator('.gm-order li').nth(1)).toContainText(first);
});

// Needs the internet (the public PeerJS server). Run with E2E_NETWORK=1.
test('a player sees whose turn it is, gets the nudge on theirs, and sees the party @network', async ({ browser }) => {
  test.skip(!process.env.E2E_NETWORK, 'needs the public PeerJS server: set E2E_NETWORK=1');
  const gmCtx = await browser.newContext();
  const gm = await gmCtx.newPage();
  await openApp(gm);
  await showTab(gm, 'table');
  await gm.locator('#tb-name').fill('GM Sam');
  await gm.locator('#tb-phone').click();
  const link = (await gm.locator('#dialog code.key-long').textContent({ timeout: 30_000 })).trim();
  await gm.keyboard.press('Escape');

  const plCtx = await browser.newContext();
  const pl = await plCtx.newPage();
  await openApp(pl);
  await showTab(pl, 'table');
  await pl.locator('#tb-name').fill('Player Alex');
  await pl.locator('#tb-key').fill(link);
  await pl.getByRole('button', { name: 'Join', exact: true }).click();
  await expect(pl.locator('.tb-status.on')).toContainText('Joined', { timeout: 30_000 });
  await showTab(pl, 'forge');
  const hero = await saveOne(pl, 'turns-net');

  await showTab(gm, 'screen');
  await expect(gm.locator('.gm-board')).toContainText(hero, { timeout: 20_000 });
  await gm.locator('#gm-init-roll').click();

  const bar = pl.locator('#turnbar');
  await expect(bar).toContainText(`Your turn: ${hero}`, { timeout: 20_000 });
  await expect(bar).toHaveClass(/mine/);
  await bar.locator('#tbar-party').click();
  await expect(bar.locator('.tbar-party')).toContainText(hero);

  // The GM stuns them; ending the turn makes the player's own app roll to recover.
  await gm.locator('#gm-hit').fill(`Affliction 30 vs Will on ${hero}`);
  await gm.locator('#gm-hit-go').click();
  await gm.locator('#gm-next').click();
  await showTab(pl, 'table');
  await expect(pl.locator('#view-table')).toContainText('end of turn', { timeout: 20_000 });
  await gmCtx.close(); await plCtx.close();
});
