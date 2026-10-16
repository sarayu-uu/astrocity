// Headless set-piece test: every step type for Little and Big, played by the bot and by scripts
// of a child who is stuck, cheating or out of view. Fails if a step finishes when it shouldn't,
// or doesn't when it should.
//
//   node tools/test-set-piece.mjs

import { pathToFileURL, fileURLToPath } from 'url';
import { dirname, join } from 'path';

const here = dirname(fileURLToPath(import.meta.url));
const { createSetPieceSim, createSetPieceBot, HELP } = await import(pathToFileURL(join(here, '../js/activities/set-piece-sim.js')).href);

const DT = 1 / 60;
let failed = 0;
const check = (ok, name, detail = '') => {
  if (!ok) failed++;
  console.log(`${ok ? 'PASS' : 'FAIL'}  ${name}${detail ? `  (${detail})` : ''}`);
};

const NEUTRAL = { zone: 'center', armsUp: false, armsDown: true, pose: null, duck: false, tracking: true, jump: false };
const STAR = { ...NEUTRAL, armsUp: true, armsDown: false, pose: 'star' };

// Plays `sim` with `inputAt(t, sim)` for up to `seconds`; returns the events with their times.
function play(sim, inputAt, seconds) {
  const log = [];
  for (let t = 0; t < seconds && sim.phase !== 'done'; t += DT) {
    sim.update(inputAt(t, sim), DT);
    for (const e of sim.events) log.push({ t, ...e });
    sim.events.length = 0;
  }
  return log;
}
const at = (log, type) => log.find(e => e.type === type)?.t;

const STEPS = {
  jump: { move: 'jump', times: { little: 3, big: 5 } },
  armsUp: { move: 'armsUp', hold: { little: 1.4, big: 1.4 } },
  step: { move: 'step', sequence: { little: ['left', 'right'], big: ['left', 'right', 'left'] }, hold: 0.6 },
  pump: { move: 'pump', times: { little: 5, big: 8 } },
  pose: { move: 'pose', sequence: { little: ['star'], big: ['star', 'bridge', 'moon'] }, hold: { little: 0.8, big: 1.3 } },
  tilt: { move: 'tilt', sequence: { little: ['left', 'right'], big: ['left', 'right', 'left', 'right'] }, hold: 0.8 },
};

console.log('Each step type, played by the bot:');
for (const age of ['little', 'big']) {
  for (const [name, step] of Object.entries(STEPS)) {
    const sim = createSetPieceSim({ steps: [step], age });
    const bot = createSetPieceBot(sim);
    const log = play(sim, () => bot(DT), 60);
    const counts = log.filter(e => e.type === 'count').map(e => e.n);
    const rising = counts.every((n, i) => i === 0 || n > counts[i - 1]);
    check(sim.phase === 'done' && rising && counts.length > 0, `${age.padEnd(6)} ${name.padEnd(7)} done in ${at(log, 'done')?.toFixed(1)} s`, `${counts.length} count sounds${rising ? ', rising' : ', NOT rising'}`);
  }
}

console.log('\nNothing finishes without the move (child stands still for 2 minutes):');
for (const [name, step] of Object.entries(STEPS)) {
  const sim = createSetPieceSim({ steps: [step], age: 'big' });
  const log = play(sim, () => NEUTRAL, 120);
  const eases = log.filter(e => e.type === 'ease').length;
  const demo = at(log, 'demo'), ease = at(log, 'ease');
  check(sim.phase === 'move' && Math.abs(demo - (0.6 + HELP.demo)) < 0.1 && Math.abs(ease - (0.6 + HELP.ease)) < 0.1,
    `big    ${name.padEnd(7)} still waiting`, `demo at ${demo?.toFixed(1)} s, first ease at ${ease?.toFixed(1)} s, ${eases} eases, progress ${sim.progress.toFixed(2)}`);
}

console.log('\nHalving what is left (jump x5, stuck): 5 -> 3 -> 2 -> 1, never 0:');
{
  const sim = createSetPieceSim({ steps: [STEPS.jump], age: 'big' });
  const needs = [sim.need];
  for (let t = 0; t < 130; t += DT) {
    sim.update(NEUTRAL, DT);
    if (sim.events.some(e => e.type === 'go')) needs[0] = sim.need;
    if (sim.events.some(e => e.type === 'ease')) needs.push(sim.need);
    sim.events.length = 0;
  }
  check(needs.join(' ') === '5 3 2 1 1 1' && sim.phase === 'move', 'stuck on 5 jumps', `need: ${needs.join(' -> ')}`);
  sim.update({ ...NEUTRAL, jump: true }, DT);
  check(sim.phase === 'done', 'then one jump finishes it');
}

