// Engine: set-piece
// Moves: jump, arms up (hold), step left / right, arm pumps, star / bridge / moon (hold).
// A story obstacle fixed with a short list of big moves. The camera swings to a fixed shot, each
// step asks for one move, and every move visibly changes the scene (a stone rises, a plank
// slides). It ends with a 2 s celebration, which is also the rest beat. The rules (steps, the
// "Ready…" gate, help for a stuck child) live in set-piece-sim.js.
//
// A set piece (in a chapter's activities.js, usually under a runner's `setPieces`):
//   {
//     scene: 'stones',                 the stage builds its things: stage.setPieces.stones(stage)
//     steps: [{ move, times / hold / sequence, text, does, done }, ...]   (see set-piece-sim.js)
//     cheer: 'The stones are back!',   said in the celebration
//     helper: 'nutty',                 the buddy who shows the move when the child is stuck
//     intro: [[who, text, opts]],      lines before the steps (they move on by themselves)
//     after(g, stage, props, hero),    a story beat once the steps are done, before the cheer
//   }
//
// What the stage's set-piece builder returns:
//   {
//     root,                            a Group holding everything (shown only during the piece)
//     shot: { pos, look },             the fixed camera
//     does: { name(k, info) },         per step: k is the step's progress 0..1; info.aim follows
//                                      the child (-1..1); info.instant = jump to it (Skip).
//                                      Make them with stage.smooth() so jitter never shakes.
//     cheerAt: [x, y, z],              where the celebration sparkles burst (optional)
//     enter(), exit(),                 called as the piece starts and ends (optional)
//   }
//
// Use it as its own activity (engine: 'set-piece', with a stage), or from the runner at the end
// of a leg: legs: [{ ..., setPiece: 'bridge1' }] with setPieces: { bridge1: {...} }.

import * as THREE from 'three';
import { sfx } from '../core/audio.js';
import { createSetPieceSim, createSetPieceBot } from './set-piece-sim.js';
import { POSE_ARMS } from './pose-match.js';
import { coach, fill, pick } from './common.js';

const SHOT_TIME = 1.0; // seconds the camera takes to swing to and from the set piece
const CHEER_TIME = 2;
const CANT_SEE_TIME = 4;

// Words for each move when a step doesn't give its own. { title, camera, keys } like the coach.
export const MOVE_TEXT = {
  ready: { title: 'Ready…', camera: 'Arms down. Stand in the middle.', keys: 'Let go of the keys.' },
  jump: { title: 'Jump!', camera: 'Big jumps!', keys: 'Press Space.' },
  armsUp: { title: 'Arms up! Hold!', camera: 'Reach up high and hold.', keys: 'Hold W or ↑.' },
  pump: { title: 'Arms up, then down!', camera: 'Up... and down! Again!', keys: 'Tap W or ↑ again and again.' },
  step: { title: 'Step to the {side}!', camera: 'Move your whole body.', keys: 'Hold ← or →.' },
  middle: { title: 'Back to the middle!', camera: 'Stand in the middle part.', keys: 'Let go of the arrow key.' },
  star: { title: 'Make a star!', camera: 'Both arms up. Hold still...', keys: 'Hold 1.' },
  bridge: { title: 'Make a bridge!', camera: 'Arms out wide. Hold still...', keys: 'Hold 2.' },
  moon: { title: 'Make a moon!', camera: 'One arm up. Hold still...', keys: 'Hold 3.' },
  cantSee: { title: "Poppy can't see you", camera: 'Step back so all of you is in the picture.', keys: '' },
};
const DEMO_LINE = {
  jump: 'Like this! Jump!',
  armsUp: 'Arms up high, like me!',
  pump: 'Up, down! Like me!',
  step: 'Step to the {side}, like me!',
  pose: 'Make a {pose}, like me!',
};
const DONE_LINES = ['Yes!', 'You did it!', 'Wow!', 'Great moving!'];
const EASE_LINE = 'Just a little more!';
const READY_HINT = 'Arms down, and stand in the middle!';

export default {
  id: 'set-piece',
  moves: ['jump', 'arms-up', 'step-left', 'step-right', 'arms-pump', 'star', 'bridge', 'moon'],

  async run(g, a, stage) {
    if (!stage) throw new Error(`Activity "${a.id}": the set-piece engine needs a stage`);
    await playSetPiece(g, stage, a, { hero: stage.cast[a.hero] });
  },

  reset() {},

  finish(g, a) {
    a.islandEnd?.(g);
  },
};

