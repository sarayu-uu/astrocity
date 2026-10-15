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

  gateRock: {
    bothStuck: ['nutty', 'You came! But now we are BOTH stuck.'],
    look: ['poppy', 'Look, Nutty. Your potato has a hole on top.'],
    fits: ['poppy', 'My magic stone fits in it!'],
    broke: ['nutty', 'Uh oh. Did we break it?'],
    notPotato: ['lumi', "Poppy! That's not a potato. It's a magic gate!"],
    needsPower: ['lumi', 'It needs power. My Sky Crank makes power!'],
    askHelp: ['lumi', 'First, my dish must point at the gate. Can you help?', { choices: ['Help Lumi'] }],
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
