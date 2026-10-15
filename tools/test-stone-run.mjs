// Headless test of Chapter 1's Star Stone Run with its real config: the camera-speed bot plays
// the runner for Little and Big, the set-piece bot plays each bridge (reacting like a child
// on camera), and story beats are counted at their written length. Reports each leg's time
// and the total; fails on any stumble, a leg outside 50-90 s, or a total over 8 minutes.
//
//   node tools/test-stone-run.mjs

import { pathToFileURL, fileURLToPath } from 'url';
import { dirname, join } from 'path';

const here = dirname(fileURLToPath(import.meta.url));
globalThis.window = {};
const load = f => import(pathToFileURL(join(here, '..', f)).href);
const { createRunSim, createBot, STEP } = await load('js/activities/runner-sim.js');
const { createSetPieceSim, createSetPieceBot } = await load('js/activities/set-piece-sim.js');
const { ACTIVITIES } = await load('js/chapters/ch01-first-starway/activities.js');
const { LINES } = await load('js/chapters/ch01-first-starway/lines.js');

const run = ACTIVITIES.starStoneRun;
const R = LINES.starStoneRun;
const autoTime = lines => lines.reduce((s, l) => s + (l[2]?.auto ?? 3), 0);
// Story time around the run, from the written lines and the fixed beats.
const SHOT = 2 * 1.0, CHEER = 2, AFTER = { bridge1: 2.2, bridge2: 2.2, lastBridge: 0.8 };
const START = Math.max(autoTime(R.start), 7);
const END = 1.4 + 1.8 + autoTime([R.found, R.drift]);
let failed = 0;
const totals = { expert: [], child: [] };

// "expert" plays perfectly; "child" reacts later and moves slower on the bridges (2.5 s to
// start each move, jumps and pumps 2.5 times slower), closer to a young child on camera.
for (const [who, piecePlay] of [['expert', { delay: 1.0, pace: 1 }], ['child', { delay: 2.5, pace: 2.5 }]]) {
console.log(`\n${who}:`);
for (const age of ['little', 'big']) {
  for (const seed of [1, 2, 3]) {
    const tune = { ...run.tune?.all, ...run.tune?.[age] };
    const sim = createRunSim({ age, play: 'camera', seed, speed: tune.speed, legs: run.legs, patterns: run.patterns, breatherEvery: tune.breatherEvery });
    const bot = createBot(sim, { age, play: 'camera', seed });
    const legTimes = [];
    let legT = 0, pieces = 0, breathers = 0, hits = [], teachEnd = null;
    for (let t = 0; t < 900 && !sim.goalReached; t += STEP) {
      sim.step(bot());
      legT += STEP;
      for (const e of sim.events) {
        if (e.type === 'hit') hits.push(`${e.obj.kind}@leg${sim.leg}`);
        if (e.type === 'breather') breathers += 5;
        if (e.type === 'teachDone') teachEnd = legT;
        if (e.type === 'legEnd') {
          legTimes.push(legT);
          legT = 0;
          const name = sim.legDef(e.leg).setPiece;
          if (name) pieces += playPiece(run.setPieces[name], age, piecePlay) + SHOT + CHEER + AFTER[name] + autoTime(run.setPieces[name].intro ?? []);
        }
      }
      sim.events.length = 0;
    }
    const runTime = legTimes.reduce((s, x) => s + x, 0);
    const total = START + runTime + pieces + breathers + END;
    const legsOk = legTimes.slice(1).every(x => x >= 50 && x <= 90);
    const ok = sim.goalReached && !hits.length && legsOk && total <= 8 * 60;
    totals[who].push(total);
    if (!ok) failed++;
    console.log(`${ok ? 'PASS' : 'FAIL'}  ${age.padEnd(6)} seed ${seed}  teach ${legTimes[0].toFixed(0)} s${teachEnd ? '' : ' (timed out)'}, legs ${legTimes.slice(1).map(x => x.toFixed(0)).join(' / ')} s, bridges ${pieces.toFixed(0)} s, rests ${breathers} s, story ${(START + END).toFixed(0)} s  =>  total ${(total / 60).toFixed(1)} min${hits.length ? `  hits: ${hits.join(', ')}` : ''}${legsOk ? '' : '  (a leg is outside 50-90 s)'}`);
  }
}
}
const range = list => `${(Math.min(...list) / 60).toFixed(1)}-${(Math.max(...list) / 60).toFixed(1)} min`;
console.log(`\nTotals: expert ${range(totals.expert)}, child ${range(totals.child)} (target 6-8 min for a child)`);

// One bridge played by the set-piece bot.
function playPiece(piece, age, play) {
  const sim = createSetPieceSim({ steps: piece.steps, age });
  const bot = createSetPieceBot(sim, play);
  let t = 0;
  while (sim.phase !== 'done' && t < 120) {
    sim.update(bot(STEP), STEP);
    sim.events.length = 0;
    t += STEP;
  }
  return t;
}

console.log(failed ? `\n${failed} failed` : '\nAll passed');
process.exit(failed ? 1 : 0);
