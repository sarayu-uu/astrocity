// Chapter 1 · The First Starway
// The running order. Each step is a story scene (scenes.js) or a movement activity
// (activities.js). Reorder, remove or add steps here.
//   name    shown in the Story panel and on "Continue"
//   skip    false hides the Skip button for that scene (default: skippable)

import * as S from './scenes.js';
import { ACTIVITIES as A } from './activities.js';

export default {
  id: 'ch01',
  number: 1,
  title: 'The First Starway',
  setup: S.setup,
  steps: [
    { id: 'arrival', name: 'Poppy finds a stone', scene: S.arrival },
    { id: 'ask-around', name: 'Where is Nutty?', scene: S.askAround },
    { id: 'to-bridge', name: 'The old bridge', scene: S.toBridge },
    { id: 'stone-run', name: 'Star Stone Run', activity: A.starStoneRun },
    { id: 'gate-rock', name: 'The big potato', scene: S.gateRock },
    { id: 'aim-dish', name: 'Aim the dish', activity: A.aimDish },
    { id: 'sky-crank', name: 'Turn the Sky Crank', activity: A.skyCrank },
    { id: 'beam', name: 'The gate wakes up', scene: S.beam },
    { id: 'gate-poses', name: 'Copy the poses', activity: A.gatePoses },
    { id: 'starway', name: 'The Starway comes back', scene: S.starway },
    { id: 'free-roam', name: 'Play in Star Square', scene: S.freeRoam, skip: false },
  ],
};
