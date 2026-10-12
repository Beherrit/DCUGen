import { test } from 'node:test';
import assert from 'node:assert/strict';
import { RULES as R } from '../src/engine/index.js';
import { generateCharacter } from '../src/engine/generator.js';
import { createBattle, addCombatant, makeCombatant, startBattle, runToEnd } from '../src/engine/battle.js';
import { battleComic, comicSvg, narrate } from '../src/engine/comic.js';

function fought() {
  const b = createBattle({ seed: 'comic', name: 'Clash at the Docks' });
  addCombatant(b, makeCombatant(R, generateCharacter(R, { seed: 'c1', pl: 10, alignment: 'hero' }), { team: 'A' }));
  addCombatant(b, makeCombatant(R, generateCharacter(R, { seed: 'c2', pl: 10, alignment: 'hero' }), { team: 'A' }));
  addCombatant(b, makeCombatant(R, generateCharacter(R, { seed: 'c3', pl: 11, alignment: 'villain' }), { team: 'B' }));
  startBattle(b, R); runToEnd(b, R);
  return b;
}

test('six panels in order, ending with the result', () => {
  const b = fought();
  const c = battleComic(b);
  assert.ok(c.panels.length >= 2 && c.panels.length <= 6);
  assert.match(c.panels[0].caption, /^It begins!/);
  assert.match(c.panels[c.panels.length - 1].sfx, /VICTORY!|STALEMATE!/);
  assert.equal(c.title, 'Clash at the Docks');
  assert.match(c.subtitle, / vs\. /);
  const rounds = c.panels.map((p) => p.round);
  assert.deepEqual(rounds, [...rounds].sort((x, y) => x - y));
});

test('narration drops the dice arithmetic; the page is a clean SVG', () => {
  assert.equal(narrate('Rune strikes at Hex with Bolt: d20 15 +8 = 23 vs Parry DC 15 — hit (Power Attack: −1 to hit, +1 effect).'), 'Rune strikes at Hex with Bolt: hit.');
  const svg = comicSvg(battleComic(fought(), { portraitOf: () => 'https://example.com/x.png' }));
  assert.match(svg, /^<svg/);
  assert.ok(!svg.includes('https://example.com'), 'only data: images, so the page can become a PNG');
  assert.ok(!/<script/i.test(svg));
});
