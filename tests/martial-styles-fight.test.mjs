// What practising a style adds in the Battle Room beyond the stance: style extras and flaws (MA pp 131-136), Kata, Preferred Stance,
// and the Student and Initiate advantages (MA pp 72-80).
import { test } from 'node:test';
import assert from 'node:assert/strict';
import { R, artist, ring, who, texts } from './helpers/ma-kit.mjs';
import { dice } from './helpers/fighters.mjs';
import { RAW } from '../src/generated/rulesdata.js';
import { stanceDef } from '../src/engine/martial/lookup.js';
import { enterStance } from '../src/engine/battle/stance-fight.js';
import { defenseOf } from '../src/engine/battle/conditions.js';
import { resolveAttack } from '../src/engine/battle/attacks.js';
import { styleEndTurn, styleStartTurn } from '../src/engine/battle/style-turn.js';
import { readExtras } from '../src/engine/battle/style-extras.js';
import { squaresInMove } from '../src/engine/battle/geometry.js';
import { deriveAll } from '../src/engine/derive.js';

const atk = (c, name) => c.attacks.find((a) => a.name === name);
const put = (c, name) => enterStance(c, { name, def: stanceDef(R, name), style: c.ma.styles[0].name });
const plain = (c) => { for (const s of c.ma.styles) Object.assign(s, readExtras(null)); return c; };
const pair = (mine = {}, foe = {}) => {
  const b = ring([['me', 'A', artist({ tier: 'student', abilities: { Fighting: 3 }, ranks: 3, ...mine })], ['foe', 'B', artist({ style: 'Boabom', ...foe })]]);
  return { b, me: who(b, 'me'), foe: who(b, 'foe') };
};
const withFlag = (list, kind, name) => RAW.styles.find((s) => (s[kind] || []).some((x) => x.name === name) && s.stances?.length > 3 && s.type === 'Unarmed').name;

test('Attack Focus: +2 to attack and initiative with the named attacks, only in a stance of the style', () => {
  const { me } = pair({ maneuvers: ['Jab', 'Snap Kick'] });
  plain(me);
  me.ma.styles[0].ex.focus = ['jab'];
  const jab = atk(me, 'Jab').bonus; const kick = atk(me, 'Snap Kick').bonus; const init = me.initBonus;
  assert.equal(atk(me, 'Jab').bonus, jab, 'Neutral: nothing');
  put(me, 'Blocking'); // -2 attack
  assert.equal(atk(me, 'Jab').bonus, jab - 2 + 2);
  assert.equal(atk(me, 'Snap Kick').bonus, kick - 2);
  assert.equal(me.initBonus, init + 2);
  assert.deepEqual(Object.keys(atk(me, 'Jab').bn).sort(), ['Attack Focus', 'Blocking stance', 'Student'].filter((k) => atk(me, 'Jab').bn[k]).sort());
});

test('Clumsy Attacks: -2 to attack and initiative with the named attacks in a stance', () => {
  const { me } = pair({ maneuvers: ['Jab', 'Snap Kick'] });
  plain(me);
  me.ma.styles[0].fl.clumsy = ['kicks'];
  const kick = atk(me, 'Snap Kick').bonus; const jab = atk(me, 'Jab').bonus; const init = me.initBonus;
  put(me, 'Grounded'); // -1 attack (and vulnerable)
  assert.equal(atk(me, 'Snap Kick').bonus, kick - 1 - 2);
  assert.equal(atk(me, 'Jab').bonus, jab - 1);
  assert.equal(me.initBonus, init - 2);
});

test('Defensive: +1 Parry and Dodge in a stance of the style; Weak Defense takes its rank off Parry or Dodge', () => {
  const { me } = pair();
  plain(me);
  me.ma.styles[0].ex.defensive = true;
  const parry = defenseOf(me, 'Parry'); const dodge = defenseOf(me, 'Dodge');
  put(me, 'Guarded'); // no number of its own
  assert.equal(defenseOf(me, 'Parry'), parry + 1);
  assert.equal(defenseOf(me, 'Dodge'), dodge + 1);
  const weak = pair().me;
  plain(weak);
  weak.ma.styles[0].fl.weak = { rank: 4, parry: true, dodge: false };
  put(weak, 'Guarded');
  assert.equal(defenseOf(weak, 'Parry'), parry - 4);
  assert.equal(defenseOf(weak, 'Dodge'), dodge);
});

test('Mobile: +2 to the weaker of Parry and Dodge after a round of moving more than 15 feet; Fixed after standing still and fighting', () => {
  const { b, me } = pair({ maneuvers: ['Jab'] });
  plain(me);
  me.ma.styles[0].ex.mobile = 1;
  const parry = defenseOf(me, 'Parry'); const dodge = defenseOf(me, 'Dodge');
  const weaker = parry <= dodge ? 'Parry' : 'Dodge';
  me.squaresMoved = 4; // 20 ft
  styleEndTurn(b, me);
  assert.equal(defenseOf(me, weaker), (weaker === 'Parry' ? parry : dodge) + 2);
  assert.match(texts(b).at(-1), /Mobile/);
  styleStartTurn(me);
  assert.equal(defenseOf(me, 'Parry'), parry, 'it ends when the fighter next acts');
  me.ma.styles[0].ex.mobile = 0; me.ma.styles[0].ex.fixed = 1;
  me.squaresMoved = 0; me.maRound = { struck: b.round };
  styleEndTurn(b, me);
  assert.equal(defenseOf(me, weaker), (weaker === 'Parry' ? parry : dodge) + 2);
  assert.match(texts(b).at(-1), /Fixed/);
});

