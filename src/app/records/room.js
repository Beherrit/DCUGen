// What the Battle Room needs from the saved fights: keeping a fight when it ends, the "Saved to Fights" note on the
// result, and the row of sub-tabs (One fight, City war, Tournament, Fights) shared by the pages. battle.js only calls these.

import { h } from '../dom.js';
import { fightRecord } from '../../engine/records/record.js';
import { saveRecord, keepLogs, freeId, pruneRecords, hasRecord } from './store.js';

/**
 * Keep a finished fight once. The battle remembers the id it was kept under (battle.keptId), so redrawing the page
 * never saves it twice; a replay is a new battle and gets its own record. Does nothing while "Keep fight logs" is off.
 */
export function keepFinishedFight(battle, save) {
  if (battle.status !== 'over' || battle.keptId || !keepLogs()) return;
  try {
    const rec = fightRecord(battle, { source: 'battle-room', label: battle.name || '', counter: freeId(battle.seed) });
    if (!saveRecord(rec)) return;
    battle.keptId = rec.id;
    pruneRecords();
    save();
  } catch { /* the fight is shown either way */ }
}

/** "Saved to Fights" with a link that opens the fight there (nothing when it was not kept or has been deleted). */
export function keptNote(battle, open) {
  if (!battle.keptId || !hasRecord(battle.keptId)) return null;
  return h('span', { class: 'hint bt-kept', id: 'bt-kept' }, 'Saved to Fights. ', h('button', { class: 'linkish', type: 'button', id: 'bt-kept-open', onClick: () => open(battle.keptId) }, 'Open it'));
}

/** The sub-tabs at the top of the Battle Room: go(sub) with 'fight', 'citywar', 'tournament' or 'fights'. */
export function roomTabs(current, go) {
  return h('div', { class: 'seg bt-subtabs', role: 'group', 'aria-label': 'Battle Room pages' },
    [['fight', 'One fight'], ['citywar', 'City war'], ['tournament', 'Tournament'], ['fights', 'Fights']].map(([v, t]) => h('button', { type: 'button', id: `bt-sub-${v}`, 'aria-pressed': String(v === current), onClick: () => go(v) }, t)));
}
