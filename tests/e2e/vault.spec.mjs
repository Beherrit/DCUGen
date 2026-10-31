// Desktop app after a crash: the vault on disk is newer than what the browser kept, and wins at start,
// except for changes that had not reached the vault yet.
import { test, expect } from '@playwright/test';
import { openApp } from './helpers.mjs';

/** A stand-in for the desktop app's bridge, with a vault that holds `vault` and records what is saved. */
function fakeDesktop(page, vault) {
  return page.addInitScript((v) => {
    const disk = { ...v };
    window.__saved = disk;
    window.dcugenDesktop = {
      version: async () => 'test',
      vaultLoad: async () => ({ ...disk }),
      vaultSave: async (data) => { Object.assign(disk, data); return true; },
      vaultUpdate: async ({ data, removed }) => { Object.assign(disk, data); for (const k of removed || []) delete disk[k]; return true; },
      vaultUpdateNow: ({ data, removed }) => { Object.assign(disk, data); for (const k of removed || []) delete disk[k]; return true; },
      vaultPath: async () => '/vault',
    };
  }, vault);
}

test('the vault\'s newer copy wins at start, but not over a change still on its way to disk', async ({ page }) => {
  // What the browser kept from the last run: an older journal, and GM notes changed but not yet saved to disk.
  await page.addInitScript(() => {
    if (sessionStorage.getItem('seeded')) return;
    sessionStorage.setItem('seeded', '1');
    localStorage.setItem('dcugen.roster.v1', '[]');
    localStorage.setItem('dcugen.journal.v1', '"older"');
    localStorage.setItem('dcugen.gmscreen.v1', '"edited here"');
    localStorage.setItem('dcugenVaultPending', JSON.stringify(['dcugen.gmscreen.v1']));
  });
  await fakeDesktop(page, { 'dcugen.roster.v1': '[]', 'dcugen.journal.v1': '"newer on disk"', 'dcugen.gmscreen.v1': '"old on disk"' });
  const errors = await openApp(page);
  const got = await page.evaluate(() => ({ journal: localStorage.getItem('dcugen.journal.v1'), screen: localStorage.getItem('dcugen.gmscreen.v1') }));
  expect(got).toEqual({ journal: '"newer on disk"', screen: '"edited here"' });
  // The change that was on its way reaches the vault, and nothing is left waiting.
  await expect.poll(() => page.evaluate(() => window.__saved['dcugen.gmscreen.v1'])).toBe('"edited here"');
  await expect.poll(() => page.evaluate(() => localStorage.getItem('dcugenVaultPending'))).toBe('[]');
  expect(errors).toEqual([]);
});

test('a change is on disk moments after it is made, not on the next timer tick', async ({ page }) => {
  await fakeDesktop(page, {});
  await openApp(page);
  await page.evaluate(() => localStorage.setItem('dcugen.journal.v1', '"just typed"'));
  await expect.poll(() => page.evaluate(() => window.__saved['dcugen.journal.v1']), { timeout: 2000 }).toBe('"just typed"');
});
