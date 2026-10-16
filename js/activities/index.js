// Every reusable activity engine, by name. A chapter's activities.js picks an engine here and
// configures it (story text, difficulty, which world objects it moves). To add a new kind of
// activity, write an engine with run / reset / finish and list it below.

import hopStones from './hop-stones.js';
import sideStep from './side-step.js';
import armPump from './arm-pump.js';
import poseMatch from './pose-match.js';
import runner from './runner.js';
import setPiece from './set-piece.js';
import trials from './trials.js';

export const ENGINES = {
  [trials.id]: trials,
  [setPiece.id]: setPiece,
  [hopStones.id]: hopStones,
  [sideStep.id]: sideStep,
  [armPump.id]: armPump,
  [poseMatch.id]: poseMatch,
  [runner.id]: runner,
};
