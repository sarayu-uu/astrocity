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
//
// Fly mode (runner `mode: 'fly'`) adds two heights, low and high:
//   kind   'rock' (low crystal rock: fly high) | 'arch' (high crystal arch: fly low)
//          'gust' (wind: lean the way it blows; `dir` 'left' | 'right' | 'random')
//          'spark' (collectible, like a bun) | 'ring' (fly through it: 5 sparks)
//   height for collectibles: 'low' | 'high' | 'random' | 'same' (only counts when heights are on)

export const MOVE_OF = {
  block: 'lane', wall: 'lane',
  gap: 'jump', wobble: 'jump',
  high: 'duck',
  sunk: 'armsUp',
  rock: 'up', arch: 'down', gust: 'lean',
};
export const isObstacle = kind => kind in MOVE_OF;
export const isCollectible = kind => ['bun', 'spark', 'star', 'ring'].includes(kind);

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
  'star-stone': { tier: 2, items: [{ kind: 'wall', lane: 'random' }, { kind: 'star', at: 0.6, lane: 'same' }] },
  'wall-jump': { tier: 3, items: [{ kind: 'wall', lane: 'random' }, { kind: 'gap', at: 1 }] },
  'branch-wobble': { tier: 3, items: [{ kind: 'high' }, { kind: 'wobble', at: 1 }] },
  zigzag: { tier: 3, items: [{ kind: 'block', lane: -1 }, { kind: 'block', at: 1, lane: 1 }, { kind: 'block', at: 1, lane: 0 }] },

  // ---- Fly mode (Sky Power) ----------------------------------------------------------
  'spark-line': { tier: 1, items: [{ kind: 'spark', lane: 'random', height: 'random', count: 5, every: 0.25 }] },
  storm: { tier: 1, items: [{ kind: 'block', lane: 'random' }] },
  'storm-sparks': { tier: 1, items: [{ kind: 'block', lane: 'random' }, { kind: 'spark', at: 0.2, lane: 'free', height: 'random', count: 4, every: 0.25 }] },
  ring: { tier: 1, items: [{ kind: 'ring', lane: 'random', height: 'random' }] },
  'storm-ring': { tier: 1, items: [{ kind: 'block', lane: 'random' }, { kind: 'ring', at: 0.4, lane: 'free', height: 'random' }] },
  'storm-wall': { tier: 2, items: [{ kind: 'wall', lane: 'random' }, { kind: 'spark', at: 0.3, lane: 'same', height: 'random', count: 3, every: 0.25 }] },
  'rock-low': { tier: 1, items: [{ kind: 'rock' }, { kind: 'spark', at: 0.1, lane: 'random', height: 'high', count: 3, every: 0.2 }] },
  'arch-high': { tier: 1, items: [{ kind: 'arch' }, { kind: 'spark', at: 0.1, lane: 'random', height: 'low', count: 3, every: 0.2 }] },
  'hi-lo': { tier: 2, items: [{ kind: 'rock' }, { kind: 'arch', at: 1.4 }] },
  'ring-chain': { tier: 2, items: [{ kind: 'ring', lane: -1, height: 'low' }, { kind: 'ring', at: 0.9, lane: 0, height: 'high' }, { kind: 'ring', at: 0.9, lane: 1, height: 'low' }] },
  gust: { tier: 2, items: [{ kind: 'gust', dir: 'random' }] },

  // ---- Pilot mode (Sky Pilot): steer with tilted "wings" ------------------------------
  slalom: { tier: 2, items: [{ kind: 'block', lane: -1 }, { kind: 'block', at: 0.9, lane: 1 }, { kind: 'block', at: 0.9, lane: -1 }] },
  'spark-weave': { tier: 1, items: [{ kind: 'spark', lane: -1, count: 3, every: 0.2 }, { kind: 'spark', at: 0.5, lane: 0, count: 3, every: 0.2 }, { kind: 'spark', at: 0.5, lane: 1, count: 3, every: 0.2 }] },
  'gust-sparks': { tier: 3, items: [{ kind: 'gust', dir: 'random' }, { kind: 'spark', at: 0.4, lane: 'random', height: 'random', count: 4, every: 0.25 }] },
};
