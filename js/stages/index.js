// Every activity stage, by name. An activity entry picks one with `stage: 'name'`.

import test from './test-stage.js';
import testTrack from './test-track.js';
import skyRiver from './sky-river.js';
import skyAbove from './sky-above.js';

export const STAGES = {
  [skyAbove.id]: skyAbove,
  [test.id]: test,
  [testTrack.id]: testTrack,
  [skyRiver.id]: skyRiver,
};
