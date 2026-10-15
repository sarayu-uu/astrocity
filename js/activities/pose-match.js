// Engine: pose-match
// Moves: star (both arms up), bridge (arms out wide), moon (one arm up).
// A lock shows a row of pose pictures. Copy each one and hold it still to light it up.
// Buddies standing nearby copy the pose too (one may get it a bit wrong, for a laugh).
//
// Needs from the world (activity.lock(W)): an object with
//   glyphs[]          pose names in order, e.g. ['star', 'bridge', 'moon']
//   setGlyph(i, k)    how bright picture i glows (0.25 dim, 3 done)
//
// Tune: hold (seconds to hold each pose).
// Text: poses { star, bridge, moon } coach entries, plus barks[] said after each pose.
// copycats: buddies that copy the pose; oops: { buddy: { pose: [leftArm, rightArm] } }.

import { sfx } from '../core/audio.js';
import { coach } from './common.js';
import { holdMeter } from './moves.js';

// Arm angles a buddy uses to show each pose.
export const POSE_ARMS = {
  star: [2.6, 2.6],
  bridge: [1.5, 1.5],
  moon: [0.35, 2.6],
};

export default {
  id: 'pose-match',
  moves: ['star', 'bridge', 'moon'],

  async run(g, a) {
    const { input, ui } = g;
    const T = a.text;
    const lock = a.lock(g.W);
    const holdFor = a.tune.hold;
    const copycats = (a.copycats ?? []).map(k => g.B[k]);
    g.needsBody = true;

    for (let i = 0; i < lock.glyphs.length; i++) {
      const kind = lock.glyphs[i];
      coach(g, kind, T.poses[kind]);
      const meter = holdMeter(holdFor);
      while (!meter.done) {
        await g.frame();
        lock.setGlyph(i, 0.7 + Math.sin(performance.now() / 200) * 0.3);
        meter.update(input.pose === kind, g.dt);
        ui.setCoachProgress(meter.k);
      }
      lock.setGlyph(i, 3);
      sfx.chime();
      ui.setCoachProgress(0);

      for (const b of copycats) {
        b.state = 'pose';
        b.pose = a.oops?.[b.kind]?.[kind] ?? POSE_ARMS[kind];
      }
      const [who, line] = T.barks[i % T.barks.length];
      ui.bark(g.B[who], line, 2);
      await g.wait(1.6);
      for (const b of copycats) b.state = 'idle';
    }
  },

  reset(g, a) {
    const lock = a.lock(g.W);
    lock.glyphs.forEach((_, i) => lock.setGlyph(i, 0.25));
  },

  finish(g, a) {
    const lock = a.lock(g.W);
    lock.glyphs.forEach((_, i) => lock.setGlyph(i, 3));
  },
};
