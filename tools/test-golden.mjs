// Golden test for the four original activity engines (hop-stones, side-step, arm-pump,
// pose-match). Scripted input runs through each one, for Little and Big, against a fake world
// that writes down everything the engine does, frame by frame. The log is compared with the one
// saved in tools/golden/old-engines.json, so a refactor that changes behaviour shows up.
//
//   node tools/test-golden.mjs            compare with the saved results
//   node tools/test-golden.mjs --update   save the current results as the new golden file

import { pathToFileURL, fileURLToPath } from 'url';
import { dirname, join } from 'path';
import { readFileSync, writeFileSync, mkdirSync, existsSync } from 'fs';

const here = dirname(fileURLToPath(import.meta.url));
const GOLDEN = join(here, 'golden', 'old-engines.json');
const DT = 1 / 60;
const MAX_FRAMES = 60 * 120;

// ---- A silent browser: Web Audio and the clock ----------------------------------------------
const silent = new Proxy(function () {}, {
  get: (t, k) => (k === Symbol.toPrimitive ? () => 0 : k === 'state' ? 'running' : silent),
  set: () => true,
  apply: () => silent,
  construct: () => silent,
});
globalThis.window = { AudioContext: silent };
let clockMs = 0;
Object.defineProperty(globalThis, 'performance', { value: { now: () => clockMs }, configurable: true });

const load = f => import(pathToFileURL(join(here, '..', f)).href);
const { createGame } = await load('js/core/game.js');
const { ACTIVITIES } = await load('js/chapters/ch01-first-starway/activities.js');
const engines = {
  'hop-stones': (await load('js/activities/hop-stones.js')).default,
  'side-step': (await load('js/activities/side-step.js')).default,
  'arm-pump': (await load('js/activities/arm-pump.js')).default,
  'pose-match': (await load('js/activities/pose-match.js')).default,
};

const r = (v, d = 4) => Math.round(v * 10 ** d) / 10 ** d;

class Vec {
  constructor(x = 0, y = 0, z = 0) { this.x = x; this.y = y; this.z = z; }
  clone() { return new Vec(this.x, this.y, this.z); }
  copy(v) { this.x = v.x; this.y = v.y; this.z = v.z; return this; }
  set(x, y, z) { this.x = x; this.y = y; this.z = z; return this; }
  toString() { return `${r(this.x, 3)},${r(this.y, 3)},${r(this.z, 3)}`; }
}

// One run of one engine: a fresh fake world, input and log.
async function runCase(engineName, activity, age, script) {
  const log = [];
  let frame = 0;
  const say = s => log.push(`${frame} ${s}`);
  const timers = []; // { frames, resolve } for walks and hops

  const buddy = kind => {
    const b = {
      kind, color: '#fff', root: { position: new Vec() },
      place(x, z, y = 0) { this.root.position.set(x, y, z); say(`${kind}.place ${this.root.position}`); return this; },
      faceNow(x, z) { say(`${kind}.face ${r(x, 2)},${r(z, 2)}`); },
      walkTo(x, z) { say(`${kind}.walk ${r(x, 2)},${r(z, 2)}`); return new Promise(res => timers.push({ frames: 30, resolve: () => { this.root.position.set(x, 0, z); res(); } })); },
      hop(to, height, duration) {
        say(`${kind}.hop h${height} d${duration}`);
        return new Promise(res => timers.push({ frames: Math.round(duration * 60), resolve: () => { this.root.position.copy(typeof to === 'function' ? to() : to); say(`${kind}.landed ${this.root.position}`); res(); } }));
      },
    };
    let state = 'idle', pose = null;
    Object.defineProperty(b, 'state', { get: () => state, set: v => { state = v; say(`${kind}.state=${v}`); } });
    Object.defineProperty(b, 'pose', { get: () => pose, set: v => { pose = v; say(`${kind}.pose=${v}`); } });
    return b;
  };
  const B = { poppy: buddy('poppy'), nutty: buddy('nutty'), lumi: buddy('lumi'), mimi: buddy('mimi'), zuzu: buddy('zuzu') };

  const input = {
    camera: true, mode: 'camera', tracking: true, zone: 'center', armsUp: false, armsDown: true, pose: null, duck: false, _jump: false,
    consumeJump() { const j = this._jump; this._jump = false; return j; },
  };
  const ui = {
    coach: (m, t, s) => say(`coach ${m} | ${t} | ${s}`),
    setCoachProgress: k => say(`ring ${r(k)}`),
    bark: (b, t, d) => say(`bark ${b.kind}: ${t} ${d}`),
    arrow: s => say(`arrow ${s}`),
    flush() {},
  };
  // side-step mutates ui.preview.target, so keep a real object and log changes to it.
  let previewObj = null;
  Object.defineProperty(ui, 'preview', {
    get: () => previewObj,
    set: p => {
      say(`preview ${JSON.stringify(p)}`);
      previewObj = p && new Proxy(p, { set: (o, k, v) => { o[k] = v; say(`preview.${String(k)}=${v}`); return true; } });
    },
  });
  const rig = {
    followWith: (fn, d) => say(`rig.follow ${d} ${JSON.stringify(fn())}`),
    go: (p, l, d) => { say(`rig.go ${p} ${l} ${d}`); return g.wait(d); },
  };
  const g = createGame({ scene: null, camera: null, W: {}, B, input, ui, rig });

  // Fake world objects, per engine.
  const a = { ...activity, tune: { ...activity.tune?.all, ...activity.tune?.[age] } };
  if (engineName === 'hop-stones') {
    const stones = [0, 1, 2, 3, 4].map(() => ({ userData: {} }));
    const bridge = {
      stones, start: new Vec(-3, 0, 0), landing: new Vec(4, 0.5, 0),
      top: i => new Vec(-2 + i * 1.2, 0.6, 0),
      // Lined up for 0.75 s of every 1.5 s.
      aligned: () => frame % 90 < 45,
      highlight: (i, on) => { if (bridge._h !== `${i}${on}`) say(`highlight ${i} ${on}`); bridge._h = `${i}${on}`; },
    };
    let lastRaise = '';
    Object.defineProperty(bridge, 'drift', { set: v => say(`drift ${v}`), get: () => 0 });
    a.stones = () => bridge;
    a._after = () => {
      const s = stones.map(st => `${st.userData.sunk ? 'S' : '-'}${r(st.userData.raise ?? 0, 3)}`).join(' ');
      if (s !== lastRaise) say(`stones ${s}`);
      lastRaise = s;
    };
  } else if (engineName === 'side-step') {
    let last = null;
    a.target = () => ({ aim: k => { const v = r(k); if (v !== last) say(`aim ${v}`); last = v; } });
  } else if (engineName === 'arm-pump') {
    a.machine = () => ({ kick: () => say('kick'), setCharge: k => say(`charge ${r(k)}`) });
  } else if (engineName === 'pose-match') {
    const glyphs = ['star', 'bridge', 'moon'];
    a.lock = () => ({ glyphs, setGlyph: (i, k) => { if (k >= 3) say(`glyph ${i} done`); } });
  }

  const engine = engines[engineName];
  let done = false;
  script(0, input);
  engine.run(g, a).then(() => { done = true; say('done'); });
  await new Promise(res => setImmediate(res));
  for (frame = 1; frame <= MAX_FRAMES && !done; frame++) {
    clockMs = frame * DT * 1000;
    script(frame * DT, input);
    for (const t of timers.splice(0)) {
      if (--t.frames <= 0) t.resolve();
      else timers.push(t);
    }
    g.tick(DT);
    await new Promise(res => setImmediate(res));
    a._after?.();
  }
  if (!done) say('NOT DONE');
  return log;
}

