// Engine: trials
// Moves: jump, squat, lean, freeze, step left / right, reach (arms up), star / bridge / moon.
// "Copy me" rounds inside a stage: a host (Mimi) shows a move, the child copies it within a time
// window, and each card won lights a floor tile. After each round the tiles all light up in a
// celebration, then a crystal lock (a set piece) opens. The rules live in trials-sim.js.
//
// Activity config:
//   stage: 'crystal-arena'          provides stage.arena (tiles, rings, locks; see crystal-arena.js)
//   host: 'mimi', copycats: [...]   who shows the moves, and who copies the child
//   rounds: [{ cards: [types] }]    see trials-sim.js (8 per round: 5 active, freeze, choice, dance)
//   locks: [piece, ...]             a set piece after each round (see set-piece.js)
//   windowScale: [per round]        e.g. [1, 1, 0.85]: round 3 a little faster
//   tune.little / tune.big          { cards: { window, demo, poseHold, freeze, ... } }
//   text: { cards: {...}, hit, miss, struggle, rounds, goal }
//   beats: { start, end }           story moments in the stage
//   islandEnd(g)                    the island after this game (Skip / Continue)
//
// Mimi demonstrates mirrored, like a dance teacher facing the class: for "step to the left" she
// moves to the child's left on screen (her own right), and the arrow shows the child's own side.

import { sfx } from '../core/audio.js';
import { saveBest } from '../core/director.js';
import { createTrialsSim, createTrialsBot } from './trials-sim.js';
import { playSetPiece, MOVE_TEXT } from './set-piece.js';
import { POSE_ARMS } from './pose-match.js';
import { coach, fill, pick } from './common.js';

const TEXT = {
  jump: { title: 'Jump!', camera: 'A big jump!', keys: 'Press Space.' },
  jumps: { title: 'Jump {n} times!', camera: 'Jump, jump, jump!', keys: 'Press Space {n} times.' },
  squat: { title: 'Squat down! Hold it!', camera: 'Bend your knees low.', keys: 'Hold S or ↓.' },
  squats: { title: 'Squat 3 times!', camera: 'Down and up, down and up!', keys: 'Tap S or ↓ 3 times.' },
  lean: { title: 'Lean!', camera: 'Lean your body to a side.', keys: 'Hold A or D.' },
  leanSide: { title: 'Lean to the {side}!', camera: 'Lean your body that way.', keys: 'Hold {key}.' },
  freeze: { title: 'Freeze!', camera: 'Be a statue. Hold still!', keys: 'Let go of every key.' },
  dancePrep: { title: 'Dance, dance!', camera: 'Wiggle! Then freeze when Mimi says!', keys: 'Press any keys!' },
  step: { title: 'Step to the {side}!', camera: 'Move your whole body.', keys: 'Hold ← or →.' },
  steps: { title: 'Step: {list}!', camera: 'Move your whole body.', keys: 'Use ← and →.' },
  reach: { title: 'Reach up high! Hold it!', camera: 'Both arms up.', keys: 'Hold W or ↑.' },
  reaches: { title: 'Arms up, then down! 3 times!', camera: 'Up... and down!', keys: 'Tap W or ↑ 3 times.' },
  pose: { title: 'Make a {pose}!', camera: 'Copy Mimi and hold still.', keys: 'Hold {key}.' },
  poses: { title: 'A {pose}, then a {pose2}!', camera: 'Copy Mimi and hold still.', keys: 'Hold {key}, then {key2}.' },
  dance: { title: 'Dance party!', camera: 'Dance any way you like!', keys: 'Press any keys!' },
  watch: { title: 'Watch Mimi…', camera: '', keys: '' },
};
const POSE_KEY = { star: '1', bridge: '2', moon: '3' };
const ROUND_CHEER = 2.6; // seconds of celebration at the end of a round

