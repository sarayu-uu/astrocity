// Plays a chapter: its steps run in order, each one either a story scene or an activity.
// It also owns the story controls that every chapter gets for free:
//   Skip           every scene step shows a Skip button (unless the step says skip: false)
//   Continue       progress is saved per step, so the title can start where you left off
//   Replay         any step you have reached can be played again from the Story panel
//   Play again     after each activity, redo it or keep going
// Starting part-way through works by fast-forwarding the earlier steps behind a curtain, so
// the world is always in the right state and scenes never need special "jump in here" code.

import { ENGINES } from '../activities/index.js';
import { STAGES } from '../stages/index.js';
import { startAmbient } from './audio.js';
import { withStage } from './stage.js';

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

// Best scores per activity and age band, kept beside the progress in the same save.
export function loadScores() {
  try {
    return JSON.parse(localStorage.getItem(SAVE_KEY))?.scores ?? {};
  } catch {
    return {};
  }
}

// Saves `result` if its score beats the best so far; returns the best (old or new).
export function saveBest(activityId, age, result) {
  try {
    const all = JSON.parse(localStorage.getItem(SAVE_KEY)) ?? {};
    all.scores ??= {};
    const key = `${activityId}:${age}`;
    const best = all.scores[key];
    if (!best || result.score > best.score) all.scores[key] = { ...result, at: new Date().toISOString() };
    localStorage.setItem(SAVE_KEY, JSON.stringify(all));
    return all.scores[key];
  } catch {
    return result;
  }
}

// `onStep(index)` is called whenever a new step starts for real (not while fast-forwarding).
// `jumpTo` (a step id, from ?step=… in the address) skips the title and fast-forwards there.
export async function playChapter(g, chapter, { onStep = () => {}, jumpTo = null } = {}) {
  const { ui } = g;
  const steps = chapter.steps;
  const progress = loadProgress(chapter.id);

  chapter.setup(g);
  const resume = Math.min(progress.resume, steps.length - 1);
  const jumpIndex = jumpTo ? steps.findIndex(s => s.id === jumpTo) : -1;
  if (jumpTo && jumpIndex < 0) console.warn(`?step=${jumpTo}: no such step. Steps: ${steps.map(s => s.id).join(', ')}`);
  let startAt;
  if (jumpIndex >= 0) {
    ui.hideTitle();
    startAt = jumpIndex;
  } else {
    const choice = await ui.title({ continueName: resume > 0 ? steps[resume].name : null });
    startAt = choice === 'continue' ? resume : 0;
  }
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
// With `stage: 'name'` it runs inside that activity stage (js/stages/), always coming back to
// the island afterwards. Engines with `ownsResult` show their own result card.
export async function runActivity(g, activity, fastForward = false) {
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

  const stageDef = a.stage ? STAGES[a.stage] : null;
  if (a.stage && !stageDef) throw new Error(`Activity "${a.id}" uses unknown stage "${a.stage}"`);
  for (;;) {
    if (stageDef) await withStage(g, stageDef, stage => engine.run(g, a, stage));
    else await engine.run(g, a);
    g.needsBody = false;
    ui.hideCoach();
    ui.setCoachProgress(0);
    ui.arrow(null);
    ui.preview = null;
    if (engine.ownsResult || a.again === false) break;
    const next = await ui.activityDone(a.text.done ?? 'You did it!');
    if (next === 'next') break;
    engine.reset(g, a);
  }
  ui.objective(null);
}
