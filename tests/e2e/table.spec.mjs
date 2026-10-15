// Phone tables: what a player sees when joining fails, and (with a network) a GM and a player at one table.
import { test, expect } from '@playwright/test';
import { openApp, rollCharacter, showTab } from './helpers.mjs';

// A made-up table link: a table that was never opened.
const FAKE = `DCUP1.${Buffer.from(JSON.stringify({ n: 'Nowhere', i: 'dcugen-doesnotexist000', k: 'tok' })).toString('base64url')}`;

test('offline, a join explains what went wrong and what to try', async ({ page, context }) => {
  await openApp(page);
  await showTab(page, 'table');
  await context.setOffline(true);
  await page.locator('#tb-key').fill(FAKE);
  await page.getByRole('button', { name: 'Join', exact: true }).click();
  const err = page.locator('#tb-error');
  await expect(err).toContainText('matchmaking server', { timeout: 20_000 });
  await expect(err.locator('.tb-tips li').first()).toBeVisible();
  await expect(err.getByRole('button', { name: 'Try again' })).toBeVisible();
});

test('relay servers are saved from Connection settings', async ({ page }) => {
  await openApp(page);
  await showTab(page, 'table');
  await page.getByText('Connection settings').click();
  await page.getByLabel('Relay servers').fill('turn:relay.example.com:3478 alice s3cret\nnonsense');
  await page.locator('.tb-server').getByRole('button', { name: 'Save' }).click();
  await expect(page.locator('#toast')).toContainText('1 relay line skipped');
  const saved = await page.evaluate(() => JSON.parse(localStorage.getItem('dcugen.peer.ice')));
  expect(saved).toEqual([{ urls: 'turn:relay.example.com:3478', username: 'alice', credential: 's3cret' }]);
});

// Needs the internet (the public PeerJS server). Run with E2E_NETWORK=1.
test('a GM opens a phone table and a player joins it @network', async ({ browser }) => {
  test.skip(!process.env.E2E_NETWORK, 'needs the public PeerJS server: set E2E_NETWORK=1');
  const gmCtx = await browser.newContext();
  const gm = await gmCtx.newPage();
  await openApp(gm);
  await gm.evaluate(() => localStorage.setItem('dcugen.table.name', 'GM Sam'));
  await rollCharacter(gm);
  await gm.locator('#save-bottom').click();
  await showTab(gm, 'table');
  await gm.locator('#tb-name').fill('GM Sam');
  await gm.locator('#tb-phone').click();
  const link = (await gm.locator('#dialog code.key-long').textContent({ timeout: 30_000 })).trim();
  expect(link).toContain('#join=');
  await gm.keyboard.press('Escape');

  const plCtx = await browser.newContext();
  const pl = await plCtx.newPage();
  await openApp(pl);
  await showTab(pl, 'table');
  await pl.locator('#tb-name').fill('Player Alex');
  await pl.locator('#tb-key').fill(link);
  await pl.getByRole('button', { name: 'Join', exact: true }).click();
  await expect(pl.locator('.tb-status.on')).toContainText('Joined', { timeout: 30_000 });
  await expect(gm.locator('.tb-members')).toContainText('Player Alex', { timeout: 30_000 });
  await gmCtx.close(); await plCtx.close();
});
