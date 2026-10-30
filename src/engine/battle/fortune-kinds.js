// What a character's fortune and trick advantages mean in a fight, read once when the fighter is built: which checks an
// Ultimate Effort covers (Hero's Handbook p79) and which skills a Daze can use (p73).

const KIND_WORDS = [
  ['attack', /aim|attack|accura|to.?hit/i],
  ['Toughness', /tough/i],
  ['Will', /\bwill\b/i],
  ['Fortitude', /fort/i],
  ['Dodge', /dodge/i],
];

/** The kinds of check the character's Ultimate Efforts cover: 'attack', 'Toughness', 'Will', 'Fortitude' or 'Dodge'. Each advantage names its check in its parameter. */
export function ultimateKinds(ch) {
  const kinds = new Set();
  for (const a of ch.advantages || []) {
    if (a.name !== 'Ultimate Effort') continue;
    for (const [kind, re] of KIND_WORDS) if (re.test(String(a.param || ''))) kinds.add(kind);
  }
  return [...kinds];
}

/** The skills the character can Daze with: Deception, Intimidation, or both (one advantage rank each; no named skill counts as either). */
export function dazeSkills(ch) {
  const skills = new Set();
  for (const a of ch.advantages || []) {
    if (a.name !== 'Daze') continue;
    const param = String(a.param || '');
    if (/decep/i.test(param)) skills.add('Deception');
    else if (/intimid/i.test(param)) skills.add('Intimidation');
    else { skills.add('Deception'); skills.add('Intimidation'); }
  }
  return [...skills];
}
