// Engine: runner
// Moves: step into lanes, jump, duck, arms up.
// An endless-runner game inside an activity stage. The rules live in runner-sim.js (seeded,
// fixed-step, no 3D); this file draws the sim with the stage's looks, plays the hero, sounds
// and HUD, and handles the goal, Keep going (endless) and best scores.
//
// Activity config:
//   stage: 'name'                  a stage that provides stage.runner looks (see test-track.js)
//   hero: 'poppy'                  the buddy who runs
//   legs: [{ length or seconds, theme, patterns, tier, setPiece: 'name', bark, coach, teach }]
//                                  (see runner-sim.js; bark is said as the leg starts, coach shows
//                                  a coach card through the leg, e.g. the teach leg)
//   setPieces: { name: {...} }     story obstacles at the end of legs (see set-piece.js)
//   beats: { start, end, resume }  story moments in the stage: before the run, after the last
//                                  set piece (before the result card), and on Keep going
//   patterns: { name: {...} }      extra patterns for this chapter (see runner-patterns.js)
//   tune.little / tune.big: { speed: { start, max }, breatherEvery }
//   text: { hit: [lines], goal }
//   islandEnd(g)                   what the island looks like after this game (for Skip/Continue)

import * as THREE from 'three';
import { sfx } from '../core/audio.js';
import { saveBest } from '../core/director.js';
import { createRunSim, createBot, STEP, WINDOW_BEFORE, WINDOW_AFTER } from './runner-sim.js';
import { coach, pick } from './common.js';
import { playSetPiece } from './set-piece.js';

const LANE_W = 2.2;
const SEG_LEN = 20;
const SEGMENTS = 8;
const POOL = { block: 10, gap: 5, wobble: 5, high: 5, sunk: 5 };
const VISIBLE = { behind: 8, ahead: 90 }; // track distance drawn around the hero
const JUMP_HEIGHT = 1.6;

// The child's body (or keys) as the sim's input. `jump` only on the first step of a frame.
// A MotionInput in replay mode works here too, so recordings can drive a run later.
export function inputFromMotion(input) {
  return { zone: input.zone, jump: input.consumeJump(), duck: input.duck, armsUp: input.armsUp, tracking: input.tracking };
}

