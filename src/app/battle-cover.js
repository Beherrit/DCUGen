// The Battle Room's scenery: cover pieces placed on squares of the grid, random streets and buildings, the scale of
// the grid, and the two optional rules (knockback and shooting through cover). battle.js passes in what these need:
// cx is { battle, ui, save, render }.

import { h, toast } from './dom.js';
import { makeRng } from '../engine/rng.js';
import { createBattle, COVER_KINDS, addCover, removeCover, squareName, pieceLabel, toughnessOf, ENVIRONMENTS } from '../engine/battle.js';
import { scalePicker } from './battle-grid.js';

const STREET = ['parked-car', 'parked-car', 'wooden-fence', 'concrete-pillar', 'glass-storefront', 'brick-wall'];
const BUILDING = ['concrete-wall', 'concrete-pillar', 'steel-door', 'brick-wall', 'concrete-wall'];

/** A fresh battle for the Battle Room: the community knockback rule and shooting through cover start switched on. */
export function uiBattle(seed, name = 'Battle') {
  const b = createBattle({ seed, name });
  b.options.knockback = true;
  b.options.shootThrough = true;
  return b;
}

/** After the room changes (an enclosed space has walls), keep every piece on the playable squares. */
export function fitCover(battle) {
  const { x0, y0, x1, y1 } = battle.grid.play;
  for (const p of battle.cover || []) { p.x = Math.max(x0, Math.min(x1, p.x)); p.y = Math.max(y0, Math.min(y1, p.y)); }
}

/** Cover for a restarted battle: the same pieces, whole again. */
export const wholeCover = (cover) => (cover || []).map((p) => ({ ...p, state: 'intact' }));

const kindText = (k) => `${k.name} (${k.material}, ${k.inches} in, Toughness ${toughnessOf(k.material, k.inches)}, ${k.level} cover)`;

/** Replace the scenery with 3 to 6 seeded pieces from a theme. */
function rollScenery(cx, theme, label) {
  const { battle, ui } = cx;
  const rng = makeRng(`${battle.seed}::${label}::${ui.sceneryRolls = (ui.sceneryRolls || 0) + 1}`);
  for (const p of [...(battle.cover || [])]) removeCover(battle, p.id);
  const count = rng.int(3, 6);
  const { x0, y0, x1, y1 } = battle.grid.play; // keep clear of the two columns where the teams start
  for (let i = 0; i < count; i++) addCover(battle, rng.pick(theme), rng.int(x0 + 2, x1 - 2), rng.int(y0, y1));
  toast(`${count} pieces of scenery placed`);
}

/** The state of a piece, and who stands behind it, in words. */
function pieceStatus(battle, p) {
  const behind = battle.combatants.filter((c) => c.behind === p.id).map((c) => c.name);
  return `${p.state}${behind.length ? `, ${behind.join(' and ')} behind it` : ''}`;
}

/** One piece in the list, with its Remove button. */
function pieceRow(cx, p) {
  const { battle, save, render } = cx;
  return h('div', { class: 'add-row bt-scenery-row', style: { alignItems: 'center' } },
    h('span', { class: 'bt-scenery-text', title: pieceLabel(p) }, `${squareName(p.x, p.y)}: ${pieceLabel(p)}, ${p.level} cover, ${pieceStatus(battle, p)}`),
    h('button', { type: 'button', class: 'btn sm', 'aria-label': `Remove the ${p.name} at ${squareName(p.x, p.y)}`, onClick: () => { removeCover(battle, p.id); save(); render(); } }, 'Remove'));
}

function optionBox(cx, key, label, hint) {
  const { battle, save, render } = cx;
  return h('label', { class: 'bt-copies', title: hint }, h('input', { type: 'checkbox', id: `bt-opt-${key}`, checked: !!battle.options[key], onChange: (e) => { battle.options[key] = e.target.checked; save(); render(); } }), ` ${label}`);
}

/** Where the fight takes place, for Favored Environment (the walled room is the Enclosed space box). */
function environmentPicker(cx) {
  const { battle, save, render } = cx;
  const opts = [h('option', { value: '' }, 'Open ground (no particular environment)'), ...ENVIRONMENTS.map((e) => h('option', { value: e.id, selected: battle.options.environment === e.id }, e.label))];
  return h('label', { class: 'bt-copies', title: 'Fighters with Favored Environment get +2 on attacks or on defenses when it matches' }, 'Environment ',
    h('select', { id: 'bt-environment', 'aria-label': 'Environment', onChange: (e) => { battle.options.environment = e.target.value || null; save(); render(); } }, ...opts));
}

/** The Scenery panel for the setup rail. */
export function sceneryPanel(cx) {
  const { battle, ui, save, render } = cx;
  const kind = h('select', { id: 'bt-cover-kind', 'aria-label': 'Kind of cover' }, COVER_KINDS.map((k) => h('option', { value: k.id, selected: k.id === ui.coverKind }, kindText(k))));
  ui.coverKind = ui.coverKind || kind.value;
  kind.addEventListener('change', () => { ui.coverKind = kind.value; });
  const place = () => { ui.placing = !ui.placing; render(); };
  const roll = (theme, label) => () => { rollScenery(cx, theme, label); save(); render(); };
  return h('div', { class: 'bt-scenery' },
    scalePicker(cx),
    h('div', { class: 'label' }, 'Scenery'),
    h('p', { class: 'hint', style: { margin: 0 } }, 'Cover gives −2 (partial) or −5 (total) to attacks on someone standing next to it, on the far side from the attacker, and total cover cannot be shot past. Pieces fill their square and are walked around. Fighters who would rather shoot step behind a piece beside them; a team playing Take Cover goes out of its way to reach one. It can be shot, blasted and smashed to pieces.'),
    h('div', { class: 'add-row', style: { alignItems: 'center' } }, kind, h('button', { type: 'button', class: `btn sm ${ui.placing ? 'on' : ''}`, id: 'bt-cover-add', 'aria-pressed': !!ui.placing, onClick: place }, ui.placing ? 'Click a square on the grid' : 'Place on the grid')),
    h('div', { class: 'add-row' },
      h('button', { type: 'button', class: 'btn sm', id: 'bt-cover-street', onClick: roll(STREET, 'street') }, 'Random street'),
      h('button', { type: 'button', class: 'btn sm', id: 'bt-cover-building', onClick: roll(BUILDING, 'building') }, 'Random building')),
    (battle.cover || []).map((p) => pieceRow(cx, p)),
    optionBox(cx, 'knockback', 'Knockback (community rule)', 'A hard hit throws the target back: the damage rank minus its mass rank sets how far, and walls and cover hurt'),
    optionBox(cx, 'shootThrough', 'Shoot through cover (optional rule)', 'A shot at someone behind total cover must breach the cover first, and loses half its Toughness in rank'),
    optionBox(cx, 'lethal', 'Lethal damage (optional rule)', 'Attackers go for the kill: a fighter taken out by Damage is dying and rolls a Fortitude check each round (DC 15, two degrees of success steady it, three degrees of failure in all kill it), further damage kills, minions taken out are killed, and Diehard, Treatment and Healing save lives. Off, a fighter who would be dying is only incapacitated'),
    environmentPicker(cx));
}
