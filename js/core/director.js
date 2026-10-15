// Plays a chapter: its steps run in order, each one either a story scene or an activity.
// It also owns the story controls that every chapter gets for free:
//   Skip           every scene step shows a Skip button (unless the step says skip: false)
//   Continue       progress is saved per step, so the title can start where you left off
//   Replay         any step you have reached can be played again from the Story panel
//   Play again     after each activity, redo it or keep going
// Starting part-way through works by fast-forwarding the earlier steps behind a curtain, so
// the world is always in the right state and scenes never need special "jump in here" code.

import { ENGINES } from '../activities/index.js';
import { startAmbient } from './audio.js';

const SAVE_KEY = 'astra.progress.v2';

export function loadProgress(chapterId) {
  try {
    return JSON.parse(localStorage.getItem(SAVE_KEY))?.[chapterId] ?? { reached: 0, resume: 0 };
  } catch {
    return { reached: 0, resume: 0 };
  }
}

export function saveProgress(chapterId, progress) {
  try {
    const all = JSON.parse(localStorage.getItem(SAVE_KEY)) ?? {};
    all[chapterId] = progress;
    localStorage.setItem(SAVE_KEY, JSON.stringify(all));
  } catch {
    // No storage (private window): the chapter still plays, it just won't remember.
  }
}

// `onStep(index)` is called whenever a new step starts for real (not while fast-forwarding).
export async function playChapter(g, chapter, { onStep = () => {} } = {}) {
  const { ui } = g;
  const steps = chapter.steps;
  const progress = loadProgress(chapter.id);

  chapter.setup(g);
  const resume = Math.min(progress.resume, steps.length - 1);
  const choice = await ui.title({ continueName: resume > 0 ? steps[resume].name : null });
  const startAt = choice === 'continue' ? resume : 0;
  startAmbient();

  if (startAt > 0) ui.curtain(true, `Going to: ${steps[startAt].name}`);
  for (let i = 0; i < steps.length; i++) {
    const step = steps[i];
    const ff = i < startAt;
    g.setSkipping(ff);
    if (i === startAt && startAt > 0) ui.curtain(false);
    if (!ff) {
      progress.resume = i;
      progress.reached = Math.max(progress.reached, i);
      saveProgress(chapter.id, progress);
      onStep(i);
    }

    if (step.activity) {
      await runActivity(g, step.activity, ff);
    } else {
      if (!ff && step.skip !== false) {
        ui.skipButton(() => {
          ui.curtain(true);
          g.setSkipping(true);
        });
      }
      await step.scene(g);
      ui.skipButton(null);
      ui.curtain(false);
    }
  }
  g.setSkipping(false);
}

// An activity entry (see chapters/*/activities.js) names a reusable engine and configures it.
async function runActivity(g, activity, fastForward) {
  const { ui } = g;
  const engine = ENGINES[activity.engine];
  if (!engine) throw new Error(`Activity "${activity.id}" uses unknown engine "${activity.engine}"`);
  const tune = { ...activity.tune?.all, ...activity.tune?.[g.settings.age] };
  const a = { ...activity, tune };

  if (fastForward) {
    engine.finish(g, a);
    return;
  }

  await g.ensureInput();
  ui.cinematic(false);
  ui.hideDialogue();
  if (a.place) ui.place(...a.place);
  ui.objective(a.goal);

  for (;;) {
    await engine.run(g, a);
    g.needsBody = false;
    ui.hideCoach();
    ui.setCoachProgress(0);
    ui.arrow(null);
    ui.preview = null;
    if (a.again === false) break;
    const next = await ui.activityDone(a.text.done ?? 'You did it!');
    if (next === 'next') break;
    engine.reset(g, a);
  }
  ui.objective(null);
}