console.log('\nNeutral gate:');
{
  // Arms up held through: the armsUp step finishes, the star step must NOT.
  const sim = createSetPieceSim({ steps: [{ move: 'armsUp', hold: 1 }, { move: 'pose', sequence: ['star'], hold: 0.8 }] });
  let log = play(sim, t => (t < 0.7 ? NEUTRAL : STAR), 60);
  const first = log.find(e => e.type === 'stepDone');
  check(first?.index === 0 && sim.index === 1 && sim.phase === 'ready', 'arms held up: armsUp done, star step still waiting for neutral', `after 60 s: step ${sim.index}, ${sim.phase}`);
  // Arms down for a moment, then the star counts.
  log = play(sim, t => (t < 0.7 ? NEUTRAL : STAR), 10);
  check(sim.phase === 'done', 'arms down, then star: star step done', `done ${at(log, 'done')?.toFixed(2)} s after letting go`);
}
{
  // Half a pump carried over: arms up at the end of a jump step must not start the pumps half-way.
  // Without the gate, arms up during "Ready…" would latch the up half, and arms down would
  // count a whole pump.
  const sim = createSetPieceSim({ steps: [{ move: 'jump', times: 1 }, { move: 'pump', times: 1 }] });
  const log = play(sim, t => (t < 0.7 ? NEUTRAL : t < 0.72 ? { ...NEUTRAL, jump: true } : t < 3 ? STAR : NEUTRAL), 6);
  const pumpCounts = log.filter(e => e.type === 'count' && e.step.move === 'pump').length;
  check(sim.phase === 'move' && sim.index === 1 && pumpCounts === 0, 'arms up carried into a pump step: no half pump counted', `step ${sim.index}, ${sim.phase}, ${pumpCounts} pumps`);
}
{
  // Jumps while getting ready are thrown away.
  const sim = createSetPieceSim({ steps: [{ move: 'jump', times: 2 }] });
  const log = play(sim, (t) => ({ ...NEUTRAL, jump: Math.round(t / DT) % 5 === 0 && t < 0.55 }), 0.7);
  check(sim.phase === 'move' && !log.some(e => e.type === 'count'), 'jumps during "Ready…" do not count');
}

console.log('\nPoor tracking at 25 s: "Poppy can\'t see you", not halving:');
{
  const sim = createSetPieceSim({ steps: [STEPS.pump], age: 'big' });
  const log = play(sim, t => ({ ...NEUTRAL, tracking: Math.floor(t * 10) % 2 === 0 }), 30);
  check(at(log, 'cantSee') !== undefined && at(log, 'ease') === undefined, 'flickering tracking: cantSee, no ease', `cantSee at ${at(log, 'cantSee')?.toFixed(1)} s`);
}

console.log('\nProgress resets the help clock:');
{
  // A jump every 10 s: never 12 s without progress, so no demo.
  const sim = createSetPieceSim({ steps: [{ move: 'jump', times: 4 }] });
  const log = play(sim, t => ({ ...NEUTRAL, jump: t > 1 && Math.round(t / DT) % 600 === 0 }), 45);
  check(sim.phase === 'done' && !log.some(e => e.type === 'demo'), 'slow but steady: no demo, finishes', `done at ${at(log, 'done')?.toFixed(1)} s`);
}
{
  // Holding the pose half-way again and again is not progress: help still comes.
  const sim = createSetPieceSim({ steps: [{ move: 'pose', sequence: ['star'], hold: 2 }] });
  const log = play(sim, t => (t > 1 && t % 3 < 0.8 ? STAR : NEUTRAL), 30);
  check(at(log, 'demo') !== undefined, 'the same half hold over and over: a demo still comes', `demo at ${at(log, 'demo')?.toFixed(1)} s`);
}

console.log('\nStep sequence needs the middle between sides:');
{
  const sim = createSetPieceSim({ steps: [{ move: 'step', sequence: ['left', 'right'], hold: 0.6 }] });
  // Left, then straight across to the right without lingering in the middle (it still has to pass it).
  play(sim, t => ({ ...NEUTRAL, zone: t < 0.7 ? 'center' : t < 1.6 ? 'left' : 'right' }), 4);
  check(sim.phase === 'move', 'skipping the middle: right does not count');
  play(sim, t => ({ ...NEUTRAL, zone: t < 0.5 ? 'center' : 'right' }), 4);
  check(sim.phase === 'done', 'middle, then right: done');
}

console.log('\nTilt (wings): the side counts, the other side and level wings do not:');
{
  const WINGS = tilt => ({ ...NEUTRAL, armsDown: false, wingsOut: true, wingsTilt: tilt });
  let sim = createSetPieceSim({ steps: [{ move: 'tilt', sequence: ['right'], hold: 0.8 }] });
  play(sim, t => (t < 0.7 ? WINGS(0) : WINGS(-1)), 20);
  check(sim.phase === 'move', 'wings tilted left do not count for "right"');
  sim = createSetPieceSim({ steps: [{ move: 'tilt', sequence: ['right'], hold: 0.8 }] });
  play(sim, t => (t < 0.7 ? WINGS(0) : WINGS(0.2)), 20);
  check(sim.phase === 'move', 'a small wobble (0.2) does not count');
  sim = createSetPieceSim({ steps: [{ move: 'tilt', sequence: ['right'], hold: 0.8 }] });
  play(sim, t => (t < 0.7 ? WINGS(0) : WINGS(0.8)), 20);
  check(sim.phase === 'done', 'wings tilted right count, arms staying out between steps is fine');
  // Arms out wide but level is "ready" for a tilt step (it would block every other step).
  sim = createSetPieceSim({ steps: [{ move: 'pump', times: 1 }, { move: 'tilt', sequence: ['left'], hold: 0.5 }] });
  play(sim, t => (t < 0.7 ? NEUTRAL : t < 1.4 ? { ...NEUTRAL, armsUp: true, armsDown: false } : t < 1.6 ? NEUTRAL : t < 2.6 ? WINGS(0) : WINGS(-1)), 20);
  check(sim.phase === 'done', 'level wings pass "Ready" for a tilt step');
}

console.log('\nSkip: finishAll() ends every step:');
{
  const sim = createSetPieceSim({ steps: Object.values(STEPS) });
  sim.update(NEUTRAL, DT);
  sim.events.length = 0;
  sim.finishAll();
  const n = Object.keys(STEPS).length;
  check(sim.phase === 'done' && sim.events.filter(e => e.type === 'stepDone').length === n, `all ${n} steps done`);
}

console.log(failed ? `\n${failed} failed` : '\nAll passed');
process.exit(failed ? 1 : 0);