// Plays one set piece in `stage`. `leave(props)` takes the scene's things away afterwards (the
// runner scrolls them past); without it they are just hidden.
export async function playSetPiece(g, stage, piece, { hero, leave } = {}) {
  const { ui, input } = g;
  const props = setPieceProps(stage, piece.scene);
  const helper = (piece.helper && stage.cast[piece.helper]) || hero;
  const sim = createSetPieceSim({ steps: piece.steps, age: g.settings.age });
  const bot = g.debugAutoplay ? createSetPieceBot(sim) : null;
  g.setPieceSim = sim; // for the dev console and browser tests
  const doesOf = s => (s?.does && props.does?.[s.does]) || null;

  props.leaving = false;
  props.root.position.set(0, 0, 0);
  props.root.visible = true;
  for (const s of sim.steps) doesOf(s)?.(0, { instant: true, aim: 0 });
  if (hero) {
    hero.place(0, 0).faceNow(0, -10);
    hero.airborne = false;
    hero.state = 'idle';
  }
  ui.moveCue(null);
  props.enter?.();
  const cameraBack = await swingCamera(g, stage.camera, props.shot);

  // A set piece may open with a few lines (they move on by themselves).
  g.needsBody = false;
  for (const [who, text, opts] of piece.intro ?? []) await ui.say(who, text, opts ?? { auto: 3 });
  ui.hideDialogue();

  g.needsBody = true;
  input.consumeJump();
  let cantSeeUntil = 0, t = 0, demoing = false;
  const showCoach = () => showStepCoach(g, sim);
  try {
    while (sim.phase !== 'done') {
      if (g.skipping) {
        sim.finishAll();
        sim.events.length = 0;
        for (const s of sim.steps) doesOf(s)?.(1, { instant: true, aim: 0 });
        break;
      }
      await g.frame();
      t += g.dt;
      const frameInput = bot
        ? bot(g.dt)
        : { zone: input.zone, armsUp: input.armsUp, armsDown: input.armsDown, pose: input.pose, duck: input.duck, tracking: input.tracking, jump: input.consumeJump() };
      const stepBefore = sim.step;
      sim.update(frameInput, g.dt);

      for (const e of sim.events) {
        switch (e.type) {
          case 'ready':
          case 'go':
          case 'item':
            if (t >= cantSeeUntil) showCoach();
            if (e.type === 'go') sfx.pop();
            break;
          case 'count':
            sfx.count(e.n);
            if (e.step.move === 'jump' && hero) {
              sfx.jump();
              hero.hop(new THREE.Vector3(hero.x, 0, hero.z), 0.9, 0.45).then(() => sfx.land());
            }
            break;
          case 'stepDone':
            doesOf(e.step)?.(1, { aim: sim.aim });
            ui.arrow(null);
            ui.setCoachProgress(0);
            sfx.chime();
            if (hero) ui.bark(hero, e.step.done ?? pick(DONE_LINES, e.index), 1.4);
            break;
          case 'demo':
            if (helper && !demoing) {
              demoing = true;
              const want = e.want;
              ui.bark(helper, fill(DEMO_LINE[want.move] ?? 'Like me!', { side: want.side, pose: want.pose }), 2.4);
              demonstrate(g, helper, want, stage.camera).finally(() => { demoing = false; });
            }
            break;
          case 'ease':
            if (helper) ui.bark(helper, EASE_LINE, 1.8);
            break;
          case 'cantSee':
            coach(g, 'stand', MOVE_TEXT.cantSee);
            cantSeeUntil = t + CANT_SEE_TIME;
            break;
          case 'readyHint':
            if (helper) ui.bark(helper, READY_HINT, 2.4);
            break;
        }
      }
      sim.events.length = 0;
      if (cantSeeUntil && t >= cantSeeUntil) {
        cantSeeUntil = 0;
        showCoach();
      }

      // The scene follows the step's progress (the stage eases it, so jitter doesn't show).
      if (sim.phase === 'move' && sim.step === stepBefore) doesOf(sim.step)?.(sim.progress, { aim: sim.aim });
      ui.setCoachProgress(sim.phase === 'move' ? sim.progress : 0);
    }

    ui.hideCoach();
    ui.setCoachProgress(0);
    ui.arrow(null);
    ui.preview = null;
    await piece.after?.(g, stage, props, hero);
    await celebrate(g, stage, props, hero, piece.cheer);
  } finally {
    g.setPieceSim = null;
    ui.hideCoach();
    ui.arrow(null);
    ui.preview = null;
  }
  await cameraBack();
  props.exit?.();
  if (leave) leave(props);
  else props.root.visible = false;
}

// The stage builds each set piece's things once, the first time it is needed.
function setPieceProps(stage, name) {
  stage.setPieceProps ??= {};
  if (!stage.setPieceProps[name]) {
    const build = stage.setPieces?.[name];
    if (!build) throw new Error(`Stage "${stage.id}" has no set piece "${name}"`);
    const props = build(stage);
    stage.scene.add(props.root);
    stage.setPieceProps[name] = props;
  }
  return stage.setPieceProps[name];
}

// The coach card for what the child should do now.
function showStepCoach(g, sim) {
  const { ui } = g;
  const s = sim.step;
  if (!s || sim.phase === 'done') return;
  if (sim.phase === 'ready') {
    ui.arrow(null);
    ui.preview = { zones: true, target: 'center' };
    coach(g, 'stand', MOVE_TEXT.ready);
    return;
  }
  const own = typeof s.text === 'string' ? { title: s.text } : s.text ?? {};
  const w = sim.want;
  ui.preview = s.move === 'step' ? { zones: true, target: w.side } : null;
  if (s.move === 'step') {
    if (w.side === 'center') {
      ui.arrow(null);
      coach(g, 'center', MOVE_TEXT.middle);
    } else {
      ui.arrow(w.side);
      const entry = { ...MOVE_TEXT.step, ...own };
      coach(g, w.side, { ...entry, title: fill(entry.title, { side: w.side }) });
    }
  } else if (s.move === 'pose') {
    coach(g, w.pose, { ...MOVE_TEXT[w.pose], ...own });
  } else {
    const figure = { jump: 'jump', armsUp: 'star', pump: 'pump' }[s.move];
    coach(g, figure, { ...MOVE_TEXT[s.move], ...own });
  }
}

