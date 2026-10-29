// Arena size and the round limit.

export const ARENA = 8;           // zones, left to right
export const ENCLOSED_ARENA = 2;  // a room or corridor: everyone within one move
export function arenaOf(b) { return b?.options?.enclosed ? ENCLOSED_ARENA : ARENA; }
export const MAX_ROUNDS = 40;