// ---- Scripts: what the child does over time -----------------------------------------------
const between = (t, a, b) => t >= a && t < b;
const SCRIPTS = {
  // Jump every 0.7 s (some early, some lined up); reach up on and off for the sunk stone.
  'hop-stones': (t, inp) => {
    if (Math.round(t * 60) % 42 === 0 && t > 0) inp._jump = true;
    inp.armsUp = between(t, 5, 5.6) || between(t, 6, 6.3) || between(t, 7, 9.5) || between(t, 14, 17);
    inp.armsDown = !inp.armsUp;
  },
  // Wander: right a bit, left, middle, right, with some short visits.
  'side-step': (t, inp) => {
    const c = t % 6;
    inp.zone = c < 0.4 ? 'right' : c < 1.0 ? 'center' : c < 2.4 ? 'left' : c < 2.6 ? 'center' : c < 2.9 ? 'right' : c < 3.4 ? 'center' : c < 5.2 ? 'right' : 'center';
  },
  // Pumps, with a few half-pumps (arms up then out, never down) mixed in.
  'arm-pump': (t, inp) => {
    const c = t % 1.6;
    inp.armsUp = c < 0.4 || between(c, 0.9, 1.1);
    inp.armsDown = between(c, 0.6, 0.85) || c >= 1.35;
  },
  // Poses held for different lengths, with wobbles out of the pose.
  'pose-match': (t, inp) => {
    const c = t % 9;
    inp.pose = c < 0.5 ? 'star' : c < 0.7 ? null : c < 2.2 ? 'star' : c < 3 ? 'bridge' : c < 3.2 ? null : c < 5 ? 'bridge' : c < 5.4 ? 'moon' : c < 5.5 ? null : c < 8 ? 'moon' : null;
    inp.armsUp = inp.pose === 'star';
    inp.armsDown = !inp.pose;
  },
};

const CASES = [
  ['crossStones', 'hop-stones'],
  ['aimDish', 'side-step'],
  ['skyCrank', 'arm-pump'],
  ['gatePoses', 'pose-match'],
];

const results = {};
for (const [key, engineName] of CASES) {
  for (const age of ['little', 'big']) {
    results[`${engineName}:${age}`] = await runCase(engineName, ACTIVITIES[key], age, SCRIPTS[engineName]);
  }
}

if (process.argv.includes('--update')) {
  mkdirSync(dirname(GOLDEN), { recursive: true });
  writeFileSync(GOLDEN, JSON.stringify(results, null, 1) + '\n');
  for (const [k, log] of Object.entries(results)) console.log(`saved  ${k.padEnd(18)} ${log.length} entries, ${log.at(-1)}`);
  process.exit(0);
}

if (!existsSync(GOLDEN)) {
  console.log('No golden file yet: run with --update first.');
  process.exit(1);
}
const golden = JSON.parse(readFileSync(GOLDEN, 'utf8'));
let failed = 0;
for (const [k, log] of Object.entries(results)) {
  const want = golden[k] ?? [];
  const i = log.findIndex((line, n) => line !== want[n]);
  const same = i === -1 && log.length === want.length;
  if (!same) failed++;
  const at = i === -1 ? Math.min(log.length, want.length) : i;
  console.log(`${same ? 'PASS' : 'FAIL'}  ${k.padEnd(18)} ${log.length} entries, ${log.at(-1)}${same ? '' : `\n      first difference at entry ${at}:\n      want: ${want[at]}\n      got:  ${log[at]}`}`);
}
console.log(failed ? `\n${failed} changed` : '\nAll the same as the golden results');
process.exit(failed ? 1 : 0);
