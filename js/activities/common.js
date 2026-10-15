// Small helpers shared by the activity engines.

// Coach text entries look like { title, camera, keys }: one short goal, plus a hint for camera
// play and a hint for keyboard play. Shows the right one for how the child is playing.
export function coach(g, figure, entry) {
  g.ui.coach(figure, entry.title, g.input.camera ? entry.camera ?? '' : entry.keys ?? '');
}

// Fills {name} placeholders, e.g. fill('Step to the {side}!', { side: 'left' }).
export function fill(text, values) {
  return text.replace(/\{(\w+)\}/g, (_, k) => values[k] ?? '');
}

// Picks the n-th line from a list, looping round.
export const pick = (list, n) => list[n % list.length];