export default {
  id: 'trials',
  moves: ['jump', 'squat', 'lean', 'freeze', 'step-left', 'step-right', 'arms-up', 'star', 'bridge', 'moon'],
  ownsResult: true,

  async run(g, a, stage) {
    const { ui, input } = g;
    const age = g.settings.age;
    const T = a.text ?? {};
    const arena = stage.arena;
    const host = stage.cast[a.host];
    const copycats = (a.copycats ?? []).map(k => stage.cast[k]);
    const sim = createTrialsSim({ age, seed: a.seed ?? (Date.now() & 0xffff), rounds: a.rounds, tune: a.tune.cards, windowScale: a.windowScale });
    const bot = g.debugAutoplay ? createTrialsBot(sim) : null;
    g.trialsSim = sim; // for the dev console and browser tests
    const totalCards = a.rounds.reduce((s, r) => s + r.cards.length, 0);
    let cardsDone = 0, stop = false, finished = false, cantSeeUntil = 0, t = 0;

    arena.reset();
    if (a.beats?.start) await a.beats.start(g, stage, { host, sim });
    g.needsBody = true;
    ui.runHud({ progress: 0, count: 0, sparks: true, onStop: () => { stop = true; } });

    try {
      while (!finished) {
        await g.frame();
        t += g.dt;
        const frameInput = bot
          ? bot(g.dt)
          : { zone: input.zone, jump: input.consumeJump(), duck: input.duck, lean: input.lean, armsUp: input.armsUp, armsDown: input.armsDown, pose: input.pose, stillFor: input.stillFor, tracking: input.tracking };
        sim.update(frameInput, g.dt);

        for (const e of sim.events) {
          switch (e.type) {
            case 'card':
              g.log('card.start', { card: e.card.type, round: e.round, index: e.index, struggling: e.struggling });
              ui.arrow(null);
              coach(g, 'stand', TEXT.watch);
              for (const c of copycats) watch(c, host);
              break;
            case 'demo':
              demonstrate(g, host, e.card, e.reps, arena);
              break;
            case 'go':
              showCard(g, e.card);
              sfx.pop();
              break;
            case 'freezeNow':
              ui.bark(host, 'FREEZE!', 1.4, { voice: true });
              coach(g, 'stand', TEXT.freeze);
              sfx.cue('duck', 0);
              break;
            case 'count':
              sfx.count(e.n);
              break;
            case 'hit':
              cardsDone++;
              ui.arrow(null);
              ui.setCoachProgress(0);
              if (e.lit) arena.lightTile(e.round, e.index);
              sfx.count(Math.min(12, e.index + e.round * 2));
              if (e.card.type === 'dance') {
                for (const c of [host, ...copycats]) c.state = 'idle';
              } else {
                ui.bark(host, pick(T.hit ?? ['Bravo!'], sim.stats.hits), 1.2, { voice: true });
                if (age === 'big' && e.combo >= 3) arena.combo(e.combo);
              }
              g.log('card.hit', { card: e.card.type });
              break;
            case 'miss':
              cardsDone++;
              ui.arrow(null);
              ui.setCoachProgress(0);
              sfx.wobble();
              ui.bark(host, T.miss ?? 'Nearly! Try this one!', 1.6, { voice: true });
              g.log('card.miss', { card: e.card.type });
              break;
            case 'struggle':
              g.log('help', { kind: e.trackingPoor ? 'cantSee' : 'struggle' });
              if (e.trackingPoor) {
                coach(g, 'stand', MOVE_TEXT.cantSee);
                cantSeeUntil = t + 4;
              } else {
                ui.bark(host, T.struggle ?? "Let's do it together, slowly!", 2.2, { voice: true });
              }
              break;
            case 'roundEnd': {
              ui.hideCoach();
              ui.arrow(null);
              ui.preview = null;
              g.log('round.end', { round: e.round, tiles: e.tiles });
              g.needsBody = false;
              faceChild(host, arena);
              for (const c of copycats) c.root.rotation.z = 0;
              // Every ring ends fully lit (stars and score still use the real hit rate).
              await arena.celebrateRing(g, Math.min(e.round, a.rounds.length - 1), sim.endless);
              if (!sim.endless) {
                ui.bark(host, pick(T.rounds ?? ['Bravo!'], e.round), 2.2, { voice: true });
                const lock = a.locks?.[e.round];
                if (lock) await playSetPiece(g, stage, { helper: a.host, ...lock }, { hero: host, keepHero: true, heroState: 'idle' });
                faceChild(host, arena);
                for (const c of copycats) c.state = 'idle';
              }
              g.needsBody = true;
              sim.nextRound();
              break;
            }
            case 'done': {
              ui.hideCoach();
              g.needsBody = false;
              if (a.beats?.end) await a.beats.end(g, stage, { host, sim });
              const choice = await result(g, a, sim, false);
              if (choice === 'more') {
                g.needsBody = true;
                ui.runHud({ endless: true });
                sim.continueEndless();
              } else {
                finished = true;
              }
              break;
            }
          }
        }
        sim.events.length = 0;
        if (stop && !finished) {
          await result(g, a, sim, true);
          finished = true;
        }
        if (cantSeeUntil && t >= cantSeeUntil) {
          cantSeeUntil = 0;
          if (sim.phase === 'window') showCard(g, sim.card);
        }

        // Poppy and Nutty copy the child, but only while it's the child's turn.
        if (sim.phase === 'window') for (const c of copycats) mirrorChild(c, frameInput, g.dt);
        if (sim.phase === 'window' && sim.card.type === 'dance') arena.sparkleRing(Math.min(sim.round, a.rounds.length - 1));
        ui.setCoachProgress(sim.phase === 'window' ? sim.progress : 0);
        ui.runHud({ progress: sim.endless ? null : Math.min(1, cardsDone / totalCards), count: sim.stats.hits, stars: sim.stats.combo >= 3 && age === 'big' ? sim.stats.combo : 0 });
      }
      a.islandEnd?.(g);
    } finally {
      g.trialsSim = null;
      g.needsBody = false;
      ui.runHud(null);
      ui.hideCoach();
      ui.arrow(null);
      ui.preview = null;
    }
  },

  reset() {},

  finish(g, a) {
    a.islandEnd?.(g);
  },
};

