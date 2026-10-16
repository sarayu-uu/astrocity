// Chapter 1 · The First Starway · everything the buddies SAY in the story scenes.
// Edit the words here; the scenes (scenes.js) decide when each line plays.
// Keep lines short: one idea per line, simple words, read aloud in about 3 seconds.
//
// Each line is [who, text] or [who, text, options]:
//   who       'poppy' | 'nutty' | 'lumi' | 'mimi' | 'zuzu' | null (narrator)
//   options   { choices: ['Button text'] } waits for a click
//             { auto: 3 } moves on by itself after 3 seconds

export const LINES = {
  arrival: {
    nuttyTeases: ['nutty', 'Poppy, you pulled that all morning!', { auto: 3 }],
    poppyPulls: ['poppy', "It's... so... STUCK!", { auto: 2.6 }],
    hello: ['poppy', 'Hi! You came! Look, I found a magic stone!', { choices: ['Say hi!'] }],
    itGlows: ['poppy', 'It glows! Nutty, look! ...Nutty?'],
    bun: ['poppy', 'Nutty left his bun. Nutty NEVER leaves his bun!'],
    letsAsk: ['poppy', "Something is wrong. Let's ask our friends."],
  },

  askAround: {
    goal: 'Find Nutty. Click a friend to ask.',
    lumi: [
      ['lumi', 'Wow! A glowing stone!'],
      ['poppy', 'Lumi, have you seen Nutty?'],
      ['lumi', "No. I'm busy. I'm fixing my Sky Crank."],
    ],
    mimi: [
      ['mimi', 'Hello, darlings! Want to see my dance?'],
      ['poppy', 'Mimi, have you seen Nutty?'],
      ['mimi', 'Yes! He walked past the fountain. That way!'],
    ],
    zuzu: [
      ['poppy', 'Zuzu? ZUZU! Wake up!'],
      ['zuzu', 'Mmm... five more minutes...'],
      ['poppy', 'Have you seen Nutty?'],
      ['zuzu', 'He went to the old bridge. He saw a big potato.'],
      ['poppy', 'The old bridge? But it is broken!'],
    ],
    again: {
      poppy: 'Where are you, Nutty?',
      lumi: 'Fix, fix, fix!',
      mimi: 'Five, six, seven, eight!',
      zuzu: 'Zzz... potato...',
    },
    hint: 'Zuzu sees everything. He sleeps under the big tree.',
    zuzuNext: "Look, it's Zuzu! The green one. Let's ask him!",
  },

  toBridge: {
    goal: 'Follow Poppy to the old bridge',
    letsGo: ['poppy', 'Nutty is at the old bridge. Come on!', { choices: ['Go!'] }],
    overHere: ['nutty', 'Poppy! Over here! I found a big potato!'],
    how: ['poppy', 'Nutty! How did you get over there?'],
    stones: ['nutty', 'I hopped on the stones. Now they wobble too much!'],
    help: ['nutty', "I can't get back. Help!"],
    letsHop: ['poppy', "Let's hop across and get him!", { choices: ['Help Poppy'] }],
  },

  // The Star Stone Run (a runner game on the Sky River). Lines with `auto` move on by
  // themselves, so a child playing on camera never needs the mouse.
  starStoneRun: {
    goal: 'Follow the buns to Nutty!',
    start: [
      ['poppy', 'Whoa! The stones floated down the river!', { auto: 3 }],
      ['nutty', 'Poppy! Follow my buns! I dropped them!', { auto: 3 }],
    ],
    teach: { title: 'Step left and right to catch the buns!', camera: 'Move your whole body.', keys: 'Hold ← or →.' },
    teachDone: 'Yum! Now run!',
    legs: { lilac: 'The river is purple now!', peach: 'Sunset! Go, go, go!' },
    hit: ['Oops! Keep going!', 'Wobble! You got this!', 'Up we get!', 'Oof! Try again!'],
    bridge1: {
      intro: [['nutty', 'The bridge broke! Stomp the stones down!', { auto: 3 }]],
      stomp: 'Jump! Stomp the stones into a line!',
      stomped: 'The stones are in a line!',
    },
    bridge2: {
      intro: [['nutty', 'Oh no! A stone sank!', { auto: 2.6 }]],
      lift: 'Arms up! Lift the stone!',
      lifted: 'You lifted it!',
      hop: 'Now jump! Make it hold!',
    },
    further: 'Further down! Come on!',
    lastBridge: {
      intro: [['nutty', 'Push the planks to me!', { auto: 2.6 }]],
      push: 'Push the planks! Step to the {side}!',
      leap: 'Big jump to Nutty!',
    },
    cheers: ['We can cross!', 'Yes! Keep going!', 'Hooray!'],
    // Extra bridge steps, ready in activities.js if the game needs to be longer.
    extra: {
      shine: 'Make a star! Make the stones shine!',
      pump: 'Arms up, then down! Make the stones strong!',
      steady: 'Arms up! Hold the planks steady!',
    },
    found: ['nutty', 'Poppy! You found me! And my buns!', { auto: 3.5 }],
    drift: [null, 'Behind them, the stones drift away again.', { auto: 3.5 }],
    result: 'You found Nutty!',
  },

  gateRock: {
    bothStuck: ['nutty', 'You came! But now we are BOTH stuck.'],
    look: ['poppy', 'Look, Nutty. Your potato has a hole on top.'],
    fits: ['poppy', 'My magic stone fits in it!'],
    broke: ['nutty', 'Uh oh. Did we break it?'],
    notPotato: ['lumi', "Poppy! That's not a potato. It's a magic gate!"],
    needsPower: ['lumi', 'It needs power. My Sky Crank makes power!'],
    askHelp: ['lumi', 'First, my dish must point at the gate. Can you help?', { choices: ['Help Lumi'] }],
  },

  // Sky Power (Lumi's dish flies above the clouds). `auto` lines move on by themselves.
  skyPower: {
    goal: 'Catch sparks for the Sky Crank!',
    start: [
      ['lumi', 'My dish can fly! Hold on, Poppy!', { auto: 3 }],
      ['poppy', 'Wheee! We are flying!', { auto: 2.6 }],
      ['lumi', 'Catch the sparks. They power my Sky Crank!', { auto: 3.2 }],
    ],
    teach: { title: 'Step left and right to catch the sparks!', camera: 'Move your whole body.', keys: 'Hold ← or →.' },
    teachDone: 'Zap! Now we fly!',
    heights: { title: 'Arms up: fly high. Arms down: fly low.', camera: 'Reach up to go up. Arms down to go down.', keys: 'Hold W or ↑ to fly high.' },
    legs: { sunset: 'Arms up to fly high! Arms down to fly low!', stars: 'Look! The stars are out!' },
    hit: ['Whoa! Hold on!', 'Bumpy! Keep going!', 'Oops! We are OK!', 'Wobble! Steady!'],
    findSignal: {
      intro: [['lumi', 'My dish must find the gate. Step to sweep the sky!', { auto: 3.2 }]],
      step: 'Step to the {side}! Sweep the dish!',
      found: 'There is the gate!',
    },
    crankJam: {
      intro: [['lumi', 'Oh no! A gear popped out!', { auto: 2.6 }]],
      pump: 'Arms up, then down! Turn the crank!',
      fixed: 'Click! Fixed it!',
    },
    fullPower: {
      intro: [['lumi', 'Almost full! Pump, pump, pump!', { auto: 2.6 }]],
      pump: 'Quick! Arms up and down!',
      star: 'Make a big star to fire the beam!',
      done: 'Here it goes!',
    },
    cheers: ['The gate is over there!', 'The crank works!', 'FULL POWER!'],
    // Extra steps, ready in activities.js if the game needs to be longer.
    extra: {
      lock: 'Arms up! Hold the dish steady!',
      hold: 'Arms up! Hold the gear in!',
      boost: 'More! Arms up and down!',
    },
    fire: ['lumi', 'FULL POWER! Point the beam at the gate!', { auto: 3.5 }],
    result: 'Full power!',
  },

  // Sky Pilot (the child flies Lumi's ship with arms out like wings). `auto` lines move on.
  skyPilot: {
    goal: "Fly Lumi's ship! Catch the sparks!",
    start: [
      ['lumi', 'My dish is a ship now! And YOU are the pilot!', { auto: 3.2 }],
      ['lumi', 'Put your arms out like wings. Tip them to steer!', { auto: 3.4 }],
      ['poppy', 'Wheee! We are flying!', { auto: 2.4 }],
    ],
    teach: { title: 'Arms out like wings! Tip them to catch the sparks!', camera: 'Tip left to go left. Tip right to go right.', keys: 'Hold ← or → to steer.' },
    teachDone: 'Great flying, pilot!',
    legs: { sunset: 'Storm clouds! Steer around them!', stars: 'Look! The stars are out!' },
    wingsDown: { title: 'Arms out like wings to fly!', camera: 'Arms out wide, like a plane.', keys: '' },
    findSignal: {
      intro: [['lumi', 'Now point my dish at the gate. Tip your wings to sweep the sky!', { auto: 3.4 }]],
      tilt: 'Tip your wings to the {side}!',
      found: 'There is the gate!',
    },
  },

  // Gate Trials (inside the sleeping gate). Mimi hosts; `auto` lines move on by themselves.
  gateTrials: {
    goal: 'Copy Mimi to wake the gate!',
    start: [
      ['mimi', 'Welcome to my crystal stage, darlings!', { auto: 3 }],
      ['mimi', 'Watch me, then copy me! Every move lights a tile!', { auto: 3.4 }],
    ],
    hit: ['Bravo!', 'Yes, darling!', 'Fabulous!', 'Wonderful!', 'Superstar!', 'Gorgeous!'],
    miss: 'Nearly! Try this one!',
    struggle: "Let's do it together, slowly!",
    rounds: ['The first ring is awake!', 'Two rings! Look at them shine!', 'All three rings! Bravo!'],
    lockStar: {
      intro: [['mimi', 'A crystal lock! Make a star to open it!', { auto: 3 }]],
      star: 'Make a star! Hold it!',
    },
    lockBridge: {
      intro: [['mimi', 'Another lock! Now a bridge!', { auto: 2.8 }]],
      bridge: 'Make a bridge! Hold it!',
      then: 'Now a bridge, then a star!',
    },
    lockMoon: {
      intro: [['mimi', 'The last lock: the moon!', { auto: 2.8 }]],
      moon: 'Make a moon! One arm up!',
      oops: ['nutty', 'Am I a moon?', { auto: 2.4 }],
      laugh: ['poppy', 'Ha ha! Other arm, Nutty!', { auto: 2.6 }],
      all: 'All three: star, bridge, moon!',
    },
    open: ['Open!', 'Click!', 'It opens!'],
    awake: ['mimi', 'The gate is awake! Bravo!', { auto: 3.5 }],
    result: 'The gate is awake!',
  },

  beam: {
    pictures: ['poppy', 'The gate has pictures. They look like poses!'],
    copy: ['mimi', 'Poses? I love poses! Copy the pictures, darlings!'],
  },

  starway: {
    oof: ['poppy', 'Oof!'],
    meantIt: ['nutty', 'I meant to do that.'],
    tripped: ['poppy', 'You tripped!'],
    meantTrip: ['nutty', 'I meant to trip.'],
    newPath: ['poppy', 'Look! A new path. It goes to Glow Forest!'],
    food: ['nutty', 'Is there food there?'],
    pack: ['lumi', "Let's find out! I'll pack my tools."],
  },

  freeRoam: {
    goal: 'Glow Forest is next. Chapter 2 is coming soon!',
    barks: {
      poppy: 'Tomorrow: Glow Forest!',
      nutty: 'I will bring three buns.',
      lumi: 'Two cranks means double power!',
      mimi: 'A forest! I will sing there!',
      zuzu: 'Zzz... forest...',
    },
  },
};
