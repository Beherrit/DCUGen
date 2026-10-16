import { test } from 'node:test';
import assert from 'node:assert/strict';
import { emptyWorld, mergeWorldSaved } from '../src/engine/world.js';
import { setCast, updateCast, removeFromCast, attendance, addSession, sessionsOf, updateSession, removeSession, addScene, moveScene, updateScene, removeScene, attachPlan, markPlayed, nextSession, lastPlayed, addThread, closeThread, reopenThread, openThreads, previouslyOn, sessionIcs, whenLabel } from '../src/engine/sessions.js';

test('sessions number on from the campaign, and scenes keep their order', () => {
  const w = emptyWorld();
  const a = addSession(w, { title: 'The Heist', after: 3 });
  const b = addSession(w, {});
  assert.deepEqual([a.number, b.number], [4, 5]);
  addScene(w, a.id, { text: 'Rooftop chase', links: ['char:x', 'char:x'] });
  const two = addScene(w, a.id, { text: 'The vault' });
  assert.equal(addScene(w, a.id, { text: '  ' }), null);
  assert.deepEqual(a.scenes[0].links, ['char:x']);
  moveScene(w, a.id, two.id, -1);
  assert.deepEqual(a.scenes.map((s) => s.text), ['The vault', 'Rooftop chase']);
  updateScene(w, a.id, two.id, { done: true });
  assert.equal(a.scenes[0].done, true);
  removeScene(w, a.id, two.id);
  assert.equal(a.scenes.length, 1);
  updateSession(w, b.id, { title: 'Aftermath' });
  assert.deepEqual(sessionsOf(w).map((s) => s.title), ['The Heist', 'Aftermath']);
});

test('a Session in a Box plan is kept with its session, scenes and all, without whole sheets', () => {
  const w = emptyWorld();
  const s = addSession(w, {});
  const plan = { villain: { ch: { identity: { codename: 'Doctor Null' }, pl: 11, abilities: {} }, why: 'He has a grudge' }, minions: { name: 'Null Drones', count: 6 }, scenes: [{ title: 'Hook', text: 'A letter arrives', stakes: 'Someone is missing' }, { title: 'Showdown', text: 'At the dam' }], rumor: 'Lights over the dam' };
  attachPlan(w, s.id, plan);
  assert.equal(s.plan.villain.name, 'Doctor Null');
  assert.equal(s.plan.villain.abilities, undefined);
  assert.deepEqual(s.scenes.map((x) => x.text), ['Hook: A letter arrives', 'Showdown: At the dam']);
  attachPlan(w, s.id, plan);
  assert.equal(s.scenes.length, 2, 'prepping again does not repeat the scenes');
});

test('the next session is the earliest one coming; a played session keeps its recap', () => {
  const w = emptyWorld();
  const now = new Date('2026-10-15T12:00');
  const past = addSession(w, { date: '2026-10-01T19:00' });
  const soon = addSession(w, { date: '2026-10-24T19:00' });
  addSession(w, { date: '2026-11-07T19:00' });
  assert.equal(nextSession(w, now).id, soon.id);
  markPlayed(w, past.number, { headline: 'The dam holds', blurbs: ['Spark saved the town'] });
  assert.equal(lastPlayed(w).id, past.id);
  assert.deepEqual(past.recap.lines, ['Spark saved the town']);
  // Played on a session the planner never had: it gets one.
  const s9 = markPlayed(w, 9, null);
  assert.equal(s9.number, 9);
  assert.equal(s9.status, 'played');
});

test('plot threads open and close', () => {
  const w = emptyWorld();
  const t = addThread(w, { text: 'Who sent the letter?', opened: 2 });
  addThread(w, { text: 'The missing drone' });
  assert.equal(openThreads(w).length, 2);
  closeThread(w, t.id, 4);
  assert.equal(openThreads(w).length, 1);
  assert.equal(t.closed, 4);
  reopenThread(w, t.id);
  assert.equal(openThreads(w).length, 2);
});

