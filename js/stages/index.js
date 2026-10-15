// Every activity stage, by name. An activity entry picks one with `stage: 'name'`.

import test from './test-stage.js';
import testTrack from './test-track.js';

export const STAGES = {
  [test.id]: test,
  [testTrack.id]: testTrack,
};
