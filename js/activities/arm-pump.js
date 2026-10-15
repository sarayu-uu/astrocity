// Engine: arm-pump
// Moves: both arms up, then down, again and again.
// Each full pump kicks a machine and fills its charge until it's full.
//
// Needs from the world (activity.machine(W)): an object with
//   kick()          one push (spin a wheel, puff some steam...)
//   setCharge(k)    k from 0 to 1
//
// Tune: pumps (how many to fill it).

import { sfx } from '../core/audio.js';
import { coach, pick } from './common.js';
import { pumpCounter } from './moves.js';

export default {
  id: 'arm-pump',
  moves: ['arms-up', 'arms-down'],

  async run(g, a) {
    const { input, ui } = g;
    const T = a.text;
    const machine = a.machine(g.W);
    const hero = a.hero ? g.B[a.hero] : null;
    const need = a.tune.pumps;
    if (a.tune.shot) await g.rig.go(a.tune.shot.pos, a.tune.shot.look, 1.4);
    coach(g, 'pump', T.pump);
    g.needsBody = true;
    if (hero) hero.state = 'cheer';

    let pumps = 0;
    const pump = pumpCounter();
    machine.setCharge(0);
    while (pumps < need) {
      await g.frame();
      if (pump.update(input)) {
        pumps++;
        machine.kick();
        machine.setCharge(pumps / need);
        sfx.charge(pumps / need);
        ui.setCoachProgress(pumps / need);
        if (hero && pumps < need) ui.bark(hero, pick(T.cheers, pumps - 1), 1.2);
      }
    }
    if (hero) {
      ui.bark(hero, T.full, 1.6);
      hero.state = a.tune.restState ?? 'idle';
    }
    sfx.whoosh();
    await g.wait(0.8);
  },

  reset(g, a) {
    a.machine(g.W).setCharge(0);
  },

  finish(g, a) {
    a.machine(g.W).setCharge(1);
    if (a.hero) g.B[a.hero].state = a.tune.restState ?? 'idle';
  },
};
