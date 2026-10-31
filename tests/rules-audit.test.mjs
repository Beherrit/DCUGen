// Rules the engine must enforce, each checked against the DC Adventures Hero's Handbook.
import { test } from 'node:test';
import assert from 'node:assert/strict';
import { RULES as R } from '../src/engine/index.js';
import { powerCost } from '../src/engine/costs.js';
import { checkLimits } from '../src/engine/limits.js';
import { deriveAll, advantageRank } from '../src/engine/derive.js';
import { powerTags } from '../src/engine/powersmith.js';
import { statBlockText } from '../src/engine/render.js';

const P = (effect, rank, more = {}) => ({ name: more.name || effect, effect, rank, extras: [], flaws: [], ...more });
const hero = (more = {}) => ({
  pl: 10,
  abilities: { Strength: 2, Stamina: 2, Agility: 2, Dexterity: 2, Fighting: 2, Intellect: 2, Awareness: 2, Presence: 2 },
  defenses: { Dodge: 0, Parry: 0, Fortitude: 0, Will: 0 },
  skills: [], advantages: [], powers: [], devices: [], equipment: [], identity: { codename: 'Test' }, ...more,
});
const issues = (ch) => checkLimits(ch, R).filter((i) => i.rule !== 'budget');

test('Green Lantern: a Dynamic base effect pays 1 point (Force Blast, Ranged Damage 18, Dynamic = 37)', () => {
  const ring = P('Damage', 18, { name: 'Force Blast', range: 'Ranged', dynamic: true, alternates: [
    P('Create', 18, { name: 'Force Constructs' }), P('Move Object', 18, { name: 'Lifting' }),
    P('Create', 12, { name: 'Mobile Constructs', extras: [{ name: 'Movable' }] }),
  ] });
  // 36 + 1 Dynamic + 3 Dynamic AEs x 2
  assert.equal(powerCost(ring, R), 43);
  assert.equal(powerCost({ ...ring, dynamic: false }, R), 39);
  const text = statBlockText(hero({ powers: [ring] }), R);
  assert.match(text, /Force Blast: .* • 37 points/);
  assert.match(text, /36 points Dynamic pool/);
});

test('Increased Range is a range step: an Increased Range Damage attack is ranged and uses Dexterity', () => {
  const ch = hero({ abilities: { ...hero().abilities, Dexterity: 6 }, powers: [P('Damage', 8, { name: 'Zap', extras: [{ name: 'Increased Range' }] })] });
  const zap = deriveAll(ch, R).attacks.find((a) => a.name === 'Zap');
  assert.equal(zap.kind, 'ranged');
  assert.equal(zap.bonus, 6);
  assert.ok(powerTags(ch.powers[0], R).has('ranged'));
  // Two steps reach perception range: no attack check, so the rank is capped at PL.
  const mind = P('Damage', 11, { name: 'Mind Spike', extras: [{ name: 'Increased Range', steps: 2 }] });
  assert.equal(deriveAll(hero({ powers: [mind] }), R).attacks.find((a) => a.name === 'Mind Spike').kind, 'perception');
  assert.ok(issues(hero({ powers: [mind] })).some((i) => i.rule === 'attack'));
});

test('Enhanced advantages count: Enhanced Close Attack, Improved Initiative and Defensive Roll (DCA 96)', () => {
  const ch = hero({ powers: [
    P('Enhanced Trait', 15, { name: 'Brawler', option: 'Close Attack' }),
    P('Enhanced Trait', 3, { name: 'Reflexes', option: 'Improved Initiative' }),
    P('Enhanced Trait', 4, { name: 'Tumble', option: 'Defensive Roll' }),
  ] });
  const d = deriveAll(ch, R);
  assert.equal(d.attacks[0].bonus, 17); // Fighting 2 + 15
  assert.equal(d.initiative, 2 + 12);
  assert.equal(d.defenses.Toughness, 2 + 4);
  assert.equal(advantageRank(ch, 'Close Attack'), 15);
  // ...and so the PL limit sees them: +17 attack with Strength 2 damage is fine, Strength 4 is over.
  assert.ok(!issues(ch).some((i) => i.rule === 'attack'));
  const strong = { ...ch, abilities: { ...ch.abilities, Strength: 4 } };
  assert.ok(issues(strong).some((i) => i.rule === 'attack' && /Unarmed/.test(i.message)));
});

