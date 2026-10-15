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

export const ACTIVITIES = {
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
