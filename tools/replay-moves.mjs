// Runs a recording from the ?debug "Record 10 s" button through the real move detection and
// prints when each move starts and stops. Use it to check threshold changes against real kids.
//
//   node tools/replay-moves.mjs recording.json [--age big] [--duckDrop 0.2] [--leanDeg 12] ...
//
// Any key in input.tune (duckDrop, duckHold, leanDeg, freezeK) can be overridden.

import { readFileSync } from 'fs';
import { pathToFileURL, fileURLToPath } from 'url';
import { dirname, join } from 'path';

globalThis.addEventListener = () => {}; // input.js listens for keys; not needed here
const here = dirname(fileURLToPath(import.meta.url));
const { MotionInput } = await import(pathToFileURL(join(here, '../js/core/input.js')).href);

const [file, ...flags] = process.argv.slice(2);
if (!file) {
  console.log('Usage: node tools/replay-moves.mjs recording.json [--age big] [--duckDrop 0.2] ...');
  process.exit(1);
}
const opts = {};
for (let i = 0; i < flags.length; i += 2) opts[flags[i].replace(/^--/, '')] = flags[i + 1];

const rec = JSON.parse(readFileSync(file, 'utf8'));
const input = new MotionInput({});
input.setAge(opts.age ?? 'little');
for (const k of Object.keys(input.tune)) if (opts[k] !== undefined) input.tune[k] = Number(opts[k]);
input.playRecording(rec);

const end = rec.frames.at(-1)?.t ?? 0;
const state = {};
let jumps = 0;
const say = (t, text) => console.log(`${t.toFixed(2).padStart(6)} s  ${text}`);
console.log(`${file}: ${rec.frames.length} frames, ${end.toFixed(1)} s, tune ${JSON.stringify(input.tune)}`);
for (let t = 0; t <= end + 0.1; t += 1 / 60) {
  input.update(1 / 60);
  const now = {
    tracking: input.tracking, zone: input.zone, arms: input.armsUp ? 'up' : input.armsDown ? 'down' : 'mid',
    pose: input.pose, duck: input.duck, lean: input.lean, still: input.stillFor >= 2, calibrating: input.calibrating,
  };
  for (const [k, v] of Object.entries(now)) {
    if (state[k] !== v) {
      if (k in state) say(t, `${k}: ${state[k]} → ${v}`);
      state[k] = v;
    }
  }
  if (input.jumps !== jumps) { jumps = input.jumps; say(t, 'JUMP'); }
}
console.log(`baseline ${JSON.stringify(input._baseline)}, jitter ${input.debug.jitter?.toFixed(3)}`);
