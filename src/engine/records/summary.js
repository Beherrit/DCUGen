// Words for a saved fight: the one-sentence summary and the plain-text log (the same layout as battleText).

import { STYLES } from '../battle/styles.js';

const plural = (n, word) => `${n} ${word}${n === 1 ? '' : 's'}`;

/** "Ballista", "Ballista and Hill Giant", "A, B and C"; copies of one name collapse to "Thug x4"; long lists are cut. */
export function namesOf(fighters, max = 3) {
  const counts = new Map();
  for (const f of fighters) counts.set(f.name, (counts.get(f.name) || 0) + 1);
  const names = [...counts].map(([name, n]) => (n > 1 ? `${name} x${n}` : name));
  const shown = names.length > max ? [...names.slice(0, max), `${plural(names.length - max, 'other')}`] : names;
  return shown.length < 2 ? shown.join('') : `${shown.slice(0, -1).join(', ')} and ${shown[shown.length - 1]}`;
}

function sideNames(rec, letters) {
  return namesOf(letters.flatMap((t) => rec.teams[t] || []));
}

/** The set-up that shaped the fight, in a few words: enclosed space, who ambushed, cover. */
export function setupNotes(rec) {
  const o = rec.options || {};
  const notes = [];
  if (o.enclosed) notes.push('Enclosed space');
  if (o.ambush) notes.push(`Team ${o.ambush} ambushed`);
  if (o.cover?.length) notes.push(`${plural(o.cover.length, 'piece')} of cover`);
  return notes;
}

/** One plain sentence: "Ballista beat Hill Giant in 6 rounds (Enclosed space, Team B ambushed)." */
export function summaryLine(rec) {
  const letters = Object.keys(rec.teams || {}).sort();
  const { winner, gotAway, rounds } = rec.result || {};
  const span = `in ${plural(rounds || 1, 'round')}`;
  const notes = setupNotes(rec);
  const tail = notes.length ? ` (${notes.join(', ')})` : '';
  if (winner && letters.includes(winner)) {
    const losers = letters.filter((t) => t !== winner);
    return `${sideNames(rec, [winner])} ${gotAway ? 'got away from' : 'beat'} ${sideNames(rec, losers)} ${span}${tail}.`;
  }
  const everyone = letters.map((t) => sideNames(rec, [t]));
  const down = Object.values(rec.teams || {}).flat().every((f) => f.end !== 'standing');
  const who = everyone.length > 1 ? `${everyone.slice(0, -1).join(', ')} and ${everyone[everyone.length - 1]}` : everyone.join('');
  return `${who} ${down ? 'all went down' : 'fought to a stalemate'} ${span}${tail}.`;
}

/** The plain-text log of a record, laid out exactly like battleText: header, teams, every line, final state. */
export function recordText(rec) {
  const out = [`${rec.name || 'Battle'} (seed ${rec.seed})`, ''];
  const letters = Object.keys(rec.teams || {}).sort();
  for (const t of letters) {
    out.push(`Team ${t}: ${rec.teams[t].map((f) => `${f.name} (PL ${f.pl}, ${STYLES[f.style]?.label || f.style})`).join(', ')}`);
  }
  out.push('');
  for (const e of rec.log || []) out.push(`${e.kind === 'round' ? '' : '  '}${e.text}`);
  out.push('', 'Final state:');
  for (const f of letters.flatMap((t) => rec.teams[t]).sort((a, b) => a.i - b.i)) out.push(`  ${f.name}: ${f.status} · ${f.stats.hits}/${f.stats.attacks} hits, ${f.stats.kos} KOs`);
  return out.join('\n');
}