// The helper buddy turns to the child and shows the move (about 2.5 s).
async function demonstrate(g, b, want, camera) {
  const before = b.state;
  const beforePose = b.pose;
  const at = new THREE.Vector3(b.x, 0, b.z);
  b.face(camera.position.x, camera.position.z);
  try {
    if (want.move === 'jump') {
      for (let i = 0; i < 3; i++) await b.hop(at.clone(), 0.9, 0.5);
    } else if (want.move === 'armsUp' || want.move === 'pose') {
      b.state = 'pose';
      b.pose = POSE_ARMS[want.pose ?? 'star'];
      await g.wait(2.5);
    } else if (want.move === 'pump') {
      b.state = 'pose';
      for (let i = 0; i < 6; i++) {
        b.pose = i % 2 ? [0.35, 0.35] : POSE_ARMS.star;
        await g.wait(0.4);
      }
    } else if (want.move === 'step') {
      const dir = want.side === 'left' ? -1 : want.side === 'right' ? 1 : 0;
      await b.walkTo(at.x + dir * 1.2, at.z, 3);
      await g.wait(0.6);
      await b.walkTo(at.x, at.z, 3);
    }
  } finally {
    b.state = before;
    b.pose = beforePose;
    b.face(at.x, at.z - 10);
  }
}

// Sparkles, a cheer and a sound: 2 s, and the rest beat before the run goes on.
async function celebrate(g, stage, props, hero, line) {
  const burst = sparkles(stage);
  const at = new THREE.Vector3(...(props.cheerAt ?? props.shot.look));
  burst.start(at);
  sfx.chime();
  sfx.whoosh();
  if (hero) {
    hero.state = 'cheer';
    if (line) g.ui.bark(hero, line, CHEER_TIME);
  }
  await g.tween(CHEER_TIME, k => burst.update(k));
  burst.stop();
  if (hero) hero.state = 'idle';
}

// One sparkle cloud per stage, reused by every set piece in it.
function sparkles(stage) {
  if (stage.sparkles) return stage.sparkles;
  const N = 80;
  const geo = new THREE.BufferGeometry();
  const pos = new Float32Array(N * 3);
  const vel = Array.from({ length: N }, (_, i) => {
    const a = (i / N) * Math.PI * 2 * 3.7;
    const up = 2.5 + (i % 7) * 0.6;
    return new THREE.Vector3(Math.cos(a) * (1 + (i % 5) * 0.4), up, Math.sin(a) * (1 + (i % 3) * 0.5));
  });
  geo.setAttribute('position', new THREE.BufferAttribute(pos, 3));
  const mat = new THREE.PointsMaterial({ color: '#ffe680', size: 0.28, transparent: true, depthWrite: false });
  const points = new THREE.Points(geo, mat);
  points.visible = false;
  points.frustumCulled = false;
  stage.scene.add(points);
  const origin = new THREE.Vector3();
  stage.sparkles = {
    start(at) {
      origin.copy(at);
      points.visible = true;
    },
    update(k) {
      const t = k * 2;
      for (let i = 0; i < N; i++) {
        const v = vel[i];
        pos[i * 3] = origin.x + v.x * t;
        pos[i * 3 + 1] = origin.y + v.y * t - 2.4 * t * t;
        pos[i * 3 + 2] = origin.z + v.z * t;
      }
      geo.attributes.position.needsUpdate = true;
      mat.opacity = 1 - k * k;
    },
    stop() { points.visible = false; },
  };
  return stage.sparkles;
}

// Swings the stage camera to `shot` (eased) and returns a function that swings it back.
async function swingCamera(g, camera, shot) {
  const fromPos = camera.position.clone();
  const fromQ = camera.quaternion.clone();
  const toPos = new THREE.Vector3(...shot.pos);
  const toQ = new THREE.Quaternion().setFromRotationMatrix(new THREE.Matrix4().lookAt(toPos, new THREE.Vector3(...shot.look), camera.up));
  const go = async (aPos, aQ, bPos, bQ) => {
    if (g.skipping) {
      camera.position.copy(bPos);
      camera.quaternion.copy(bQ);
      return;
    }
    await g.tween(SHOT_TIME, k => {
      const e = k * k * (3 - 2 * k);
      camera.position.lerpVectors(aPos, bPos, e);
      camera.quaternion.slerpQuaternions(aQ, bQ, e);
    });
  };
  await go(fromPos, fromQ, toPos, toQ);
  return () => go(toPos, toQ, fromPos, fromQ);
}
