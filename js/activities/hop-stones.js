// Engine: hop-stones
// Moves: jump, both arms up.
// A hero hops across a row of drifting stones. Jump when the next stone glows (it's lined up).
// A sunken stone has to be lifted first by holding both arms up. A mistimed jump only makes the
// hero wobble; nothing is ever lost.
//
// Needs from the world (activity.stones(W)): an object with
//   stones[]            meshes with userData { sunk, raise }
//   start, landing      Vector3s: where the hero waits, and where the last hop lands
//   top(i)              Vector3 on top of stone i
//   aligned(i, tol)     true while stone i is lined up
//   highlight(i, on)    glow stone i (-1 for none)
//   drift               how far the stones wander
//
// Tune: drift, tolerance (how forgiving "lined up" is), liftTime (seconds of arms-up),
//       sunk (indexes of stones that start sunk).

import { sfx } from '../core/audio.js';
import { coach } from './common.js';

export default {
  id: 'hop-stones',
  moves: ['jump', 'arms-up'],

  async run(g, a) {
    const { rig, input } = g;
    const hero = g.B[a.hero];
    const T = a.text;
    const bridge = a.stones(g.W);
    const { tolerance, liftTime } = a.tune;
    resetStones(bridge, a.tune.sunk ?? []);
    bridge.drift = a.tune.drift;

    coach(g, 'jump', T.jump);
    g.needsBody = true;
    rig.followWith(() => ({ pos: [hero.x + 1.2, 4, 13.5], look: [hero.x + 2.6, 0.4, 4] }), 2.2);
    await hero.walkTo(bridge.start.x, bridge.start.z, 2);
    hero.faceNow(bridge.landing.x, bridge.landing.z);
    input.consumeJump();

    let at = -1;
    let hopping = false;
    let lift = 0;
    let liftShown = false;
    const n = bridge.stones.length;
    const targetOf = i => (i >= n ? bridge.landing.clone() : bridge.top(i));

    for (;;) {
      await g.frame();
      if (at >= n) break;
      if (at >= 0 && !hopping) hero.root.position.copy(bridge.top(at));
      const next = at + 1;

      // A sunken stone: hold both arms up to lift it.
      if (next < n && bridge.stones[next].userData.sunk && !hopping) {
        if (!liftShown) {
          liftShown = true;
          coach(g, 'star', T.lift);
          g.ui.bark(hero, T.sank, 2.2);
          sfx.wobble();
        }
        const s = bridge.stones[next];
        lift = input.armsUp ? Math.min(1, lift + g.dt / liftTime) : Math.max(0, lift - g.dt * 0.6);
        s.userData.raise = lift * 0.85;
        g.ui.setCoachProgress(lift);
        if (lift >= 1) {
          s.userData.raise = 1;
          s.userData.sunk = false;
          lift = 0;
          liftShown = false;
          sfx.rumble();
          sfx.chime();
          g.ui.setCoachProgress(0);
          g.ui.bark(hero, T.lifted, 2);
          coach(g, 'jump', T.jumpAgain);
        }
        bridge.highlight(-1, false);
        input.consumeJump();
        continue;
      }

      const aligned = next >= n || bridge.aligned(next, tolerance);
      bridge.highlight(next < n ? next : -1, aligned);

      if (!hopping && input.consumeJump()) {
        hopping = true;
        sfx.jump();
        if (aligned) {
          hero.hop(() => targetOf(next), 1.3, 0.62).then(() => {
            at = next;
            hopping = false;
            sfx.land();
            if (next === 1) g.ui.bark(hero, T.first, 1.4);
            if (next === n - 1) g.ui.bark(hero, T.almost, 1.6);
          });
        } else {
          // Too early: a hop on the spot and some arm-waving.
          hero.hop(() => hero.root.position.clone(), 0.5, 0.4).then(() => {
            hopping = false;
            sfx.wobble();
            g.ui.bark(hero, T.early, 1.8);
          });
        }
      }
    }
    bridge.highlight(-1, false);
    sfx.chime();
  },

  // Back to the start, for "Play again".
  reset(g, a) {
    const bridge = a.stones(g.W);
    resetStones(bridge, a.tune.sunk ?? []);
    g.B[a.hero].place(bridge.start.x, bridge.start.z);
  },

  // The end state, for when this step is fast-forwarded.
  finish(g, a) {
    const bridge = a.stones(g.W);
    resetStones(bridge, []);
    bridge.drift = a.tune.drift;
    bridge.highlight(-1, false);
    g.B[a.hero].place(bridge.landing.x, bridge.landing.z, bridge.landing.y);
  },
};

function resetStones(bridge, sunk) {
  bridge.stones.forEach((s, i) => {
    s.userData.sunk = sunk.includes(i);
    s.userData.raise = s.userData.sunk ? 0 : 1;
  });
}