export default {
  id: 'runner',
  moves: ['step-left', 'step-right', 'jump', 'duck', 'arms-up'],
  ownsResult: true, // shows its own result card (Keep going / Back to the story)

  async run(g, a, stage) {
    const { ui, input } = g;
    const age = g.settings.age;
    const T = a.text ?? {};
    const hero = stage.cast[a.hero];
    const sim = createRunSim({
      age,
      play: input.camera ? 'camera' : 'keyboard',
      seed: a.seed ?? (Date.now() & 0xffff),
      speed: a.tune.speed,
      legs: a.legs,
      patterns: a.patterns,
      breatherEvery: a.tune.breatherEvery ?? (age === 'little' ? 180 : 240),
    });
    const view = createView(stage, sim);
    // ?debug › Autoplay: the test bot plays instead of the child (keyboard lane speed).
    const bot = g.debugAutoplay ? createBot(sim, { age, play: 'keyboard' }) : null;
    g.runSim = sim; // for the dev console and browser tests
    stage.runner.theme(sim.legDef(0).theme);
    hero.place(0, 0).faceNow(0, -10);
    // The chase camera, so it can come back exactly after story shots.
    const chase = { pos: stage.camera.position.clone(), quat: stage.camera.quaternion.clone() };
    const toChase = () => {
      stage.camera.position.copy(chase.pos);
      stage.camera.quaternion.copy(chase.quat);
    };
    const say = (text, seconds = 2) => text && ui.bark(hero, text, seconds, { voice: true });
    // A leg's coach card (the teach leg): what to do, with the camera's thirds shown.
    const legCoach = def => {
      if (def?.coach) {
        coach(g, 'left', def.coach);
        ui.preview = { zones: true };
      } else {
        ui.hideCoach();
        ui.preview = null;
      }
    };

    let stop = false;
    let acc = 0;
    let finished = null;
    try {
      // The opening story beat (dialogue may pause here; the run hasn't started).
      if (a.beats?.start) {
        hero.state = 'idle';
        await a.beats.start(g, stage, { hero, sim });
      }
      hero.state = 'run';
      g.needsBody = true;
      g.onResume = () => sim.clearAhead(2);
      ui.runHud({ progress: 0, count: 0, onStop: () => { stop = true; } });
      legCoach(sim.legDef(0));

      while (!finished) {
        await g.frame();
        acc += g.dt;
        const frameInput = bot ? null : inputFromMotion(input);
        let first = true;
        while (acc >= STEP) {
          sim.step(bot ? bot() : first ? frameInput : { ...frameInput, jump: false });
          first = false;
          acc -= STEP;
        }

        for (const e of sim.events) {
          if (e.type === 'telegraph') {
            const dir = e.move === 'lane' ? Math.sign(e.toward - sim.lane) : 0;
            if (e.move !== 'lane' || dir !== 0) {
              ui.moveCue(e.move === 'lane' ? (dir < 0 ? 'left' : 'right') : e.move);
              sfx.cue(e.move, dir);
            }
          } else if (e.type === 'hit') {
            sfx.wobble();
            if (T.hit) say(pick(T.hit, sim.stats.hits), 1.4);
          } else if (e.type === 'bun') {
            sfx.pop();
          } else if (e.type === 'star') {
            sfx.chime();
          } else if (e.type === 'teachDone') {
            legCoach(null);
            sfx.chime();
            say(sim.legDef(e.leg).doneBark);
          } else if (e.type === 'legEnd') {
            legCoach(null);
            // A story obstacle at the end of the leg (the sim keeps 2 s clear around it).
            const name = sim.legDef(e.leg).setPiece;
            if (name) {
              const piece = a.setPieces?.[name];
              if (!piece) throw new Error(`Activity "${a.id}": no set piece "${name}"`);
              ui.moveCue(null);
              await playSetPiece(g, stage, { helper: a.hero, ...piece }, { hero, leave: props => view.leave(props) });
              hero.state = 'run';
              sim.clearAhead(2);
              acc = 0;
            }
          } else if (e.type === 'legStart') {
            stage.runner.theme(e.def.theme);
            legCoach(e.def);
            if (!sim.endless) say(e.def.bark, 2.2);
          } else if (e.type === 'breather') {
            await breather(g, sim);
            acc = 0;
          } else if (e.type === 'goal') {
            // The closing story beat, then the result card.
            if (a.beats?.end) {
              g.needsBody = false;
              await a.beats.end(g, stage, { hero, sim });
            }
            const choice = await result(g, a, sim, false);
            acc = 0;
            if (choice === 'more') {
              a.beats?.resume?.(g, stage, { hero, sim });
              toChase();
              hero.place(sim.laneX * LANE_W, 0).faceNow(0, -10);
              g.needsBody = true;
              sim.continueEndless();
              sim.clearAhead(2);
              ui.runHud({ endless: true });
            } else {
              finished = 'story';
            }
          }
        }
        sim.events.length = 0;
        if (stop && !finished) {
          await result(g, a, sim, true);
          finished = 'story';
        }

        view.update(g.dt);
        updateHero(hero, sim);
        ui.runHud({ progress: sim.endless ? null : sim.progress, count: sim.stats.buns, stars: sim.stats.stars });
      }
      // Back on the island, things are as this game leaves them.
      a.islandEnd?.(g);
    } finally {
      g.onResume = null;
      g.runSim = null;
      g.needsBody = false;
      ui.runHud(null);
      ui.moveCue(null);
      ui.hideCoach();
      ui.preview = null;
    }
  },

  reset() {},

  // Skipped or fast-forwarded: put the island in the state this game would leave it in.
  finish(g, a) {
    a.islandEnd?.(g);
  },
};

function updateHero(hero, sim) {
  hero.root.position.x = sim.laneX * LANE_W;
  hero.root.position.z = 0;
  hero.root.position.y = sim.airborne ? Math.sin(sim.jumpK * Math.PI) * JUMP_HEIGHT : 0;
  hero.airborne = sim.airborne;
  hero.state = sim.stumbleT > 0 ? 'stumble' : sim.duck && !sim.airborne ? 'duck' : 'run';
  hero.runRate = sim.speed / 7;
}

// A short rest card that carries on by itself after 5 s.
async function breather(g, sim) {
  g.ui.breather(true);
  await g.wait(5);
  g.ui.breather(false);
  sim.clearAhead(2);
}

// Result card: stars, buns, distance; saves the best. Resolves 'more' (Keep going) or 'story'.
async function result(g, a, sim, endless) {
  const stars = sim.starsEarned();
  const res = { score: sim.score, buns: sim.stats.buns, stars, distance: Math.round(sim.dist) };
  const best = saveBest(a.id, g.settings.age, res);
  sfx.chime();
  return g.ui.runResult({
    title: endless ? 'What a run!' : (a.text?.goal ?? 'You made it!'),
    stars,
    rows: [['Buns', `${sim.stats.buns} / ${sim.stats.bunsSeen}`], ['Distance', `${Math.round(sim.dist)} m`], ['Score', sim.score], ['Best', best.score]],
    more: !endless,
  });
}

