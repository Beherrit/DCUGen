// The leaderboard: a row per character across saved fights, with wins, losses, KOs and an Elo-style rating.
//
// Rating: everyone starts at 1000. Each fight is scored between the sides' average ratings (K = 24); every member of
// a side gets that side's result. With three or more sides, the winning side is scored against each losing side
// (the losers are not scored against each other); a stalemate scores every pair of sides as a draw. Ratings are all
// taken from before the fight, so the order of members inside one fight never matters. Records are replayed oldest
// first (date, then id), so the same records always give the same table.

export const START_RATING = 1000;
export const K_FACTOR = 24;

/** The chance the first side wins, from the two ratings (the Elo curve). */
export function expectedScore(a, b) {
  return 1 / (1 + 10 ** ((b - a) / 400));
}

/** Oldest first: by date, then id. Does not change the list it is given. */
export function sortRecords(records) {
  return [...records].sort((a, b) => (a.date < b.date ? -1 : a.date > b.date ? 1 : a.id < b.id ? -1 : a.id > b.id ? 1 : 0));
}

/** One entry per character per side: the fighters of one side grouped by character key, with their KOs and knock-outs. */
function sideEntries(fighters) {
  const byKey = new Map();
  for (const f of fighters) {
    const e = byKey.get(f.key) || { key: f.key, name: f.name, kos: 0, outs: 0 };
    e.name = f.name;
    e.kos += f.stats?.kos || 0;
    if (f.end === 'out') e.outs++;
    byKey.set(f.key, e);
  }
  return [...byKey.values()];
}

function rowFor(rows, e) {
  if (!rows.has(e.key)) rows.set(e.key, { key: e.key, name: e.name, fights: 0, wins: 0, losses: 0, draws: 0, kos: 0, knockedOut: 0, rating: START_RATING });
  return rows.get(e.key);
}

/** The score each side earns against each other side: [teamA, teamB, scoreForA]. */
function pairings(letters, winner) {
  const pairs = [];
  if (winner && letters.includes(winner)) {
    for (const t of letters) if (t !== winner) pairs.push([winner, t, 1]);
    return pairs;
  }
  for (let i = 0; i < letters.length; i++) for (let j = i + 1; j < letters.length; j++) pairs.push([letters[i], letters[j], 0.5]);
  return pairs;
}

function applyFight(rows, rec) {
  const letters = Object.keys(rec.teams || {}).filter((t) => rec.teams[t].length).sort();
  if (letters.length < 2) return;
  const sides = {};
  for (const t of letters) sides[t] = sideEntries(rec.teams[t]).map((e) => ({ e, row: rowFor(rows, e) }));
  const avg = (t) => sides[t].reduce((s, m) => s + m.row.rating, 0) / sides[t].length;
  const before = Object.fromEntries(letters.map((t) => [t, avg(t)]));
  const delta = Object.fromEntries(letters.map((t) => [t, 0]));
  for (const [a, b, score] of pairings(letters, rec.result?.winner)) {
    const change = K_FACTOR * (score - expectedScore(before[a], before[b]));
    delta[a] += change;
    delta[b] -= change;
  }
  const winner = rec.result?.winner;
  for (const t of letters) {
    for (const { e, row } of sides[t]) {
      row.fights++;
      row.kos += e.kos;
      row.knockedOut += e.outs;
      row.rating += delta[t];
      if (!winner || !letters.includes(winner)) row.draws++;
      else if (t === winner) row.wins++;
      else row.losses++;
    }
  }
}

/** Rows per character, best rating first (ties: more wins, then name, then key). Ratings are kept to one decimal. */
export function leaderboard(records) {
  const rows = new Map();
  for (const rec of sortRecords(records || [])) applyFight(rows, rec);
  return [...rows.values()]
    .map((r) => ({ ...r, rating: Math.round(r.rating * 10) / 10 }))
    .sort((a, b) => b.rating - a.rating || b.wins - a.wins || a.name.localeCompare(b.name) || (a.key < b.key ? -1 : 1));
}