test('previously on: the last recap, what changed that session, and what is still open', () => {
  const w = emptyWorld();
  const s = addSession(w, {});
  markPlayed(w, s.number, { headline: 'Spark falls', blurbs: ['Shadowshot swears revenge'] });
  addThread(w, { text: 'Where is Doctor Null?', links: ['person:null'] });
  const world = { moments: [{ session: s.number, text: 'Spark and Doctor Null became enemies.' }, { session: 99, text: 'later' }], entities: new Map([['person:null', { name: 'Doctor Null' }]]) };
  const p = previouslyOn(w, world, { campaign: 'Ravensport' });
  assert.equal(p.title, `Previously on Ravensport, session ${s.number}…`);
  assert.deepEqual(p.lines, ['Spark falls', 'Shadowshot swears revenge', 'Spark and Doctor Null became enemies.', 'Still unresolved: Where is Doctor Null? (Doctor Null)']);
  assert.match(p.text, /^Previously on Ravensport/);
  assert.equal(previouslyOn(emptyWorld(), { moments: [] }), null);
  // Before the first session: the open threads, no session number.
  const first = emptyWorld();
  addThread(first, { text: 'A letter arrives' });
  assert.equal(previouslyOn(first, { moments: [] }, { campaign: 'R', before: 1 }).title, 'Previously on R…');
});

test('a calendar file for game night', () => {
  const w = emptyWorld();
  const s = addSession(w, { title: 'The Heist', date: '2026-10-24T19:00' });
  const ics = sessionIcs(s, { campaign: 'Ravensport, Inc', now: new Date('2026-10-15T00:00:00Z') });
  assert.match(ics, /BEGIN:VEVENT/);
  assert.match(ics, /DTSTART:20261024T190000/);
  assert.match(ics, /DTEND:20261024T220000/);
  assert.match(ics, /SUMMARY:Ravensport\\, Inc: Session 1 \(The Heist\)/);
  assert.ok(ics.includes('\r\n'));
  assert.equal(sessionIcs({ ...s, date: '' }), null);
  assert.match(whenLabel('2026-10-24T19:00', 'en-US'), /Oct/);
  assert.equal(whenLabel(''), '');
});

test('two copies of a world merge their sessions and threads; deleted ones stay deleted', () => {
  const a = emptyWorld();
  const s = addSession(a, { title: 'One' });
  const gone = addSession(a, { title: 'Cancelled' });
  const b = JSON.parse(JSON.stringify(a));
  updateSession(b, s.id, { title: 'One (moved)', updated: '2999-01-01T00:00:00.000Z' });
  b.sessions.find((x) => x.id === s.id).updated = '2999-01-01T00:00:00.000Z';
  addThread(b, { text: 'From the other copy' });
  removeSession(a, gone.id);
  const m = mergeWorldSaved(a, b);
  assert.deepEqual(sessionsOf(m).map((x) => x.title), ['One (moved)']);
  assert.equal(m.threads.length, 1);
});

test('who played: marking a session played keeps the cast once, and attendance adds up games and XP', () => {
  const saved = {};
  const s1 = addSession(saved, {});
  const s2 = addSession(saved, {});
  const cast = [{ rosterId: 'a', name: 'Spark', pl: 10, conds: ['Dazed'], xp: 1 }, { rosterId: 'v', name: 'Null', villain: true }, { rosterId: 'a', name: 'Spark again' }];
  markPlayed(saved, s1.number, null, cast);
  assert.equal(s1.cast.length, 2, 'duplicates are dropped');
  markPlayed(saved, s1.number, null, [{ rosterId: 'b', name: 'Other' }]);
  assert.equal(s1.cast[0].name, 'Spark', 'a recorded cast is not replaced');
  setCast(saved, s2.id, [{ rosterId: 'a', name: 'Spark', xp: 2 }, { rosterId: 'b', name: 'Bolt' }]);
  updateCast(saved, s2.id, { rosterId: 'b', name: 'Bolt' }, { xp: 3, note: 'late' });
  updateCast(saved, s2.id, { rosterId: 'c', name: 'Echo' });
  removeFromCast(saved, s2.id, 'c');
  const a = attendance(saved);
  assert.deepEqual(a.sessions.map((s) => s.number), [1, 2]);
  assert.deepEqual(a.people.map((p) => [p.name, p.count, p.xp, p.villain]), [['Spark', 2, 3, false], ['Bolt', 1, 3, false], ['Null', 1, 0, true]]);
  assert.equal(a.people[1].sessions[2].note, 'late');
});
