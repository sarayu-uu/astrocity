// Every reusable activity engine, by name. A chapter's activities.js picks an engine here and
// configures it (story text, difficulty, which world objects it moves). To add a new kind of
// activity, write an engine with run / reset / finish and list it below.

import hopStones from './hop-stones.js';
import sideStep from './side-step.js';
import armPump from './arm-pump.js';
import poseMatch from './pose-match.js';

export const ENGINES = {
  [hopStones.id]: hopStones,
  [sideStep.id]: sideStep,
  [armPump.id]: armPump,
  [poseMatch.id]: poseMatch,
};
