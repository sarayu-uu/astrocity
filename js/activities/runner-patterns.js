// Built-in runner patterns: short hand-written runs of obstacles and collectibles.
// A chapter can add its own in its activity config (`patterns: { name: { ... } }`).
//
// Each pattern: { tier: 1-3, items: [...] }. Each item:
//   kind   lane obstacles:   'block' (one lane) | 'wall' (two lanes, one open)
//          move obstacles:   'gap' | 'wobble' (jump) | 'high' (duck) | 'sunk' (arms up)
//          collectibles:     'bun' | 'star'
//   at     seconds after the previous item (a minimum: the generator stretches gaps so the
//          child always has time to react and to reach a free lane)
//   lane   -1 | 0 | 1 | 'random' | 'same' (as the previous item) | 'free' (a lane the previous
//          lane obstacle left open) | 'blocked' (the previous wall's blocked side)
//   count, every   for a line of collectibles: how many, and seconds between them
//   arc    collectibles rise over the obstacle before them (looks; collecting is by lane)

export const MOVE_OF = {
  block: 'lane', wall: 'lane',
  gap: 'jump', wobble: 'jump',
  high: 'duck',
  sunk: 'armsUp',
};
export const isObstacle = kind => kind in MOVE_OF;

export const PATTERNS = {
  'bun-line': { tier: 1, items: [{ kind: 'bun', lane: 'random', count: 5, every: 0.25 }] },
  puff: { tier: 1, items: [{ kind: 'block', lane: 'random' }] },
  'puff-buns': { tier: 1, items: [{ kind: 'block', lane: 'random' }, { kind: 'bun', at: 0.2, lane: 'free', count: 4, every: 0.25 }] },
  gap: { tier: 1, items: [{ kind: 'gap' }] },
  'gap-buns': { tier: 1, items: [{ kind: 'bun', lane: 'random', count: 3, every: 0.2 }, { kind: 'gap', at: 0.3 }, { kind: 'bun', at: 0.05, lane: 'same', count: 3, every: 0.12, arc: true }] },
  'bun-arc': { tier: 1, items: [{ kind: 'gap' }, { kind: 'bun', at: -0.25, lane: 'random', count: 5, every: 0.1, arc: true }] },
  branch: { tier: 1, items: [{ kind: 'high' }] },
  wobble: { tier: 2, items: [{ kind: 'wobble' }] },
  sunk: { tier: 2, items: [{ kind: 'sunk' }] },
  'puff-gap': { tier: 2, items: [{ kind: 'block', lane: 'random' }, { kind: 'gap', at: 1 }] },
  'double-gap': { tier: 2, items: [{ kind: 'gap' }, { kind: 'gap', at: 1.2 }] },
  'star-stone': { tier: 2, items: [{ kind: 'wall', lane: 'random' }, { kind: 'star', at: 0.4, lane: 'blocked' }] },
  'wall-jump': { tier: 3, items: [{ kind: 'wall', lane: 'random' }, { kind: 'gap', at: 1 }] },
  'branch-wobble': { tier: 3, items: [{ kind: 'high' }, { kind: 'wobble', at: 1 }] },
  zigzag: { tier: 3, items: [{ kind: 'block', lane: -1 }, { kind: 'block', at: 1, lane: 1 }, { kind: 'block', at: 1, lane: 0 }] },
};
