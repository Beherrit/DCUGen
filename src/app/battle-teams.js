// The team letters a Battle Room fight can use, and which of them to show right now.

/** Up to eight sides: A to D start on the four edges of the grid, E to H in its corners. */
export const ALL_TEAMS = ['A', 'B', 'C', 'D', 'E', 'F', 'G', 'H'];

/** How many teams the setup offers: the number picked (2 to 8), or more if fighters already sit on later teams. */
export function teamCount(battle, ui) {
  const used = battle.combatants.map((c) => ALL_TEAMS.indexOf(c.team) + 1);
  return Math.max(2, Math.min(ALL_TEAMS.length, Math.max(ui.teamCount || 2, ...used)));
}

/** The team letters to show on fighter rows, cards and pickers. */
export const visibleTeams = (battle, ui) => ALL_TEAMS.slice(0, teamCount(battle, ui));