// The card on screen once it's the child's turn: what to do, in words and a picture. Sides are
// the child's own (the camera picture is mirrored like a mirror), so the arrow points that way.
function showCard(g, c) {
  const { ui } = g;
  let fig = 'stand', entry;
  ui.preview = null;
  switch (c.type) {
    case 'jump':
      fig = 'jump';
      entry = c.need > 1 ? fillAll(TEXT.jumps, { n: c.need }) : TEXT.jump;
      break;
    case 'squat':
      fig = 'duck';
      entry = c.variant === 'quick' ? TEXT.squats : TEXT.squat;
      break;
    case 'lean':
      fig = `lean-${c.side ?? 'left'}`;
      entry = c.side ? fillAll(TEXT.leanSide, { side: c.side, key: c.side === 'left' ? 'A' : 'D' }) : TEXT.lean;
      if (c.side) ui.arrow(c.side);
      break;
    case 'freeze':
      // Big dances first, then Mimi calls "Freeze!" (event freezeNow).
      entry = g.settings.age === 'big' ? TEXT.dancePrep : TEXT.freeze;
      fig = entry === TEXT.dancePrep ? 'star' : 'stand';
      break;
    case 'step':
      fig = c.sides[0];
      entry = c.sides.length > 1 ? fillAll(TEXT.steps, { list: c.sides.join(', ') }) : fillAll(TEXT.step, { side: c.sides[0] });
      ui.arrow(c.sides[0]);
      ui.preview = { zones: true, target: c.sides[0] };
      break;
    case 'reach':
      fig = c.variant === 'pumps' ? 'pump' : 'star';
      entry = c.variant === 'pumps' ? TEXT.reaches : TEXT.reach;
      break;
    case 'pose':
      fig = c.poses[0];
      entry = c.poses.length > 1
        ? fillAll(TEXT.poses, { pose: c.poses[0], pose2: c.poses[1], key: POSE_KEY[c.poses[0]], key2: POSE_KEY[c.poses[1]] })
        : fillAll(TEXT.pose, { pose: c.poses[0], key: POSE_KEY[c.poses[0]] });
      break;
    case 'dance':
      fig = 'star';
      entry = TEXT.dance;
      break;
  }
  coach(g, fig, entry);
}

const fillAll = (entry, values) => Object.fromEntries(Object.entries(entry).map(([k, v]) => [k, fill(v, values)]));

// Mimi shows the move, facing the child, mirrored: the child's left is screen-left, which for
// Mimi facing the camera is her own right (world -x). `reps` 2 = show it twice (help).
// A new demo stops the one before (a quick child can finish a card while Mimi is still showing
// it): each await checks it is still the current demo.
let demoId = 0;
async function demonstrate(g, b, c, reps, arena) {
  const id = ++demoId;
  const home = arena.hostSpot;
  const towards = side => (side === 'left' ? -1 : 1); // screen side, in world x
  b.place(home.x, home.z, home.y).faceNow(home.x, home.z + 10);
  b.state = 'idle';
  b.root.rotation.z = 0;
  const wait = async s => {
    await g.wait(s);
    if (id !== demoId) throw STOP;
  };
  const go = async promise => {
    await promise;
    if (id !== demoId) throw STOP;
  };
  try {
    await show(g, b, c, reps, home, towards, wait, go);
  } catch (e) {
    if (e !== STOP) throw e;
  }
}
const STOP = Symbol('demo stopped');

