// Headless Gate Trials test: every card type for Little and Big, played by the bot and by
// scripts of a child who doesn't move, moves the wrong way, or drops out of view.
//
//   node tools/test-trials.mjs

import { pathToFileURL, fileURLToPath } from 'url';
import { dirname, join } from 'path';

const here = dirname(fileURLToPath(import.meta.url));
const { createTrialsSim, createTrialsBot } = await import(pathToFileURL(join(here, '../js/activities/trials-sim.js')).href);

const DT = 1 / 60;
let failed = 0;
const check = (ok, name, detail = '') => {
  if (!ok) failed++;
  console.log(`${ok ? 'PASS' : 'FAIL'}  ${name}${detail ? `  (${detail})` : ''}`);
};
const NEUTRAL = { zone: 'center', jump: false, duck: false, lean: null, armsUp: false, armsDown: true, pose: null, stillFor: 1, tracking: true };
const MOVING = { ...NEUTRAL, stillFor: 0 };

// Plays until the round ends (or `seconds`); returns the events.
function play(sim, inputAt, seconds = 120) {
  const log = [];
  for (let t = 0; t < seconds && sim.phase !== 'roundEnd' && sim.phase !== 'done'; t += DT) {
    sim.update(inputAt(t, sim), DT);
    for (const e of sim.events) log.push({ t, ...e });
    sim.events.length = 0;
  }
  return log;
}
const count = (log, type) => log.filter(e => e.type === type).length;
const TYPES = ['jump', 'squat', 'lean', 'freeze', 'step', 'reach', 'pose', 'dance'];

console.log('Each card type, played by the bot (4 cards each):');
for (const age of ['little', 'big']) {
  for (const type of TYPES) {
    const sim = createTrialsSim({ age, seed: 5, rounds: [{ cards: [type, type, type, type] }] });
    const bot = createTrialsBot(sim);
    const log = play(sim, () => bot(DT));
    check(count(log, 'hit') === 4 && sim.phase === 'roundEnd', `${age.padEnd(6)} ${type.padEnd(7)} 4 hits`, `${count(log, 'hit')} hits, ${count(log, 'miss')} misses`);
  }
}

console.log('\nNothing passes without the move (child stands still, or keeps moving for freeze):');
for (const age of ['little', 'big']) {
  for (const type of TYPES.filter(t => t !== 'dance')) {
    const sim = createTrialsSim({ age, seed: 5, rounds: [{ cards: [type, type] }] });
    const log = play(sim, () => (type === 'freeze' ? MOVING : NEUTRAL));
    check(count(log, 'miss') === 2 && count(log, 'hit') === 0, `${age.padEnd(6)} ${type.padEnd(7)} 2 misses`, `${count(log, 'hit')} hits`);
  }
}
{
  // Standing still is not a squat; dancing is not a freeze.
  const sim = createTrialsSim({ age: 'little', rounds: [{ cards: ['squat'] }] });
  const log = play(sim, () => ({ ...NEUTRAL, stillFor: 5 }));
  check(count(log, 'miss') === 1, 'standing still does not count as a squat');
}

console.log('\nFreeze only counts while tracked; losing tracking pauses the card:');
{
  const sim = createTrialsSim({ age: 'little', rounds: [{ cards: ['freeze'] }] });
  // Ready and demo with tracking, then still but NOT tracked for 60 s.
  let log = play(sim, (t, s) => (s.phase === 'window' ? { ...NEUTRAL, stillFor: 9, tracking: false } : NEUTRAL), 60);
  check(sim.phase === 'window' && count(log, 'hit') === 0 && count(log, 'miss') === 0, 'not tracked for 60 s: no hit, no miss, card waits', `time left ${sim.timeLeft.toFixed(1)} s`);
  log = play(sim, () => ({ ...NEUTRAL, stillFor: 9 }), 10);
  check(count(log, 'hit') === 1, 'tracked again and still: hit');
}

console.log('\nBig jumps: 2-3 counted in the window, not on a beat:');
{
  const sim = createTrialsSim({ age: 'big', seed: 9, rounds: [{ cards: ['jump', 'jump', 'jump', 'jump', 'jump', 'jump'] }] });
  const needs = [];
  const log = play(sim, (t, s) => {
    if (s.phase === 'window' && !needs.includes(s.index + ':' + s.card.need)) needs.push(s.index + ':' + s.card.need);
    // Uneven jumps: 0.3 s, then 1.1 s apart.
    return { ...NEUTRAL, jump: s.phase === 'window' && [0.3, 1.4, 1.9].some(x => Math.abs((s.card.window - s.timeLeft) - x) < DT / 2) };
  });
  const ns = needs.map(n => +n.split(':')[1]);
  check(ns.every(n => n === 2 || n === 3) && count(log, 'hit') === 6, 'needs 2 or 3, uneven jumps still hit', `needs ${ns.join(',')}, ${count(log, 'hit')} hits`);
}

