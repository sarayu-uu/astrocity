// Headless test of Chapter 1's movement games with their real config (the Star Stone Run and
// Sky Power): the camera-speed bot plays the runner for Little and Big, the set-piece bot plays
// each bridge or moment, and story beats are counted at their written length. Reports each
// leg's time and the total; fails on any stumble, a leg more than 20% off its target, or a
// total over 8 minutes.
//
//   node tools/test-games.mjs                         both games
//   node tools/test-games.mjs --game skyPower         one game
//   node tools/test-games.mjs --legSeconds 95         try a longer leg time

import { pathToFileURL, fileURLToPath } from 'url';
import { dirname, join } from 'path';

const here = dirname(fileURLToPath(import.meta.url));
globalThis.window = {};
const load = f => import(pathToFileURL(join(here, '..', f)).href);
const { createRunSim, createBot, STEP } = await load('js/activities/runner-sim.js');
const { createSetPieceSim, createSetPieceBot } = await load('js/activities/set-piece-sim.js');
const { createTrialsSim, createTrialsBot } = await load('js/activities/trials-sim.js');
const { ACTIVITIES } = await load('js/chapters/ch01-first-starway/activities.js');
const { LINES } = await load('js/chapters/ch01-first-starway/lines.js');

const autoTime = lines => lines.reduce((s, l) => s + (l[2]?.auto ?? 3), 0);
const R = LINES.starStoneRun, P = LINES.skyPower;
// Story time around each run, from the written lines and the fixed beats (camera moves, hops).
const GAMES = {
  starStoneRun: { start: Math.max(autoTime(R.start), 7), end: 1.4 + 1.8 + autoTime([R.found, R.drift]), after: { bridge1: 2.2, bridge2: 2.2, lastBridge: 0.8 } },
  skyPower: { start: Math.max(autoTime(P.start), 3.2), end: 2.4 + autoTime([P.fire]), after: {} },
  skyPilot: { start: Math.max(autoTime(LINES.skyPilot.start), 3.2), end: 2.4 + autoTime([P.fire]), after: {} },
};
const SHOT = 2 * 1.0, CHEER = 2;

const arg = name => {
  const i = process.argv.indexOf(name);
  return i > 0 ? process.argv[i + 1] : null;
};
const LEG_SECONDS = arg('--legSeconds') ? Number(arg('--legSeconds')) : null;
const only = arg('--game');
if (LEG_SECONDS) console.log(`Trying legSeconds = ${LEG_SECONDS}`);
let failed = 0;

// ---- Gate Trials (cards, not a runner) -----------------------------------------------------
const GT = LINES.gateTrials;
function trialsLengths() {
  const run = ACTIVITIES.gateTrials;
  const totals = { expert: [], child: [] };
  const start = autoTime(GT.start), end = 1.2 + autoTime([GT.awake]);
  console.log(`\n==== ${run.label} ====`);
  // "expert" copies each card 0.5 s into its window; "child" takes 1.5 s, moves 2x slower and
  // misses about 1 card in 6 (which brings help after 3 misses in a row now and then).
  for (const [who, play] of [['expert', { delay: 0.5, pace: 1, miss: 0 }], ['child', { delay: 1.5, pace: 2, miss: 0.17 }]]) {
    console.log(`${who}:`);
    for (const age of ['little', 'big']) {
      for (const seed of [1, 2, 3]) {
        const tune = { ...run.tune?.all, ...run.tune?.[age] };
        const sim = createTrialsSim({ age, seed, rounds: run.rounds, tune: tune.cards, windowScale: run.windowScale });
        const bot = createTrialsBot(sim, { ...play, seed });
        const roundTimes = [], lockTimes = [];
        let t = 0, roundT = 0, celebrate = 0;
        while (sim.phase !== 'done' && t < 1200) {
          sim.update(bot(STEP), STEP);
          t += STEP;
          roundT += STEP;
          for (const e of sim.events) {
            if (e.type !== 'roundEnd') continue;
            roundTimes.push(roundT);
            roundT = 0;
            celebrate += e.tiles.filter(x => !x).length * 0.12 + 2.0; // dark tiles light, ring wakes
            const lock = run.locks[e.round];
            const gag = lock.steps.some(s => s.after) ? autoTime([GT.lockMoon.oops, GT.lockMoon.laugh]) : 0;
            lockTimes.push(playPiece(lock, age, { delay: play.delay * 2, pace: play.pace }) + SHOT + CHEER + 1.2 + gag + autoTime(lock.intro ?? []));
          }
          sim.events.length = 0;
          if (sim.phase === 'roundEnd') sim.nextRound();
        }
        const total = start + roundTimes.reduce((s, x) => s + x, 0) + celebrate + lockTimes.reduce((s, x) => s + x, 0) + end;
        const ok = sim.phase === 'done' && total <= 9 * 60;
        totals[who].push(total);
        if (!ok) failed++;
        console.log(`${ok ? 'PASS' : 'FAIL'}  ${age.padEnd(6)} seed ${seed}  rounds ${roundTimes.map(x => x.toFixed(0)).join(' / ')} s, locks ${lockTimes.map(x => x.toFixed(0)).join(' / ')} s, cards ${sim.stats.hits}/${sim.judged} (${(sim.hitRate * 100).toFixed(0)}%), stars ${sim.starsEarned()}  =>  ${(total / 60).toFixed(1)} min`);
      }
    }
  }
  const range = list => `${(Math.min(...list) / 60).toFixed(1)}-${(Math.max(...list) / 60).toFixed(1)} min`;
  console.log(`Totals: expert ${range(totals.expert)}, child ${range(totals.child)} (target 6-9 min)`);
}

