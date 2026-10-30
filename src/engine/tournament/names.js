// What the rounds and matches are called: "Quarterfinal 2", "Winners final", "Losers round 3, match 1", "Grand final".

/** The name of round r of `rounds` (counting from the end: Final, Semifinal, Quarterfinal, then Round N). */
export function roundName(r, rounds) {
  const left = rounds - r + 1;
  return left === 1 ? 'Final' : left === 2 ? 'Semifinal' : left === 3 ? 'Quarterfinal' : `Round ${r}`;
}

const numbered = (name) => /\d$/.test(name);

/** A match label: the round name, then the match number when the round has more than one match. */
export function matchLabel(name, count, index) {
  if (count <= 1) return name;
  return numbered(name) ? `${name}, match ${index}` : `${name} ${index}`;
}

/** The name of a winners-bracket round in a double elimination ("Winners quarterfinal", "Winners round 1"). */
export function winnersName(r, rounds) {
  return `Winners ${roundName(r, rounds).toLowerCase()}`;
}

/** The name of a losers-bracket round: the last one is the Losers final. */
export function losersName(r, rounds) {
  return r === rounds ? 'Losers final' : `Losers round ${r}`;
}