console.log('\nLean: Big must lean to the side shown (the child\'s own side):');
{
  const sim = createTrialsSim({ age: 'big', seed: 4, rounds: [{ cards: ['lean', 'lean', 'lean', 'lean'] }] });
  const wrong = play(sim, (t, s) => ({ ...NEUTRAL, lean: s.phase === 'window' ? (s.card.side === 'left' ? 'right' : 'left') : null }));
  check(count(wrong, 'miss') === 4, 'wrong side: all miss');
  const sim2 = createTrialsSim({ age: 'little', seed: 4, rounds: [{ cards: ['lean', 'lean'] }] });
  const either = play(sim2, (t, s) => ({ ...NEUTRAL, lean: s.phase === 'window' ? (s.index % 2 ? 'left' : 'right') : null }));
  check(count(either, 'hit') === 2, 'Little: either side counts');
}

console.log('\nThree misses in a row: double window and a second demo on the next card:');
{
  const sim = createTrialsSim({ age: 'little', seed: 2, rounds: [{ cards: ['jump', 'jump', 'jump', 'jump', 'jump'] }] });
  const windows = [];
  const log = play(sim, (t, s) => {
    if (s.phase === 'window' && windows.length === s.index) windows.push(s.card.window);
    return { ...NEUTRAL, tracking: s.index < 3 ? Math.floor(t * 4) % 3 !== 0 : true }; // weak tracking, no jumps
  });
  const demos = log.filter(e => e.type === 'demo').map(e => e.reps);
  const struggle = log.find(e => e.type === 'struggle');
  check(!!struggle && windows[3] >= windows[1] * 2 - 0.01 && demos[3] === 2, 'struggle after 3 misses, next window doubled, demo x2', `windows ${windows.map(w => w.toFixed(1)).join(', ')}, demos ${demos.join(',')}, trackingPoor ${struggle?.trackingPoor}`);
}

console.log('\nReady gate: arms held up from a reach card do not pass the next star pose:');
{
  const sim = createTrialsSim({ age: 'little', seed: 1, rounds: [{ cards: ['reach', 'pose'] }] });
  const STAR = { ...NEUTRAL, armsUp: true, armsDown: false, pose: 'star' };
  // Force the pose card to be a star.
  const log = play(sim, (t, s) => {
    if (s.index === 1 && s.card.poses) s.card.poses[0] = 'star';
    // Neutral until the reach card's window opens; from then on, arms up the whole time.
    return s.index === 0 && s.phase !== 'window' ? NEUTRAL : STAR;
  }, 30);
  check(sim.index === 1 && sim.phase === 'ready' && count(log, 'hit') === 1, 'reach hit, pose card still waiting for neutral', `phase ${sim.phase}, ${count(log, 'hit')} hits`);
}

console.log('\nA round of 8 (5 active, freeze, choice, dance): tiles, score, stars:');
{
  const rounds = [{ cards: ['jump', 'step', 'reach', 'jump', 'step', 'freeze', 'choice', 'dance'] }];
  const sim = createTrialsSim({ age: 'big', seed: 7, rounds });
  const bot = createTrialsBot(sim, { miss: 0.35, seed: 4 });
  const log = play(sim, () => bot(DT));
  const end = log.find(e => e.type === 'roundEnd');
  const choice = log.find(e => e.type === 'card' && e.index === 6);
  check(!!end && end.tiles.length === 8 && end.tiles[7] === true, 'round ends with its tiles (dance always lit)', `tiles ${end?.tiles.map(x => (x ? '#' : '.')).join('')}, hit rate ${(sim.hitRate * 100).toFixed(0)}%, stars ${sim.starsEarned()}, score ${sim.stats.score}, best combo ${sim.stats.bestCombo}`);
  check(['jump', 'step', 'reach'].includes(choice?.card.type), "Mimi's choice is a type already taught", choice?.card.type);
}

console.log(failed ? `\n${failed} failed` : '\nAll passed');
process.exit(failed ? 1 : 0);