for (const [key, story] of Object.entries(GAMES)) {
  if (only && only !== key) continue;
  const run = ACTIVITIES[key];
  const totals = { expert: [], child: [] };
  console.log(`\n==== ${run.label} ====`);
  // "expert" plays perfectly; "child" reacts later and moves slower in the set pieces (2.5 s to
  // start each move, jumps and pumps 2.5 times slower), closer to a young child on camera.
  for (const [who, piecePlay] of [['expert', { delay: 1.0, pace: 1 }], ['child', { delay: 2.5, pace: 2.5 }]]) {
    console.log(`${who}:`);
    for (const age of ['little', 'big']) {
      for (const seed of [1, 2, 3]) {
        const tune = { ...run.tune?.all, ...run.tune?.[age] };
        if (LEG_SECONDS) tune.legSeconds = LEG_SECONDS;
        const sim = createRunSim({ age, play: 'camera', seed, mode: run.mode, steer: tune.steer, speed: tune.speed, legs: run.legs, legSeconds: tune.legSeconds, patterns: run.patterns, breatherEvery: tune.breatherEvery });
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
              if (name) pieces += playPiece(run.setPieces[name], age, piecePlay) + SHOT + CHEER + (story.after[name] ?? 0) + autoTime(run.setPieces[name].intro ?? []);
            }
          }
          sim.events.length = 0;
        }
        const runTime = legTimes.reduce((s, x) => s + x, 0);
        const total = story.start + runTime + pieces + breathers + story.end;
        // Each leg within about 20% of its target time.
        const legsOk = legTimes.slice(1).every(x => x >= tune.legSeconds * 0.8 && x <= tune.legSeconds * 1.2);
        const ok = sim.goalReached && !hits.length && legsOk && total <= 8 * 60;
        totals[who].push(total);
        if (!ok) failed++;
        const caught = run.mode ? `sparks ${sim.stats.buns}/${sim.stats.bunsSeen}` : `buns ${sim.stats.buns}/${sim.stats.bunsSeen}`;
        console.log(`${ok ? 'PASS' : 'FAIL'}  ${age.padEnd(6)} seed ${seed}  teach ${legTimes[0].toFixed(0)} s${teachEnd ? '' : ' (timed out)'}, legs ${legTimes.slice(1).map(x => x.toFixed(0)).join(' / ')} s, set pieces ${pieces.toFixed(0)} s, rests ${breathers} s, story ${(story.start + story.end).toFixed(0)} s, ${caught}  =>  ${(total / 60).toFixed(1)} min${hits.length ? `  hits: ${hits.join(', ')}` : ''}${legsOk ? '' : '  (a leg is more than 20% off its target)'}`);
      }
    }
  }
  const range = list => `${(Math.min(...list) / 60).toFixed(1)}-${(Math.max(...list) / 60).toFixed(1)} min`;
  console.log(`Totals: expert ${range(totals.expert)}, child ${range(totals.child)} (target 6-8 min for a child)`);
}

if (!only || only === 'gateTrials') trialsLengths();

// One set piece played by the set-piece bot.
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
