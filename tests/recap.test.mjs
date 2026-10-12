import { test } from 'node:test';
import assert from 'node:assert/strict';
import { buildRecap, recapSvg } from '../src/engine/recap.js';

test('the recap picks the fight and the big moments, and makes a cover', () => {
  const r = buildRecap({
    campaign: 'Earth-2', issue: 4,
    cast: [{ name: 'Shadowshot', color: '#4a5d7a' }, { name: 'Spark', color: '#22aa66' }],
    entries: [
      { t: '2026-10-12T10:10:00Z', who: 'Spark', text: 'Spark rolls Blast attack: d20 20 +8 = 28 (natural 20!)', dice: { roll: 20 } },
      { t: '2026-10-12T10:20:00Z', who: 'GM', text: 'Doctor Null Toughness 12 vs DC 25: incapacitated.' },
      { t: '2026-10-12T08:00:00Z', who: 'Spark', text: 'old roll', dice: { roll: 20 } },
    ],
    events: [{ name: 'Battle at the Docks: team A wins', summary: 'Team A: Shadowshot, Spark vs Team B: Doctor Null.' }],
    spotlight: [{ name: 'Shadowshot', score: 1 }, { name: 'Spark', score: 5 }],
    complications: [{ name: 'Shadowshot', text: 'Weakness to Gold' }],
    since: '2026-10-12T10:00:00Z',
  });
  assert.equal(r.headline, 'BATTLE AT THE DOCKS');
  assert.equal(r.star, 'Spark');
  assert.ok(r.blurbs.some((b) => /incapacitated/.test(b)));
  assert.ok(!r.blurbs.some((b) => /old roll/.test(b)));
  assert.match(r.text, /EARTH-2 #4: BATTLE AT THE DOCKS/);
  assert.match(r.text, /Spotlight: Spark/);
  const svg = recapSvg(r);
  assert.match(svg, /^<svg/);
  assert.match(svg, /#4/);
  assert.ok(!/<script/i.test(svg));
});

test('names with markup are escaped on the cover', () => {
  const svg = recapSvg(buildRecap({ cast: [{ name: '<b>Evil</b>', color: '#000' }] }));
  assert.ok(!svg.includes('<b>Evil'));
});