test('Enhanced advantages follow the advantage caps (Enhanced Luck past half PL)', () => {
  const ch = hero({ powers: [P('Enhanced Trait', 6, { name: 'Lucky', option: 'Luck' })] });
  assert.ok(issues(ch).some((i) => i.rule === 'advantage' && /Luck 6 exceeds its maximum of 5/.test(i.message)));
  const mixed = hero({ advantages: [{ name: 'Luck', rank: 3 }], powers: [P('Enhanced Trait', 3, { name: 'Lucky', option: 'Luck' })] });
  assert.ok(issues(mixed).some((i) => i.rule === 'advantage' && /Luck 6/.test(i.message)));
});

test('a skill bought only as Enhanced Trait is still limited to PL + 10', () => {
  const ch = hero({ powers: [P('Enhanced Trait', 20, { name: 'Eagle Eye', option: 'Perception' })] });
  assert.ok(issues(ch).some((i) => i.rule === 'skill' && /Perception \+22/.test(i.message)));
  const ok = hero({ powers: [P('Enhanced Trait', 18, { name: 'Eagle Eye', option: 'Perception' })] });
  assert.ok(!issues(ok).some((i) => i.rule === 'skill'));
});

test('advantage prerequisites are flagged', () => {
  const ch = hero({ advantages: [{ name: 'Ritualist' }, { name: 'Improved Reversal', rank: 1 }] });
  const msgs = issues(ch).map((i) => i.message).join('\n');
  assert.match(msgs, /Ritualist requires the Expertise \(Magic\) skill/);
  assert.match(msgs, /Improved Reversal requires the Reversal advantage/);
  const fixed = hero({ skills: [{ name: 'Expertise', spec: 'Magic', ranks: 4 }], advantages: [{ name: 'Ritualist' }, { name: 'Reversal' }, { name: 'Improved Reversal', rank: 1 }] });
  assert.ok(!issues(fixed).some((i) => i.rule === 'advantage'));
});

test('permanent effects cannot be in an array (DCA 125), unless made Sustained', () => {
  const arr = P('Damage', 8, { name: 'Bolt', range: 'Ranged', alternates: [P('Protection', 8, { name: 'Shell' })] });
  assert.ok(issues(hero({ powers: [arr] })).some((i) => /Shell: Protection is permanent/.test(i.message)));
  const sustained = P('Damage', 8, { name: 'Bolt', range: 'Ranged', alternates: [P('Protection', 8, { name: 'Shell', extras: [{ name: 'Sustained' }] })] });
  assert.ok(!issues(hero({ powers: [sustained] })).some((i) => /permanent/.test(i.message)));
});

test('fractional costs below 1 point per 5 ranks get the book\'s guideline warning (DCA 124)', () => {
  const cheap = P('Protection', 12, { flaws: ['Limited', 'Unreliable', 'Tiring', 'Distracting', 'Fades'].map((name) => ({ name })) });
  assert.ok(issues(hero({ powers: [cheap] })).some((i) => /1 point per 6 ranks/.test(i.message) && i.severity === 'warning'));
});

test('modifier prerequisites read the duration after Increased Duration and Sustained (DCA 129, 132, 135, 136)', () => {
  const warns = (p) => issues(hero({ powers: [p] })).filter((i) => i.rule === 'power').map((i) => i.message);
  // Concentration needs a sustained effect: a Sustained Protection qualifies, a plain (permanent) one doesn't.
  assert.deepEqual(warns(P('Protection', 4, { extras: [{ name: 'Sustained' }], flaws: [{ name: 'Concentration' }] })), []);
  assert.equal(warns(P('Protection', 4, { flaws: [{ name: 'Concentration' }] })).length, 1);
  // Permanent needs a sustained or continuous effect.
  assert.deepEqual(warns(P('Growth', 4, { flaws: [{ name: 'Permanent' }] })), []);
  assert.match(warns(P('Damage', 4, { flaws: [{ name: 'Permanent' }] })).join(), /Permanent needs an effect that is "lasting"/);
  // Increased Duration makes an instant Damage concentration: no longer "instant" for Secondary Effect.
  assert.deepEqual(warns(P('Damage', 4, { extras: [{ name: 'Secondary Effect' }] })), []);
  assert.equal(warns(P('Damage', 4, { extras: [{ name: 'Secondary Effect' }, { name: 'Increased Duration' }] })).length, 1);
});
