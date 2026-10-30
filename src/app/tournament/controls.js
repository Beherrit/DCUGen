// Running the tournament: the champion banner, the status line, and the buttons Play next match, Play round, Play all,
// Restart (same seed), New seed and New tournament. cx is { t, state, R, ui, save, render }.

import { h, toast, openDialog } from '../dom.js';
import { randomSeed } from '../../engine/rng.js';
import { playNextMatch, playRound, playAll, restart, withSeed, nextMatch, championOf, FORMAT_LABELS } from '../../engine/tournament.js';
import { keepTournamentGame, trimKept } from './keep.js';

const plural = (n, word) => `${n} ${n === 1 ? word : word === 'match' ? 'matches' : `${word}s`}`;

function statusText(t) {
  const played = t.matches.filter((m) => m.games.length).length;
  if (t.status === 'over') return `Finished after ${plural(played, 'match')}.`;
  const next = nextMatch(t);
  const lead = t.status === 'ready' ? `Ready: ${plural(t.entrants.length, 'entrant')}, ${FORMAT_LABELS[t.format].toLowerCase()}, best of ${t.bestOf}.` : `${plural(played, 'match')} played.`;
  return next ? `${lead} Next: ${next.label}.` : lead;
}

/** The banner shown when the tournament is over. */
export function championBanner(t) {
  const champ = championOf(t);
  if (t.status !== 'over' || !champ) return null;
  return h('div', { class: 'tn-champion', id: 'tn-champion', role: 'status' }, h('small', null, 'Champion'), h('b', null, champ.name),
    h('span', null, champ.members.length > 1 ? champ.members.map((c) => c.identity?.codename || 'Fighter').join(', ') : 'wins the tournament'));
}

async function newTournament(cx) {
  const { t, state, ui, save, render } = cx;
  if (t.played > 0 && t.status !== 'over') {
    const ok = await openDialog({ title: 'Leave this tournament?', body: h('p', { style: { margin: 0 } }, 'The matches played so far are dropped. Their fights stay in Fights.'), buttons: [{ label: 'Keep it', value: false }, { label: 'Leave', value: true, danger: true }] });
    if (!ok) return;
  }
  state.t = null; ui.sel = null; ui.odds = null;
  save(); render();
}

/** The control row. */
export function controls(cx) {
  const { t, R, ui, save, render } = cx;
  const over = t.status === 'over';
  const go = (fn) => () => {
    try { fn(); } catch (e) { toast(e.message); }
    trimKept(); save(); render();
  };
  const opts = { onGame: keepTournamentGame };
  return h('section', { class: 'panel bt-panel', id: 'tn-controls' },
    h('div', { class: 'cw-turn', 'aria-live': 'polite' }, h('b', { id: 'tn-title' }, FORMAT_LABELS[t.format]), h('span', { id: 'tn-status', class: 'hint' }, statusText(t))),
    championBanner(t),
    h('div', { class: 'btn-row' },
      h('button', { type: 'button', class: 'btn primary', id: 'tn-next', disabled: over, onClick: go(() => { const m = playNextMatch(t, R, opts); if (m) ui.sel = m.id; }) }, 'Play next match'),
      h('button', { type: 'button', class: 'btn', id: 'tn-round', disabled: over, onClick: go(() => playRound(t, R, opts)) }, 'Play round'),
      h('button', { type: 'button', class: 'btn', id: 'tn-all', disabled: over, onClick: go(() => playAll(t, R, opts)) }, 'Play all')),
    h('div', { class: 'btn-row' },
      h('button', { type: 'button', class: 'btn', id: 'tn-restart', disabled: t.played === 0, title: 'Same seed, same seeding: plays the same tournament again', onClick: go(() => { restart(t); ui.sel = null; }) }, 'Restart'),
      h('button', { type: 'button', class: 'btn', id: 'tn-newseed', title: 'New dice (and a new shuffle when seeding is random), nothing played', onClick: go(() => { withSeed(t, randomSeed()); ui.sel = null; ui.odds = null; }) }, 'New seed'),
      h('button', { type: 'button', class: 'btn ghost', id: 'tn-setup', onClick: () => newTournament(cx) }, 'New tournament'),
      h('span', { class: 'hint' }, `Seed ${t.seed}`)));
}
