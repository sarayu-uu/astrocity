// Headless runner test: every built-in pattern, for Little and Big, at the fastest speed the
// game can reach (leg max after adaptive bumps), played by the autoplay bot moving between
// lanes as slowly as a child does on camera. Fails if any obstacle can't be cleared.
//
//   node tools/test-runner.mjs
//
// Later, recordings from the ?debug panel can drive the runner instead of the bot: build the
// input each step from a MotionInput in replay mode (see inputFromMotion in runner.js).

import { pathToFileURL, fileURLToPath } from 'url';
import { dirname, join } from 'path';

const here = dirname(fileURLToPath(import.meta.url));
const load = f => import(pathToFileURL(join(here, '../js/activities', f)).href);
const { createRunSim, createBot, STEP } = await load('runner-sim.js');
const { PATTERNS, isObstacle } = await load('runner-patterns.js');

const SPEED = { little: { start: 9, max: 12.5 }, big: { start: 12, max: 18 } };
const ADAPT_MAX = 1.25;
let failed = 0;

function play(config, seconds, { seed = 1 } = {}) {
  const sim = createRunSim(config);
  const bot = createBot(sim, { age: config.age, play: config.play, seed });
  const hits = [];
  let cleared = 0;
  for (let t = 0; t < seconds; t += STEP) {
    sim.step(bot());
    for (const e of sim.events) {
      if (e.type === 'hit') hits.push(`${e.obj.kind}@${e.obj.D.toFixed(0)} (${e.obj.pattern})`);
      if (e.type === 'clear') cleared++;
    }
    sim.events.length = 0;
    if (sim.goalReached && !sim.endless) break;
  }
  return { sim, hits, cleared };
}

console.log('Every pattern, at the fastest reachable speed, camera lane-change times:');
// Patterns with heights, rings or gusts run in fly mode, at the flying speeds.
const FLY_KINDS = ['spark', 'ring', 'rock', 'arch', 'gust'];
const FLY_SPEED = { little: { start: 7.5, max: 11 }, big: { start: 10, max: 16 } };
for (const age of ['little', 'big']) {
  for (const name of Object.keys(PATTERNS)) {
    const fly = PATTERNS[name].items.some(i => FLY_KINDS.includes(i.kind));
    const speed = fly ? FLY_SPEED[age] : SPEED[age];
    const fast = speed.max * ADAPT_MAX;
    const { hits, cleared } = play({
      age, play: 'camera', seed: 3, speed, forceSpeed: fast, adaptive: false, mode: fly ? 'fly' : undefined,
      legs: [{ length: fast * 60, patterns: [name] }],
    }, 70);
    const hasObstacles = PATTERNS[name].items.some(i => isObstacle(i.kind));
    const ok = !hits.length && (!hasObstacles || cleared > 0);
    if (!ok) failed++;
    console.log(`${ok ? 'PASS' : 'FAIL'}  ${age.padEnd(6)} ${name.padEnd(14)} cleared ${String(cleared).padStart(3)}  ${hits.length ? 'hits: ' + hits.slice(0, 4).join(', ') : ''}`);
  }
}

console.log('\nPilot mode (steer with wings), every lane pattern at the fastest speed, steered like a child on camera:');
const PILOT_SPEED = { little: { start: 9.5, max: 13.5 }, big: { start: 12.5, max: 19 } };
const PILOT = ['spark-line', 'spark-weave', 'storm', 'storm-sparks', 'ring', 'storm-ring', 'storm-wall', 'zigzag', 'slalom', 'ring-chain', 'puff-buns', 'star-stone'];
for (const age of ['little', 'big']) {
  for (const name of PILOT) {
    const fast = PILOT_SPEED[age].max * ADAPT_MAX;
    const { hits, cleared } = play({
      age, play: 'camera', seed: 3, speed: PILOT_SPEED[age], forceSpeed: fast, adaptive: false, mode: 'pilot',
      legs: [{ length: fast * 60, patterns: [name] }],
    }, 70);
    const hasObstacles = PATTERNS[name].items.some(i => isObstacle(i.kind));
    const ok = !hits.length && (!hasObstacles || cleared > 0);
    if (!ok) failed++;
    console.log(`${ok ? 'PASS' : 'FAIL'}  ${age.padEnd(6)} ${name.padEnd(14)} cleared ${String(cleared).padStart(3)}  ${hits.length ? 'hits: ' + hits.slice(0, 4).join(', ') : ''}`);
  }
}

console.log('\nA whole three-leg run per age (adaptive on, mixed patterns):');
for (const age of ['little', 'big']) {
  for (const seed of [1, 2, 3]) {
    const { sim, hits, cleared } = play({
      age, play: 'camera', seed, speed: SPEED[age], breatherEvery: age === 'little' ? 180 : 240,
      legs: [
        { length: 260, theme: 'mint', patterns: ['bun-line', 'puff', 'gap', 'gap-buns', 'puff-buns'] },
        { length: 300, theme: 'lilac', patterns: ['branch', 'wobble', 'puff-gap', 'bun-arc', 'sunk'] },
        { length: 340, theme: 'peach', patterns: ['wall-jump', 'sunk', 'branch-wobble', 'star-stone', 'zigzag', 'double-gap'] },
      ],
    }, 600, { seed });
    const ok = !hits.length && sim.goalReached;
    if (!ok) failed++;
    console.log(`${ok ? 'PASS' : 'FAIL'}  ${age.padEnd(6)} seed ${seed}  ${sim.t.toFixed(0)} s, ${cleared} cleared, buns ${sim.stats.buns}/${sim.stats.bunsSeen}, stars ${sim.starsEarned()}, tier ${sim.tier}, speed x${sim.speedMul.toFixed(2)}${hits.length ? '  hits: ' + hits.join(', ') : ''}`);
  }
}

console.log(failed ? `\n${failed} FAILED` : '\nAll passed');
process.exit(failed ? 1 : 0);