// ---- Drawing the sim with the stage's looks (everything built once, then reused) -------

function createView(stage, sim) {
  const looks = stage.runner;
  const root = new THREE.Group();
  stage.scene.add(root);

  const segments = Array.from({ length: SEGMENTS }, () => {
    const s = looks.segment();
    root.add(s);
    return s;
  });

  const pools = {};
  for (const [kind, n] of Object.entries(POOL)) {
    pools[kind] = Array.from({ length: n }, () => {
      const m = looks.obstacle[kind]();
      m.visible = false;
      root.add(m);
      return m;
    });
  }

  const instanced = (look, n) => {
    const m = new THREE.InstancedMesh(look.geometry, look.material, n);
    m.castShadow = true;
    m.count = 0;
    m.frustumCulled = false;
    root.add(m);
    return m;
  };
  const buns = instanced(looks.bun, 120);
  const stars = instanced(looks.star, 8);
  const tmp = new THREE.Object3D();
  let spin = 0;
  const leaving = []; // set-piece things scrolling away behind the hero

  return {
    // After a set piece its things stay put on the track, so they slide past as the run goes on.
    leave(props) {
      props.leaving = true;
      leaving.push(props);
    },

    update(dt) {
      spin += dt * 2.5;
      for (let i = leaving.length - 1; i >= 0; i--) {
        // (Picked up again by the next set piece before it was gone: let it be.)
        if (!leaving[i].leaving) {
          leaving.splice(i, 1);
          continue;
        }
        const root = leaving[i].root;
        root.position.z += sim.speed * dt;
        if (root.position.z > VISIBLE.behind + 30) {
          root.visible = false;
          leaving.splice(i, 1);
        }
      }
      // Ground pieces leapfrog forward as they pass behind the camera.
      const first = Math.floor((sim.dist - VISIBLE.behind) / SEG_LEN);
      segments.forEach((s, i) => {
        s.position.z = -((first + i) * SEG_LEN - sim.dist);
      });

      const used = Object.fromEntries(Object.keys(pools).map(k => [k, 0]));
      const take = kind => pools[kind][used[kind]++];
      let nb = 0, ns = 0;
      for (const o of sim.objects) {
        const rel = o.D - sim.dist;
        if (rel < -VISIBLE.behind || rel > VISIBLE.ahead) continue;
        const z = -rel;
        if (o.kind === 'bun' || o.kind === 'star') {
          if (o.taken) continue;
          const mesh = o.kind === 'bun' ? buns : stars;
          if ((o.kind === 'bun' ? nb : ns) >= mesh.instanceMatrix.count) continue;
          tmp.position.set(o.lane * LANE_W, 0.8 + o.arc * 1.5, z);
          tmp.rotation.set(0, spin + o.D, 0);
          tmp.updateMatrix();
          mesh.setMatrixAt(o.kind === 'bun' ? nb++ : ns++, tmp.matrix);
          continue;
        }
        if (o.kind === 'breather') continue;
        const lanes = o.kind === 'block' || o.kind === 'wall' ? o.blocked : [null];
        for (const lane of lanes) {
          const kind = o.kind === 'wall' ? 'block' : o.kind;
          if (used[kind] >= pools[kind].length) continue;
          const m = take(kind);
          m.visible = true;
          m.position.set(lane === null ? 0 : lane * LANE_W, 0, z);
          if (o.kind === 'sunk') {
            o.rise = Math.min(1, (o.rise ?? 0) + (o.cleared ? dt * 3 : 0));
            m.position.y = -0.5 + o.rise * 0.6;
          }
          if (o.kind === 'wobble') {
            m.position.y = Math.sin(spin * 3 + o.D) * 0.06;
            // It glows for exactly the move window: a jump any time in the glow counts.
            const arrival = rel / Math.max(sim.speed, 0.1);
            m.userData.glow?.(!o.judged && arrival <= WINDOW_BEFORE && arrival >= -WINDOW_AFTER ? 1 : 0);
          }
        }
      }
      for (const [kind, list] of Object.entries(pools)) for (let i = used[kind]; i < list.length; i++) list[i].visible = false;
      buns.count = nb;
      stars.count = ns;
      buns.instanceMatrix.needsUpdate = true;
      stars.instanceMatrix.needsUpdate = true;
    },
  };
}
