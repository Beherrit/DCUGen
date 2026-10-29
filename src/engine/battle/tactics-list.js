// The team tactics a side can play, and which one a fighter's team is playing.

export const TEAM_TACTICS = {
  none: { label: "Each fighter's own style", blurb: 'No team plan: everyone fights the way its build suggests.' },
  focus: { label: 'Focus Fire', blurb: 'The whole team picks the most dangerous enemy and brings it down together.' },
  alpha: { label: 'Alpha Strike', blurb: 'Hit as hard as possible in the first two rounds, spending extra effort and hero points freely.' },
  line: { label: 'Hold the Line', blurb: 'Tough fighters stand in front with defensive attacks and guard allies; the rest stay one zone back.' },
  bodyguard: { label: 'Bodyguard', blurb: 'The team protects one fighter, stays beside them, interposes for them and goes after whoever attacks them.' },
  kite: { label: 'Kite', blurb: 'Ranged fighters keep their distance from melee enemies, take no close fights and aim when nobody is near.' },
  lockdown: { label: 'Lockdown', blurb: 'Controllers pin down the most dangerous enemy first while the damage dealers finish controlled enemies.' },
  pickoff: { label: 'Pick Them Off', blurb: 'Go after minions, wounded enemies and the most fragile fighter first.' },
  flank: { label: 'Feint and Flank', blurb: 'Skilled fighters feint to open up the enemy, and the team piles onto whoever is left exposed.' },
  sustain: { label: 'Sustain', blurb: 'Healers keep everyone up, the others fight defensively while a friend is hurt, and the hurt recover early.' },
  noretreat: { label: 'No Retreat', blurb: 'Nobody flees or digs in, and every close attack is an all-out attack.' },
  cover: { label: 'Take Cover', blurb: 'Shooters move behind the best cover in reach and defend when no attack is worth much; melee fighters still close in. With no cover about, the team defends more when outnumbered.' },
  intimidate: { label: 'Intimidate and Break', blurb: 'The best intimidator demoralizes the most dangerous enemy each round, demoralized minions flee more readily, and everyone else goes after the demoralized first.' },
  aid: { label: 'Aid the Champion', blurb: 'The strongest attacker is the champion; fighters whose own attacks are worth less than half of theirs aid the champion\'s attack instead.' },
  withdraw: { label: 'Fighting Withdrawal', blurb: 'The goal is escape: fighters walk to their own edge and leave, while tanks and Interposers cover the retreat. The team wins by getting half its fighters away, or by holding out for a set number of rounds.' },
};

/** The tactic id for c's team, or 'none'. */
export function tacticOf(b, c) {
  const id = b.options?.teamTactics?.[c.team];
  return id && TEAM_TACTICS[id] ? id : 'none';
}