async function show(g, b, c, reps, home, towards, wait, go) {
  for (let r = 0; r < reps; r++) {
    switch (c.type) {
      case 'jump':
        for (let i = 0; i < (c.need ?? 1); i++) await go(b.hop(home.clone(), 0.8, 0.32));
        break;
      case 'squat':
        b.state = 'duck';
        await wait(c.variant === 'quick' ? 0.22 : 0.5);
        if (c.variant === 'quick') {
          for (let i = 0; i < 2; i++) {
            b.state = 'idle';
            await wait(0.16);
            b.state = 'duck';
            await wait(0.2);
          }
        }
        b.state = 'idle';
        break;
      case 'lean': {
        const s = towards(c.side ?? 'left');
        await go(g.tween(0.22, k => { b.root.rotation.z = -s * 0.35 * k; }));
        await wait(0.25);
        await go(g.tween(0.2, k => { b.root.rotation.z = -s * 0.35 * (1 - k); }));
        break;
      }
      case 'freeze':
        b.state = 'dance';
        await wait(0.3);
        b.state = 'pose';
        b.pose = POSE_ARMS.bridge;
        await wait(0.5);
        b.state = 'idle';
        break;
      case 'step':
        for (const side of c.sides) {
          await go(b.walkTo(home.x + towards(side) * 1.3, home.z, 6));
          b.faceNow(b.x, b.z + 10);
          await wait(0.08);
        }
        await go(b.walkTo(home.x, home.z, 6));
        b.faceNow(home.x, home.z + 10);
        break;
      case 'reach':
        b.state = 'pose';
        if (c.variant === 'pumps') {
          for (let i = 0; i < 3; i++) {
            b.pose = POSE_ARMS.star;
            await wait(0.15);
            b.pose = [0.35, 0.35];
            await wait(0.15);
          }
        } else {
          b.pose = POSE_ARMS.star;
          await wait(0.6);
        }
        b.state = 'idle';
        break;
      case 'pose':
        b.state = 'pose';
        for (const p of c.poses) {
          // Mirrored: her arms swap sides, so the moon's raised arm is on the child's side.
          const [l, r2] = POSE_ARMS[p];
          b.pose = [r2, l];
          await wait(0.5);
        }
        b.state = 'idle';
        break;
      case 'dance':
        b.state = 'dance';
        return; // she keeps dancing through the card
    }
    if (r < reps - 1) await wait(0.2);
  }
}

// Mimi back on her spot, facing the child (her dance spins her round).
function faceChild(b, arena) {
  const home = arena.hostSpot;
  b.place(home.x, home.z, home.y).faceNow(home.x, home.z + 10);
  b.state = 'idle';
  b.root.rotation.z = 0;
}

// During Mimi's demo the copycats look at her.
function watch(b, host) {
  b.state = 'idle';
  b.root.rotation.z = 0;
  b.faceNow(host.x, host.z);
}

// In the child's turn the copycats copy the child: crouch, lean, arms, poses, jumps, dancing.
function mirrorChild(b, inp, dt) {
  b.faceNow(b.x, b.z + 10);
  if (inp.jump && !b.hopping) b.hop(b.root.position.clone().setY(0), 0.8, 0.4);
  const lean = inp.lean === 'left' ? 1 : inp.lean === 'right' ? -1 : 0; // mirrored, like Mimi
  b.root.rotation.z += (lean * 0.3 - b.root.rotation.z) * Math.min(1, dt * 8);
  if (inp.duck) b.state = 'duck';
  else if (inp.pose) {
    b.state = 'pose';
    const [l, r] = POSE_ARMS[inp.pose];
    b.pose = [r, l];
  } else if (inp.armsUp) {
    b.state = 'pose';
    b.pose = POSE_ARMS.star;
  } else b.state = 'idle';
}

// Result card: cards won, best combo (Big), score; saves the best. Resolves 'more' or 'story'.
async function result(g, a, sim, endless) {
  const stars = sim.starsEarned();
  const s = sim.stats;
  const res = { score: s.score, hits: s.hits, judged: sim.judged, stars, bestCombo: s.bestCombo };
  const best = saveBest(a.id, g.settings.age, res);
  sfx.chime();
  const rows = [['Moves copied', `${s.hits} / ${sim.judged}`]];
  if (g.settings.age === 'big') rows.push(['Best combo', s.bestCombo]);
  rows.push(['Score', s.score], ['Best', best.score]);
  const choice = await g.ui.runResult({ title: endless ? 'What a show!' : (a.text?.goal ?? 'Bravo!'), stars, rows, more: !endless });
  g.log('result', { ...res, endless, choice });
  return choice;
}
