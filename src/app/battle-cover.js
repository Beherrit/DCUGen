// The Battle Room's scenery: cover pieces placed in zones, random streets and buildings, the two optional rules
// (knockback and shooting through cover), and the tags the arena strip shows for each piece. battle.js passes in
// what these need: cx is { battle, ui, save, render }.

import { h, toast } from './dom.js';
import { makeRng } from '../engine/rng.js';
import { createBattle, COVER_KINDS, addCover, removeCover, arenaOf, pieceLabel, toughnessOf } from '../engine/battle.js';

const STREET = ['parked-car', 'parked-car', 'wooden-fence', 'concrete-pillar', 'glass-storefront', 'brick-wall'];
const BUILDING = ['concrete-wall', 'concrete-pillar', 'steel-door', 'brick-wall', 'concrete-wall'];

/** A fresh battle for the Battle Room: the community knockback rule and shooting through cover start switched on. */
export function uiBattle(seed, name = 'Battle') {
  const b = createBattle({ seed, name });
  b.options.knockback = true;
  b.options.shootThrough = true;
  return b;
}

/** After the arena changes size, keep every piece inside it. */
export function fitCover(battle) {
  for (const p of battle.cover || []) p.zone = Math.min(p.zone, arenaOf(battle) - 1);
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
  for (let i = 0; i < count; i++) addCover(battle, rng.pick(theme), rng.int(0, arenaOf(battle) - 1));
  toast(`${count} pieces of scenery placed`);
}

/** The state of a piece, and who stands behind it, in words. */
function pieceStatus(battle, p) {
  const behind = battle.combatants.filter((c) => c.behind === p.id).map((c) => c.name);
  return `${p.state}${behind.length ? `, ${behind.join(' and ')} behind it` : ''}`;
}

/** What the arena strip shows in a zone: each piece with its name, Toughness and state, and who is behind it. */
export function coverTags(battle, zone) {
  return (battle.cover || []).filter((p) => p.zone === zone).map((p) => h('span', { class: `bt-piece ${p.state}`, title: `${pieceLabel(p)}: ${p.level} cover, ${pieceStatus(battle, p)}` },
    `${p.name}, Toughness ${p.toughness}: ${pieceStatus(battle, p)}`));
}

/** One piece in the list, with its Remove button. */
function pieceRow(cx, p) {
  const { battle, save, render } = cx;
  return h('div', { class: 'add-row bt-scenery-row', style: { alignItems: 'center' } },
    h('span', { class: 'bt-scenery-text', title: pieceLabel(p) }, `Zone ${p.zone + 1}: ${pieceLabel(p)}, ${p.level} cover, ${p.state}`),
    h('button', { type: 'button', class: 'btn sm', 'aria-label': `Remove the ${p.name} in zone ${p.zone + 1}`, onClick: () => { removeCover(battle, p.id); save(); render(); } }, 'Remove'));
}

function optionBox(cx, key, label, hint) {
  const { battle, save, render } = cx;
  return h('label', { class: 'bt-copies', title: hint }, h('input', { type: 'checkbox', id: `bt-opt-${key}`, checked: !!battle.options[key], onChange: (e) => { battle.options[key] = e.target.checked; save(); render(); } }), ` ${label}`);
}

/** The Scenery panel for the setup rail. */
export function sceneryPanel(cx) {
  const { battle, ui, save, render } = cx;
  const kind = h('select', { id: 'bt-cover-kind', 'aria-label': 'Kind of cover' }, COVER_KINDS.map((k) => h('option', { value: k.id, selected: k.id === ui.coverKind }, kindText(k))));
  const zone = h('select', { id: 'bt-cover-zone', 'aria-label': 'Zone for the cover' }, Array.from({ length: arenaOf(battle) }, (_, i) => h('option', { value: i, selected: i === (ui.coverZone ?? 1) }, `Zone ${i + 1}`)));
  kind.addEventListener('change', () => { ui.coverKind = kind.value; });
  zone.addEventListener('change', () => { ui.coverZone = Number(zone.value); });
  const add = () => { addCover(battle, kind.value, Number(zone.value)); save(); render(); };
  const roll = (theme, label) => () => { rollScenery(cx, theme, label); save(); render(); };
  return h('div', { class: 'bt-scenery' },
    h('div', { class: 'label' }, 'Scenery'),
    h('p', { class: 'hint', style: { margin: 0 } }, 'Cover gives −2 (partial) or −5 (total) to attacks against whoever stands behind it, and total cover cannot be shot past. Fighters use it when their team plays Take Cover. It can be shot, blasted and smashed to pieces.'),
    h('div', { class: 'add-row', style: { alignItems: 'center' } }, kind, zone, h('button', { type: 'button', class: 'btn sm', id: 'bt-cover-add', onClick: add }, 'Add')),
    h('div', { class: 'add-row' },
      h('button', { type: 'button', class: 'btn sm', id: 'bt-cover-street', onClick: roll(STREET, 'street') }, 'Random street'),
      h('button', { type: 'button', class: 'btn sm', id: 'bt-cover-building', onClick: roll(BUILDING, 'building') }, 'Random building')),
    (battle.cover || []).map((p) => pieceRow(cx, p)),
    optionBox(cx, 'knockback', 'Knockback (community rule)', 'A hard hit throws the target back: the damage rank minus its mass rank sets how far, and walls and cover hurt'),
    optionBox(cx, 'shootThrough', 'Shoot through cover (optional rule)', 'A shot at someone behind total cover must breach the cover first, and loses half its Toughness in rank'));
}
