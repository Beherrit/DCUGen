// The roles a fighter's build suggests (engine/battle/roles.js), shown on its card next to the fighting style.

/** " · Roles: healer, controller" for the card's name line, or an empty string when the build suggests none. */
export function rolesNote(c) {
  return c.roles?.length ? ` · Roles: ${c.roles.join(', ')}` : '';
}
