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