test('Impractical: a natural 1 on a style attack costs the style\'s rank on all its checks for a round', () => {
  const { b, me, foe } = pair({ maneuvers: ['Jab'] });
  plain(me);
  me.ma.styles[0].fl.impractical = 2;
  me.x = 0; foe.x = 1; me.y = foe.y = 0;
  const jab = atk(me, 'Jab').bonus; const parry = defenseOf(me, 'Parry');
  resolveAttack(b, R, me, atk(me, 'Jab'), foe, dice(1, 10, 10, 10), {});
  assert.equal(atk(me, 'Jab').bonus, jab - 2);
  assert.equal(defenseOf(me, 'Parry'), parry - 2);
  assert.match(texts(b).join(' '), /impractical, and every check is at −2/);
  styleStartTurn(me);
  assert.equal(atk(me, 'Jab').bonus, jab);
});

test('Listless takes 4 off initiative a rank, Slow a speed rank a rank', () => {
  const listless = withFlag(null, 'style_flaws', 'Listless');
  const a = pair({ style: listless }).me;
  const base = pair({ style: 'Aikido' }).me;
  assert.equal(a.initBonus, base.initBonus - 4);
  const slow = pair({ style: 'Sumo' }).me;
  assert.equal(slow.moveRank, base.moveRank - 1);
  assert.ok(squaresInMove(ring([['x', 'A', artist({ style: 'Sumo' })], ['y', 'B', artist()]]), slow) <= squaresInMove(ring([['x', 'A', artist()], ['y', 'B', artist()]]), base));
});

test('Kata: +2 to Parry and Dodge in a round the fighter uses a style maneuver from one of its stances', () => {
  const { b, me, foe } = pair({ maneuvers: ['Jab'], adv: [{ name: 'Kata', param: 'Aikido' }] });
  plain(me);
  me.x = 0; foe.x = 1; me.y = foe.y = 0;
  put(me, 'Guarded');
  const parry = defenseOf(me, 'Parry'); const dodge = defenseOf(me, 'Dodge');
  resolveAttack(b, R, me, atk(me, 'Jab'), foe, dice(10, 10, 10, 10, 10), {});
  assert.equal(defenseOf(me, 'Parry'), parry + 2);
  assert.equal(defenseOf(me, 'Dodge'), dodge + 2);
  assert.match(texts(b).join(' '), /Kata: me moves through the Aikido form/);
  put(me, 'Neutral');
  styleStartTurn(me);
  resolveAttack(b, R, me, atk(me, 'Jab'), foe, dice(10, 10, 10, 10, 10), {});
  assert.equal(defenseOf(me, 'Parry'), parry - 0 - (parry - defenseOf(me, 'Parry')), 'no bonus from Neutral');
  assert.ok(!me.mods.some((e) => e.source === 'kata'));
});

test('Preferred Stance: the worst attack penalty of the favoured stance is halved', () => {
  const plainFighter = pair({ maneuvers: ['Jab'] }).me;
  plain(plainFighter);
  const keen = pair({ maneuvers: ['Jab'], adv: [{ name: 'Preferred Stance', param: 'Blocking' }], tier: 'student' }).me;
  plain(keen);
  const jabKeen = atk(keen, 'Jab').bonus; const jabPlain = atk(plainFighter, 'Jab').bonus;
  put(keen, 'Blocking'); put(plainFighter, 'Blocking');
  assert.equal(atk(plainFighter, 'Jab').bonus, jabPlain - 2);
  assert.equal(atk(keen, 'Jab').bonus, jabKeen - 1, '-2 becomes -1');
});

test('(Style) Initiate adds 2 to the style\'s skills but not to its Close Combat skill', () => {
  const name = RAW.styles.find((s) => (s.skill_list || []).some((k) => /^Acrobatics/.test(k.name)) && s.stances?.length > 2).name;
  const ch = artist({ style: name });
  const base = deriveAll(ch, R).skills.find((s) => s.name === 'Acrobatics')?.bonus ?? deriveAll(ch, R).abilities.Agility;
  const b = ring([['me', 'A', ch], ['foe', 'B', artist()]]);
  assert.equal(who(b, 'me').skills.Acrobatics, base + 2);
});

test('Opposing Style: +2 to attack against a foe who practices the named style, and the log says so', () => {
  const { b, me, foe } = pair({ maneuvers: ['Jab'], adv: [{ name: 'Opposing Style', param: 'Boabom' }] });
  me.x = 0; foe.x = 1; me.y = foe.y = 0;
  resolveAttack(b, R, me, atk(me, 'Jab'), foe, dice(10, 10, 10, 10), {});
  assert.match(texts(b).join(' '), /Opposing Style \(Boabom\): \+2/);
});

test('Finesse Attack: a chosen Strength-based attack takes its damage from Dexterity when that is higher', () => {
  const quick = pair({ maneuvers: ['Jab'], abilities: { Fighting: 3, Dexterity: 8, Strength: 2 }, adv: [{ name: 'Finesse Attack', param: 'Jab' }] }).me;
  const dull = pair({ maneuvers: ['Jab'], abilities: { Fighting: 3, Dexterity: 8, Strength: 2 } }).me;
  assert.equal(atk(quick, 'Jab').rank, atk(dull, 'Jab').rank + 6);
  assert.equal(atk(quick, 'Unarmed').rank, atk(dull, 'Unarmed').rank, 'only the chosen attack');
});

test('a practiced style\'s own skill rates its unarmed attack: Close Combat: style in place of the sheet\'s skill when higher', () => {
  const { me } = pair({ ranks: 6 });
  assert.equal(atk(me, 'Unarmed').bonus, 3 + 6 + 2, 'Fighting 3, 6 ranks of the style, and the Student bonus');
  assert.ok(atk(me, 'Unarmed').bn['Close Combat: Aikido'] > 0);
});
