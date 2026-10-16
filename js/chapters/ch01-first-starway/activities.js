// Chapter 1 · The First Starway · the movement activities.
// Each entry picks a reusable engine (js/activities/) and sets it up for this chapter:
//   label      the name people see, e.g. in the Story panel
//   engine     which engine runs it
//   hero       the buddy who reacts
//   goal       the objective line at the top left
//   tune       difficulty: `all` for everyone, then `little` (3-6) / `big` (7-12) overrides
//   text       everything said or shown during the activity
//   stones / target / machine / lock    which world object the engine moves
//
// To make a new version for another chapter, copy an entry into that chapter's activities.js
// and change the words, numbers and world object. The engine stays the same.

import { LINES } from './lines.js';
import * as S from './run-scenes.js';

const R = LINES.starStoneRun;
const P = LINES.skyPower;
const G = LINES.gateTrials;

export const ACTIVITIES = {
  // Star Stone Run: a runner game down the Sky River (replaces Cross the Stones in chapter.js).
  // Legs are the same TIME for both ages; Big runs faster with busier patterns.
  //
  // LENGTH KNOBS (if playtests come in short, in this order):
  //   1. Bridges: each bridge below has one more step ready, commented out. Remove the `//`.
  //   2. Leg time: tune.all.legSeconds (every running leg lasts this long; 80 now, ~95 next).
  //   3. Last resort: a fourth leg (copy a leg and give it a setPiece).
  starStoneRun: {
    id: 'ch01.star-stone-run',
    label: 'Chapter 1 · Star Stone Run',
    engine: 'runner',
    stage: 'sky-river',
    hero: 'poppy',
    place: ['The Sky River', 'Down the old bridge'],
    goal: R.goal,
    legs: [
      { teach: { lanes: [-1, 1], timeout: 40 }, theme: 'mint', patterns: ['bun-line'], coach: R.teach, doneBark: R.teachDone },
      {
        theme: 'mint', setPiece: 'bridge1',
        patterns: { little: ['bun-line', 'puff', 'gap', 'puff-buns', 'gap-buns', 'star-stone'], big: ['puff', 'gap', 'puff-buns', 'gap-buns', 'puff-gap', 'double-gap', 'star-stone'] },
      },
      {
        theme: 'lilac', tier: 2, setPiece: 'bridge2', bark: R.legs.lilac,
        patterns: { little: ['branch', 'wobble', 'puff', 'gap-buns', 'bun-arc', 'star-stone'], big: ['branch', 'wobble', 'puff-gap', 'bun-arc', 'double-gap', 'star-stone'] },
      },
      {
        theme: 'peach', tier: 3, setPiece: 'lastBridge', bark: R.legs.peach,
        patterns: { little: ['wall-jump', 'sunk', 'branch-wobble', 'puff-gap', 'bun-arc', 'puff-buns', 'star-stone'], big: ['wall-jump', 'sunk', 'branch-wobble', 'zigzag', 'double-gap', 'bun-arc', 'puff-buns', 'star-stone'] },
      },
    ],
    setPieces: {
      bridge1: {
        scene: 'bridge1', helper: 'nutty', intro: R.bridge1.intro, cheer: R.cheers[0], after: S.nuttyDriftsOn,
        steps: [
          { move: 'jump', times: { little: 3, big: 4 }, text: R.bridge1.stomp, does: 'stomp', done: R.bridge1.stomped },
          // { move: 'pose', sequence: ['star'], hold: { little: 0.8, big: 1.2 }, text: R.extra.shine, does: 'shine' },
        ],
      },
      bridge2: {
        scene: 'bridge2', helper: 'nutty', intro: R.bridge2.intro, cheer: R.cheers[1], after: S.nuttyDriftsOn,
        steps: [
          { move: 'armsUp', hold: 1.4, text: R.bridge2.lift, done: R.bridge2.lifted, does: 'lift' },
          { move: 'jump', times: 2, text: R.bridge2.hop, does: 'settle' },
          // { move: 'pump', times: { little: 4, big: 6 }, text: R.extra.pump, does: 'firm' },
        ],
      },
      lastBridge: {
        scene: 'lastBridge', helper: 'nutty', intro: R.lastBridge.intro, cheer: R.cheers[2], after: S.poppyLeapsToNutty,
        steps: [
          { move: 'step', sequence: ['left', 'right', 'left'], hold: 0.6, text: R.lastBridge.push, does: 'push' },
          // { move: 'armsUp', hold: 1.2, text: R.extra.steady, does: 'steady' },
          { move: 'jump', times: 1, text: R.lastBridge.leap, does: 'leap' },
        ],
      },
    },
    beats: { start: S.starStoneStart, end: S.starStoneEnd, resume: S.starStoneResume },
    tune: {
      all: { legSeconds: 80 },
      little: { speed: { start: 7.5, max: 10.5 }, breatherEvery: 180 },
      big: { speed: { start: 10, max: 15 }, breatherEvery: 240 },
    },
    text: { hit: R.hit, goal: R.result },
    // The island after this game (also for Skip and Continue): Poppy is across the old bridge
    // with Nutty, and the stones wobble again, so they are both stuck. Same as Cross the Stones.
    islandEnd(g) {
      const bridge = g.W.bridge;
      bridge.stones.forEach(s => {
        s.userData.sunk = false;
        s.userData.raise = 1;
      });
      bridge.drift = g.settings.age === 'big' ? 1.25 : 0.55;
      bridge.highlight(-1, false);
      g.B.poppy.place(bridge.landing.x, bridge.landing.z, bridge.landing.y);
    },
  },

  // Sky Power: Lumi's dish flies above the clouds (replaces Aim the Dish and Turn the Sky Crank).
  // Fly mode: step for lanes, arms up / down for two heights; Big also leans into gusts.
  // Same length knobs as the Star Stone Run (tune.all.legSeconds, spare steps below).
  skyPower: {
    id: 'ch01.sky-power',
    label: 'Chapter 1 · Sky Power',
    engine: 'runner',
    mode: 'fly',
    stage: 'sky-above',
    hero: 'lumi',
    place: ['Above the Clouds', "Lumi's flying dish"],
    goal: P.goal,
    meter: { fullAt: 100 }, // sparks for a full charge meter
    legs: [
      { teach: { lanes: [-1, 1], timeout: 40 }, theme: 'gold', heights: false, patterns: ['spark-line'], coach: P.teach, doneBark: P.teachDone },
      {
        theme: 'gold', setPiece: 'findSignal', heights: { little: false, big: true },
        patterns: { little: ['spark-line', 'storm', 'storm-sparks', 'ring', 'storm-ring'], big: ['spark-line', 'storm', 'storm-sparks', 'storm-ring', 'rock-low', 'arch-high'] },
      },
      {
        theme: 'sunset', tier: 2, setPiece: 'crankJam', bark: P.legs.sunset, coach: P.heights, coachFigure: 'up', coachFor: 8,
        patterns: { little: ['spark-line', 'rock-low', 'arch-high', 'storm-ring', 'ring'], big: ['rock-low', 'arch-high', 'hi-lo', 'storm-wall', 'ring-chain', 'storm-ring'] },
      },
      {
        theme: 'stars', tier: 3, setPiece: 'fullPower', bark: P.legs.stars,
        // Big leans into wind gusts; Little gets more lane changes instead.
        patterns: { little: ['rock-low', 'arch-high', 'storm-wall', 'ring-chain', 'storm-sparks', 'hi-lo'], big: ['hi-lo', 'gust', 'gust-sparks', 'storm-wall', 'ring-chain', 'rock-low', 'arch-high'] },
      },
    ],
    setPieces: {
      findSignal: {
        scene: 'findSignal', helper: 'lumi', intro: P.findSignal.intro, cheer: P.cheers[0],
        steps: [
          // The last side is where the gate is (right), as in the old Aim the Dish.
          { move: 'step', sequence: { little: ['left', 'right'], big: ['left', 'right', 'left', 'right'] }, hold: 0.6, text: P.findSignal.step, does: 'sweep', done: P.findSignal.found },
          // { move: 'armsUp', hold: 1, text: P.extra.lock, does: 'lock' },
        ],
      },
      crankJam: {
        scene: 'crankJam', helper: 'lumi', intro: P.crankJam.intro, cheer: P.cheers[1],
        steps: [
          { move: 'pump', times: { little: 5, big: 8 }, text: P.crankJam.pump, does: 'crank', done: P.crankJam.fixed },
          // { move: 'armsUp', hold: 1.2, text: P.extra.hold, does: 'hold' },
        ],
      },
      fullPower: {
        scene: 'fullPower', helper: 'lumi', intro: P.fullPower.intro, cheer: P.cheers[2],
        steps: [
          { move: 'pump', times: 6, text: P.fullPower.pump, does: 'charge' },
          // { move: 'pump', times: { little: 3, big: 5 }, text: P.extra.boost, does: 'boost' },
          { move: 'pose', sequence: ['star'], hold: 1, text: P.fullPower.star, does: 'fire', done: P.fullPower.done },
        ],
      },
    },
    beats: { start: S.skyPowerStart, end: S.skyPowerEnd },
    tune: {
      all: { legSeconds: 80 },
      little: { speed: { start: 7.5, max: 11 }, breatherEvery: 180 },
      big: { speed: { start: 10, max: 16 }, breatherEvery: 240 },
    },
    text: { hit: P.hit, goal: P.result, collect: 'Sparks' },
    // The island after this game (also for Skip and Continue): the dish points at the gate and
    // the crank is full, exactly as Aim the Dish and Turn the Sky Crank left it.
    islandEnd(g) {
      g.W.crank.turnDish(0);
      g.W.crank.setCharge(1);
      g.B.lumi.state = 'work';
    },
  },

  // Gate Trials: copy Mimi inside the sleeping gate (replaces Copy the Poses). Rounds of 8 cards:
  // 5 active, 1 Freeze (a rest), 1 Mimi's choice, 1 Dance Party (never judged). A crystal lock
  // after each round. Length knobs: more cards per round, or a fourth round.
  gateTrials: {
    id: 'ch01.gate-trials',
    label: 'Chapter 1 · Gate Trials',
    engine: 'trials',
    stage: 'crystal-arena',
    host: 'mimi',
    copycats: ['poppy', 'nutty'],
    place: ['Inside the Gate', 'The crystal stage'],
    goal: G.goal,
    rounds: [
      { cards: ['jump', 'step', 'reach', 'jump', 'step', 'freeze', 'choice', 'dance'] },
      { cards: ['squat', 'lean', 'jump', 'squat', 'lean', 'freeze', 'choice', 'dance'] },
      { cards: ['pose', 'squat', 'lean', 'step', 'reach', 'freeze', 'choice', 'dance'] },
    ],
    windowScale: [1, 1, 0.85], // round 3 a little faster
    locks: [
      {
        scene: 'lockStar', intro: G.lockStar.intro, cheer: G.open[0], after: S.lockShatters,
        steps: [{ move: 'pose', sequence: ['star'], hold: { little: 0.8, big: 1.3 }, text: G.lockStar.star, does: 'glow' }],
      },
      {
        scene: 'lockBridge', intro: G.lockBridge.intro, cheer: G.open[1], after: S.lockShatters,
        steps: [
          { move: 'pose', sequence: ['bridge'], hold: { little: 0.8, big: 1.3 }, text: G.lockBridge.bridge, does: 'glow' },
          { move: 'pose', sequence: ['bridge', 'star'], hold: { little: 0.8, big: 1.0 }, text: G.lockBridge.then, does: 'glow' },
        ],
      },
      {
        scene: 'lockMoon', intro: G.lockMoon.intro, cheer: G.open[2], after: S.lockShatters,
        steps: [
          { move: 'pose', sequence: ['moon'], hold: { little: 0.8, big: 1.3 }, text: G.lockMoon.moon, does: 'glow', after: S.moonGag },
          { move: 'pose', sequence: ['star', 'bridge', 'moon'], hold: { little: 0.8, big: 1.0 }, text: G.lockMoon.all, does: 'glow' },
        ],
      },
    ],
    beats: { start: S.gateTrialsStart, end: S.gateTrialsEnd },
    tune: {
      little: { cards: { window: 3.5, demo: 1.8, poseHold: 0.8, freeze: 2, squatHold: 0.6, reachHold: 1 } },
      big: { cards: { window: 2.2, demo: 1.2, poseHold: 1.3, freeze: 3, squatHold: 1, reachHold: 1 } },
    },
    text: { hit: G.hit, miss: G.miss, struggle: G.struggle, rounds: G.rounds, goal: G.result },
    // The island after this game (also for Skip and Continue): the gate's pictures all lit,
    // exactly as Copy the Poses left it.
    islandEnd(g) {
      g.W.gate.glyphs.forEach((_, i) => g.W.gate.setGlyph(i, 3));
    },
  },

  // The original stone crossing on the island (kept as a fallback; not in chapter.js now).
  crossStones: {
    id: 'ch01.cross-stones',
    label: 'Chapter 1 · Cross the Stones',
    engine: 'hop-stones',
    hero: 'poppy',
    place: ['The Old Bridge', 'Edge of Star Square'],
    goal: 'Help Poppy hop across the stones',
    stones: W => W.bridge,
    tune: {
      all: { sunk: [2] },
      little: { drift: 0.55, tolerance: 0.7, liftTime: 1.4 },
      big: { drift: 1.25, tolerance: 0.4, liftTime: 1.4 },
    },
    text: {
      jump: { title: 'Jump when the stone glows!', camera: 'Wait for the glow. Then jump!', keys: 'Press Space when it glows.' },
      lift: { title: 'Arms up! Lift the stone!', camera: 'Reach up high and hold.', keys: 'Hold W or ↑.' },
      jumpAgain: { title: 'Now jump again!', camera: 'Wait for the glow. Then jump!', keys: 'Press Space when it glows.' },
      sank: 'Oh no! It sank!',
      lifted: 'You lifted it!',
      early: 'Whoa! Wait for the glow!',
      first: 'Wheee!',
      almost: 'Almost there!',
      done: 'You crossed the stones!',
    },
  },

  aimDish: {
    id: 'ch01.aim-dish',
    label: 'Chapter 1 · Aim the Dish',
    engine: 'side-step',
    hero: 'lumi',
    place: ["Lumi's Workshop", 'Star Square'],
    goal: "Point Lumi's dish at the gate",
    // Seen from the south: aim -1 points the dish left (west), 0 at you, 1 right at the gate.
    target: W => ({ aim: k => W.crank.turnDish((1 - k) * Math.PI / 2) }),
    tune: {
      all: { hold: 0.6, startAim: 1, finalAim: 1, shot: { pos: [21, 3.2, 14.5], look: [18.3, 2.2, 8] } },
      little: { sequence: ['left', 'right'] },
      big: { sequence: ['left', 'right', 'left', 'right'] },
    },
    text: {
      step: { title: 'Step to the {side}!', camera: 'Move your whole body.', keys: 'Hold ← or →.' },
      middle: { title: 'Back to the middle!', camera: 'Stand in the middle part.', keys: 'Let go of the arrow key.' },
      miss: ['Not there!', 'Hmm, not there!', 'Closer!'],
      found: 'There is the gate!',
      done: 'The dish points at the gate!',
    },
  },

  skyCrank: {
    id: 'ch01.sky-crank',
    label: 'Chapter 1 · Turn the Sky Crank',
    engine: 'arm-pump',
    hero: 'lumi',
    place: ["Lumi's Workshop", 'Star Square'],
    goal: "Turn Lumi's Sky Crank",
    machine: W => W.crank,
    tune: {
      all: { restState: 'work', shot: { pos: [14.6, 3.2, 3.9], look: [17.7, 1.3, 8.5] } },
      little: { pumps: 5 },
      big: { pumps: 8 },
    },
    text: {
      pump: { title: 'Arms up, then down!', camera: 'Up... and down! Again!', keys: 'Tap W or ↑ again and again.' },
      cheers: ['More!', 'Faster!', "It's working!", 'Keep going!', 'Almost!', 'So close!'],
      full: 'FULL POWER!',
      done: 'The Sky Crank is full!',
    },
  },

  gatePoses: {
    id: 'ch01.gate-poses',
    label: 'Chapter 1 · Copy the Gate Poses',
    engine: 'pose-match',
    place: ['Gate Rock', 'Across the old bridge'],
    goal: 'Copy the pictures on the gate',
    lock: W => W.gate,
    copycats: ['poppy', 'nutty'],
    oops: { nutty: { moon: [2.6, 0.35] } }, // Nutty does the moon with the wrong arm
    tune: {
      little: { hold: 0.8 },
      big: { hold: 1.3 },
    },
    text: {
      poses: {
        star: { title: 'Make a star!', camera: 'Both arms up. Hold still...', keys: 'Hold 1.' },
        bridge: { title: 'Make a bridge!', camera: 'Arms out wide. Hold still...', keys: 'Hold 2.' },
        moon: { title: 'Make a moon!', camera: 'One arm up. Hold still...', keys: 'Hold 3.' },
      },
      barks: [['poppy', 'A star!'], ['poppy', 'A bridge!'], ['nutty', 'Am I a moon?']],
      done: 'The gate is awake!',
    },
  },
};
