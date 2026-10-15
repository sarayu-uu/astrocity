// Engine: side-step
// Moves: step left, step right (the camera picture is split into three parts).
// A big arrow shows a side. The child steps into that third of the picture and stays there for
// a moment. Between steps they come back to the middle. Something in the world follows them
// the whole time (a dish turning, a lamp swinging...), so every step visibly does something.
//
// Needs from the world (activity.target(W)): an object with
//   aim(k)      k from -1 (fully left) to 1 (fully right), called every frame
//
// Tune: sequence (e.g. ['left', 'right']), hold (seconds to stay in place), startAim and
//       finalAim (-1..1, where the target starts and rests), shot ({ pos, look } camera, optional).
// The last side in the sequence should be the "right answer" the story is looking for.

import { sfx } from '../core/audio.js';
import { coach, fill, pick } from './common.js';
import { holdMeter, zoneFollower } from './moves.js';

export default {
  id: 'side-step',
  moves: ['step-left', 'step-right'],

  async run(g, a) {
    const { input, ui } = g;
    const T = a.text;
    const target = a.target(g.W);
    const hero = a.hero ? g.B[a.hero] : null;
    const { sequence, hold: holdFor, startAim = 0, finalAim = 0, shot } = a.tune;
    if (shot) await g.rig.go(shot.pos, shot.look, 1.4);
    g.needsBody = true;
    ui.preview = { zones: true, target: null };

    const follower = zoneFollower(startAim);
    const follow = () => target.aim(follower.update(input.zone, g.dt));

    // Waits until the child has stood in `zone` for `seconds`.
    const holdIn = async (zone, seconds) => {
      const meter = holdMeter(seconds);
      while (!meter.done) {
        await g.frame();
        follow();
        meter.update(input.zone === zone, g.dt);
        ui.setCoachProgress(meter.k);
      }
      ui.setCoachProgress(0);
    };

    for (let i = 0; i < sequence.length; i++) {
      const side = sequence[i];
      const last = i === sequence.length - 1;

      if (input.zone !== 'center') {
        ui.arrow(null);
        ui.preview.target = 'center';
        coach(g, 'center', T.middle);
        await holdIn('center', 0.3);
      }

      ui.arrow(side);
      ui.preview.target = side;
      coach(g, side, { ...T.step, title: fill(T.step.title, { side }) });
      await holdIn(side, holdFor);
      ui.arrow(null);
      sfx.chime();
      if (hero) ui.bark(hero, last ? T.found : pick(T.miss, i), 1.6);
    }

    // Ease into the final position, so the target ends up where the story needs it.
    ui.preview = null;
    const from = follower.aim;
    await g.tween(0.8, k => target.aim(from + (finalAim - from) * k));
  },

  reset(g, a) {
    a.target(g.W).aim(a.tune.startAim ?? 0);
  },

  finish(g, a) {
    a.target(g.W).aim(a.tune.finalAim ?? 0);
  },
};
