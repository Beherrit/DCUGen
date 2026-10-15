// The session planner: plan a session, add scenes linked to the World, keep the GM Screen's plan with it,
// start it, end it, and see "Previously on…" for the next one.
import { test, expect } from '@playwright/test';
import { openApp, rollCharacter, showTab, codename } from './helpers.mjs';

async function worldSessions(page) {
  await showTab(page, 'world');
  await page.locator('.wd-tab', { hasText: 'Sessions' }).click();
}

test('plan a session, add a scene linked to a page, and get a calendar file', async ({ page }) => {
  const errors = await openApp(page);
  await rollCharacter(page);
  const hero = (await codename(page).textContent()).trim();
  await page.locator('#save-bottom').click();
  await worldSessions(page);
  await page.locator('#ses-new').click();
  await expect(page.locator('#ses-edit')).toContainText('Session 1');
  await page.locator('#ses-title').fill('The Heist');
  await page.locator('#ses-title').press('Tab');
  await page.locator('#ses-date').fill('2030-10-24T19:00');
  await page.locator('#ses-date').press('Tab');
  await page.locator('#ses-scene').fill('Rooftop chase');
  await page.locator('#ses-scene-links').fill(hero);
  await page.locator('#ses-scene-add').click();
  await expect(page.locator('.ses-scenes')).toContainText('Rooftop chase');
  await expect(page.locator('.ses-scenes .wd-chip')).toContainText(hero);
  await expect(page.locator('.ses-next')).toContainText('Session 1: The Heist');

  const download = page.waitForEvent('download');
  await page.locator('#ses-ics').click();
  const file = await download;
  expect(file.suggestedFilename()).toMatch(/session-1\.ics$/);

  // Survives a reload.
  await page.reload();
  await worldSessions(page);
  await expect(page.locator('.ses-next')).toContainText('The Heist');
  expect(errors).toEqual([]);
});

test('starting a planned session uses its number; ending it marks it played and feeds "previously on"', async ({ page }) => {
  const errors = await openApp(page);
  await rollCharacter(page);
  await page.locator('#save-bottom').click();
  await worldSessions(page);
  // A loose end to carry over.
  await page.locator('#thr-text').fill('Who sent the letter?');
  await page.locator('#thr-add').click();
  await page.locator('#ses-new').click();
  await page.locator('#ses-start').click();
  await expect(page.locator('#view-screen')).toBeVisible();
  await expect(page.locator('.gm-session')).toContainText('Session 1');

  await page.locator('#gm-end').click();
  await page.keyboard.press('Escape');
  await worldSessions(page);
  await expect(page.locator('.ses-cards').last()).toContainText('played');
  await expect(page.locator('.ses-prev')).toContainText('Previously on');
  await expect(page.locator('.ses-prev')).toContainText('Who sent the letter?');

  // The next session starts with "previously on" in the feed.
  await page.locator('.ses-next').getByRole('button', { name: '+ Plan another' }).or(page.locator('#ses-new')).first().click();
  await page.locator('#ses-start').click();
  await expect(page.locator('.gm-session')).toContainText('Session 2');
  await showTab(page, 'table');
  await expect(page.locator('#view-table')).toContainText('Previously on');
  expect(errors).toEqual([]);
});

test('Session in a Box keeps its plan with the next session', async ({ page }) => {
  await openApp(page);
  await rollCharacter(page);
  await page.locator('#save-bottom').click();
  await showTab(page, 'screen');
  await page.locator('#gm-view-prep').click();
  await page.locator('#prep-go').click();
  await expect(page.locator('#toast')).toContainText('Plan kept with session 1', { timeout: 20_000 });
  await worldSessions(page);
  await page.locator('.ses-next').getByRole('button', { name: 'Open' }).click();
  await expect(page.locator('.ses-plan')).toContainText('Villain');
  await expect(page.locator('.ses-scenes li')).not.toHaveCount(0);
});
