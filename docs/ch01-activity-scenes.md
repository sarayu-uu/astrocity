# Astra Chapter 1 — Activity Scenes Game Design

15 Oct 2026 · @sarayuoaks

Chapter 1 swaps its four short obstacles for three activity scenes, each a mini-game in its own world, lifting movement time from about 4 minutes to 18–25 minutes inside a 25–35 minute chapter. The story and every existing line stay; the activities now carry the story forward instead of interrupting it.

## Decisions (answers to the open questions)

- **Stars and scores for Little kids:** yes. Little (3–6) players see stars and scores too, not only the cheer screen.
- **Session length:** each game is a natural stopping point. When the progress bar reaches its goal, the game stops and offers the choice; kids who want more can keep going (endless mode).
- **Sound and music:** yes, per stage, synthesized in `audio.js` like now.

## Overview

Each activity scene follows one loop, taken from endless runners and fitness games:

1. **Enter:** Poppy's magic stone glows and pulls the buddies into a new place (a portal swirl, 1.5 s).
2. **Run:** a continuous core game (running, flying or a challenge arena) with collectibles and obstacles.
3. **Set piece:** every 60–90 s the run stops at a story obstacle. A full-screen scene asks for a short sequence of big moves to fix it.
4. **Change:** the place transforms (new colours, new obstacle mix, faster) and the run continues.
5. **Finish:** after the story goal is met, the result card offers Keep going (endless mode, high score) or Back to the story.

The three games:

| # | Activity scene | Replaces | Hero | Core game | Set pieces | Story result |
|---|---|---|---|---|---|---|
| 1 | Star Stone Run · the Sky River | Cross the stones | Poppy | 3-lane runner: jump, duck, change lanes | Build a bridge (×3) | Poppy reaches Nutty; the bridge drifts away, so both are stuck |
| 2 | Sky Power · above the clouds | Aim the dish + Turn the Sky Crank | Lumi (and Poppy) | Flying runner on Lumi's dish: lanes plus up/down | Find the signal, unjam the crank, full power | The charged dish fires its beam at the gate |
| 3 | Gate Trials · inside the sleeping gate | Copy the gate poses | Mimi hosts | Challenge arena: jump, squat, lean, freeze, step, poses | Three crystal pose locks | The gate wakes and the Starway returns |

### Design rules for ages 3–12

- **No game over.** A bump slows the run, a buddy says something kind, and play continues. Big kids (7–12) lose a combo streak, never progress.
- **One new move at a time.** Each game teaches its moves in a short safe stretch before mixing them.
- **Big, readable moves only.** Jump, duck, step, arms up/down, lean, freeze and the three poses. No small hand gestures.
- **Rest built in.** Set pieces alternate fast and slow effort, and a gentle "breather" beat comes every 3–4 minutes.
- **Every bit of play means something in the story.** Collectibles are story objects (Nutty's dropped buns, power sparks, crystal lights), never generic coins.
- **Keyboard always works.** Every move has a key, so testing and non-camera play stay possible.

## How it fits the story

The chapter keeps all its story scenes; only the four activity steps change, merged into three. Poppy's magic stone becomes the reason the buddies travel: whenever the story hits a wall, the stone glows and opens a way through.

New running order (`chapters/ch01-first-starway/chapter.js`):

```js
steps: [
  { id: 'arrival',     name: 'Poppy finds a stone',    scene: S.arrival },
  { id: 'ask-around',  name: 'Where is Nutty?',        scene: S.askAround },
  { id: 'to-bridge',   name: 'The old bridge',         scene: S.toBridge },
  { id: 'stone-run',   name: 'Star Stone Run',         activity: A.starStoneRun },   // NEW, replaces cross-stones
  { id: 'gate-rock',   name: 'The big potato',         scene: S.gateRock },
  { id: 'sky-power',   name: 'Sky Power',              activity: A.skyPower },       // NEW, replaces aim-dish + sky-crank
  { id: 'beam',        name: 'The gate wakes up',      scene: S.beam },
  { id: 'gate-trials', name: 'Gate Trials',            activity: A.gateTrials },     // NEW, replaces gate-poses
  { id: 'starway',     name: 'The Starway comes back', scene: S.starway },
  { id: 'free-roam',   name: 'Play in Star Square',    scene: S.freeRoam, skip: false },
],
```

Story beats each game must keep (from the current story):

| Game | Comes after | Must keep | Leads into |
|---|---|---|---|
| Star Stone Run | Nutty: "I can't get back. Help!" | The stones drift and wobble; one stone sinks and is lifted with arms up | Nutty: "You came! But now we are BOTH stuck." |
| Sky Power | Lumi: "First, my dish must point at the gate." | The dish is aimed by stepping left and right; the Sky Crank is charged by arm pumps | The beam reaches the gate (beam scene) |
| Gate Trials | Mimi: "Copy the pictures, darlings!" | Star, bridge and moon poses; Poppy and Nutty copy along; Nutty gets the moon wrong | The Starway comes back (starway scene) |

New lines (add to `lines.js` under each activity's text; same rules as now: short, one idea, about 3 seconds aloud):

| Moment | Who | Line |
|---|---|---|
| Stone Run · enter | poppy | My stone is glowing! Hold on, Nutty! |
| Stone Run · enter | null | The stones float away down the Sky River. Follow them! |
| Stone Run · first bun | poppy | A bun! Nutty dropped his buns. Follow the buns! |
| Stone Run · bridge | poppy | The bridge is broken. Let's fix it! |
| Stone Run · sunk stone | poppy | That stone sank! Arms up, lift it! |
| Stone Run · finish | nutty | Poppy! You found me! And my buns! |
| Stone Run · finish | null | Behind them, the stones drift away again. |
| Sky Power · enter | lumi | Hop on my dish. We fly up to find power! |
| Sky Power · sparks | lumi | Catch the sparks! They fill my crank. |
| Sky Power · signal | lumi | Where is the gate? Step and look! |
| Sky Power · jam | lumi | Uh oh. The crank is stuck. Pump it! |
| Sky Power · finish | lumi | FULL POWER! Point the beam at the gate! |
| Gate Trials · enter | mimi | Welcome to the Sleeping Gate, darlings! |
| Gate Trials · challenge | mimi | Copy me! Five, six, seven, eight! |
| Gate Trials · freeze | mimi | And... FREEZE! Like a statue! |
| Gate Trials · lock | poppy | A crystal lock! It shows a picture! |
| Gate Trials · moon gag | nutty | Am I a moon? |
| Gate Trials · finish | mimi | The gate is awake! Bravo! |

## Shared systems

Build these once and all three games reuse them. They fit the current setup: plain ES modules, no build step, three.js 0.169 from the import map, engines with `run` / `reset` / `finish` picked by name in `js/activities/index.js`.

### 1. Activity stage (a separate world)

- `js/core/stage.js`: `enterStage(g, stage)` and `exitStage(g)`. A stage owns its own `THREE.Scene`, camera, lights and fog. The main renderer and composer switch their scene and camera to it; the island world is kept in memory, paused, not rebuilt.
- Transition: Poppy's stone flashes, then a radial portal wipe (a full-screen DOM overlay with a CSS radial gradient, 0.8 s in, 0.8 s out). Same wipe on exit.
- On exit, dispose the stage's geometries, materials and textures so memory does not grow on replay.
- The buddies used in a stage are clones of the main Buddy objects (same look), so the island scene state is untouched.
- `finish(g, a)` (used by Skip and Continue) must put the island world in the same end state as a played run, without entering the stage.

### 2. Runner engine (`js/activities/runner.js`)

One engine powers Game 1 and Game 2; Game 2 adds a height axis.

- **Track:** the player stays at z = 0; the world moves toward the camera. Track pieces are 20-unit segments, pooled and recycled (never created mid-run).
- **Lanes:** 3 lanes, 2.2 units apart. Lane = `input.zone` (left / center / right), so the child literally steps into a lane. Lane change animates over 0.18 s.
- **Patterns, not random spawns:** obstacles come from hand-written patterns in config (for example `['jump', 'gap', 'duck', 'lane-left', 'bun-line']`). A pattern picker mixes them by difficulty tier. This keeps runs fair and teachable.
- **Forgiving hits:** collision boxes are 70% of the visual size. A hit = stumble animation, speed drops 30% for 1.5 s, a kind buddy line. No lives.
- **Speed curve:** starts at `speed.start`, rises to `speed.max` over the leg, resets a little after each set piece.
- **Distance goal:** each leg ends at a fixed distance, which triggers the next set piece.
- **Endless mode:** after the story goal, the pattern list keeps cycling with rising tiers; the score is distance + collectibles, best score saved per age group in localStorage.

### 3. Set-piece engine (`js/activities/set-piece.js`)

A set piece is a full-screen moment with a fixed camera and a list of steps, each one a move the existing input already supports or the new ones below. Config example:

```js
bridge: [
  { move: 'jump',   times: 3, text: 'Stomp the stones into place!' },
  { move: 'armsUp', hold: 1.4, text: 'Lift the sunk stone!' },
  { move: 'step',   sequence: ['left', 'right'], text: 'Push the planks!' },
]
```

Each step drives a visible change (a stone rises, a plank slides, a light fills) so the child sees their move doing the work. The existing engines (hop-stones, side-step, arm-pump, pose-match) become set-piece step types; reuse their logic rather than rewriting it.

### 4. Movement set

| Move | Already in input.js? | Camera detection | Keys |
|---|---|---|---|
| Jump | Yes (`consumeJump`) | hip rise | Space |
| Step to lane | Yes (`zone`) | body x in thirds | ← / → (hold) |
| Arms up / down | Yes (`armsUp`, `armsDown`) | wrists above / below shoulders | W or ↑ |
| Star, bridge, moon | Yes (`pose`) | existing pose rules | 1, 2, 3 |
| Duck / squat | New | shoulder-to-hip midpoint drops 18% (Little) / 22% (Big) of torso length below the standing baseline, held 0.15 s | S or ↓ |
| Lean left / right | New | shoulder line tilts more than 15° while hips stay in the same zone | A / D |
| Freeze | New | average landmark speed below a threshold for the hold time | no key held for the hold time |

The standing baseline (used for duck) is captured during the existing "Step back until Poppy can see all of you" check, and re-captured whenever tracking is regained.

### 5. Difficulty: age setting plus quiet adaptation

- The existing Little (3–6) / Big (7–12) setting picks the base numbers (see Pacing).
- **Adaptive layer:** keep a rolling success rate over the last 10 obstacles or steps. Above 85%: +8% speed and the next pattern tier. Below 55%: −10% speed, wider timing windows, and simpler patterns. Clamp to the age band's limits.
- **Camera trouble beats difficulty:** if tracking is lost, pause the run, show the coach ("Poppy can't see you!"), and resume with a 3-2-1 count.

### 6. Rewards and feedback

- Collectibles count up in a small HUD pill (top right, below the buttons). Never cover the play area.
- Result card per game: collectibles, distance or challenges done, and 1–3 stars (all ages; see Decisions). Then Keep going (endless) or Back to the story.
- Every set piece ends with a celebration beat (2 s): particles, a buddy cheer, a sound. This is also the rest beat.
- Save best scores and stars per game in the existing progress save (`astra.progress.v2`), under a new `scores` key.

### 7. Comfort and safety

- A breather card every 3–4 minutes of continuous movement ("Shake out your arms! Big breath!") with a 5 s auto-continue.
- No move held longer than 2 s; no more than 6 jumps in a row for Little.
- Pause is always one click (the existing Settings button pauses the run).

## Game 1: Star Stone Run (the Sky River)

Poppy chases the drifting stepping stones down the Sky River to reach Nutty, following a trail of his dropped buns and rebuilding the broken bridge three times. Engine: runner plus set-piece. Length: 6–8 minutes of play.

**Story setup.** At the end of `toBridge`, Poppy says "Let's hop across and get him!". Her stone glows, the old bridge's stones break loose and float away down a river of cloud, and the portal pulls her after them.

**The place.** A canyon of soft cloud-rock with a glowing mint river running down the middle, alien trees (the lantern palms and horn coral from `alien.js`) along the banks, and floating islands in the distance. The colours move from mint (leg 1) to lilac (leg 2) to sunset peach (leg 3), so each leg feels new.

**Core run.** Poppy runs on the floating stones and river banks in 3 lanes.

| Obstacle | Move | First appears |
|---|---|---|
| Cloud puff across one lane | Change lane | Leg 1 |
| Gap between stones | Jump | Leg 1 |
| Low alien-tree branch | Duck | Leg 2 |
| Wobbling stone (glows when safe) | Jump on the glow | Leg 2 (the old hop-stones beat) |
| Cloud wall across two lanes | Change to the open lane, then jump | Leg 3 |
| Sunk stone in the path | Arms up to lift it before reaching it | Leg 3 |

**Collectibles.** Nutty's buns (lines of 5 in a lane, arcs over gaps) and rare star stones (one per leg, placed on a harder line). Bun count shows in the HUD pill.

**Structure.**

1. Teach (20 s): lane changes only, buns in each lane. Coach text: "Step left and right to catch the buns!"
2. Leg 1 (60–75 s): lanes + jumps.
3. Set piece: Broken Bridge 1 (30–40 s) — jump 3 times to stomp the floating stones into a line.
4. Leg 2 (60–75 s): adds duck and wobbling stones. The river turns lilac.
5. Set piece: Broken Bridge 2 — the sunk stone: arms up and hold 1.4 s to lift it (keeps the original story beat), then 2 jumps.
6. Leg 3 (75–90 s): everything mixed, faster. Sunset peach.
7. Set piece: Last Bridge — step left, right, left to push three planks across, then a big jump to land beside Nutty.
8. Finish: Nutty catches his buns ("Poppy! You found me! And my buns!"), then the bridge drifts away behind them. Portal back to Gate Rock; the `gateRock` scene starts with "You came! But now we are BOTH stuck."

**Set-piece camera.** A side view of the gap, Poppy on the left, the stones or planks in the middle, Nutty waving on the far side so the goal is always visible.

**Endless mode (Keep going).** The river loops through the three colour themes; patterns cycle at rising tiers; best distance and buns saved.

Config sketch (`chapters/ch01-first-starway/activities.js`):

```js
starStoneRun: {
  id: 'ch01.star-stone-run',
  label: 'Chapter 1 · Star Stone Run',
  engine: 'runner',
  stage: 'sky-river',
  hero: 'poppy',
  goal: 'Follow the buns to Nutty!',
  legs: [
    { length: 260, theme: 'mint',  patterns: ['bun-line', 'puff', 'gap', 'gap-buns'] },
    { length: 300, theme: 'lilac', patterns: ['branch', 'wobble', 'puff-gap', 'bun-arc'] },
    { length: 340, theme: 'peach', patterns: ['wall-jump', 'sunk', 'branch-wobble', 'star-stone'] },
  ],
  setPieces: ['bridge1', 'bridge2', 'lastBridge'],
  tune: {
    little: { speed: { start: 6, max: 8.5 },  jumpWindow: 0.7, duckHold: 0.15 },
    big:    { speed: { start: 8, max: 12.5 }, jumpWindow: 0.4, duckHold: 0.1 },
  },
  text: { /* lines from the story table */ },
}
```

**Done when:** a Little player can finish with the camera in under 8 minutes without help; every set piece shows its move changing the scene; Skip and Continue land in `gateRock` with Poppy and Nutty together at Gate Rock.

## Game 2: Sky Power (above the clouds)

Lumi's dish turns into a flying saucer; Lumi and Poppy fly above the clouds catching power sparks for the Sky Crank, find the gate's signal, and unjam the crank until it reaches full power. Engine: runner in fly mode plus set-piece. Length: 6–8 minutes.

**Story setup.** After `gateRock` ends with Lumi asking for help, Lumi's stone-shaped battery is empty. Poppy's stone glows, the dish lifts off with both of them on it, and they fly up through the clouds.

**The place.** An open sky at golden hour: cloud banks below, floating crystal rocks, distant islands, and a sunset that slowly turns to early stars as the charge fills. The gate's glow is far ahead on the horizon the whole time, so the goal is always in view.

**Core flight.** The dish flies forward through a 3 × 2 grid: 3 lanes (step left / middle / right) and 2 heights.

- Arms up = fly high (hold); arms down = fly low. Little kids get height only in leg 2 onward; until then the dish stays low.
- Sparks come in lines and arcs; each one adds to a big charge meter shaped like the Sky Crank, on the left of the screen.

| Obstacle | Move | First appears |
|---|---|---|
| Storm cloud in a lane | Change lane | Leg 1 |
| Crystal rock low | Arms up (fly high) | Leg 2 |
| Crystal arch high | Arms down (fly low) | Leg 2 |
| Wind gust (arrows on screen) | Lean the way it blows to stay steady | Leg 3 (Big only; Little gets lane changes instead) |
| Spark ring | Fly through the middle of it: bonus sparks | Leg 1 |

**Structure.**

1. Teach (20 s): lanes only, sparks in each lane.
2. Leg 1 (60–75 s): lanes, storm clouds, spark rings.
3. Set piece: Find the Signal (40 s) — the old aim-dish beat, bigger. The camera turns to look back at the dish. An arrow shows a side; the child steps left, middle, right as the dish sweeps the sky; when it points right, a beam locks onto the gate with a chime. Little: 2 steps; Big: 4 steps.
4. Leg 2 (60–75 s): adds high and low.
5. Set piece: Crank Jam (30–40 s) — a gear pops loose; arm pumps (up, down) spin the crank and click the gear back in. Little: 5 pumps; Big: 8 pumps. Each pump visibly turns the crank and fills the meter.
6. Leg 3 (75–90 s): everything mixed, faster; the sky turns from sunset to stars.
7. Set piece: Full Power — 6 quick pumps, then a star pose held 1 s to fire. The beam shoots across the sky to the gate.
8. Finish: "FULL POWER! Point the beam at the gate!" Portal back; the `beam` scene plays with the gate already lit.

**Endless mode.** A night-sky loop with faster storms; score = sparks + distance.

Config sketch:

```js
skyPower: {
  id: 'ch01.sky-power',
  label: 'Chapter 1 · Sky Power',
  engine: 'runner',
  mode: 'fly',          // adds 2 heights driven by armsUp / armsDown
  stage: 'sky-above',
  hero: 'lumi', rider: 'poppy',
  goal: 'Catch sparks for the Sky Crank!',
  meter: { fullAt: 120 }, // sparks for full charge
  legs: [
    { length: 260, theme: 'gold',   patterns: ['spark-line', 'storm', 'ring'] },
    { length: 300, theme: 'sunset', patterns: ['rock-low', 'arch-high', 'storm-ring'] },
    { length: 340, theme: 'stars',  patterns: ['gust', 'mixed-hi-lo', 'ring-chain'] },
  ],
  setPieces: ['findSignal', 'crankJam', 'fullPower'],
  tune: {
    little: { speed: { start: 6, max: 9 },  heightFromLeg: 2, gusts: false, pumps: 5, signalSteps: 2 },
    big:    { speed: { start: 8, max: 13 }, heightFromLeg: 1, gusts: true,  pumps: 8, signalSteps: 4 },
  },
}
```

**Done when:** arms up/down reliably switch height with the camera (with a 0.15 s hold to avoid flicker); the signal and crank set pieces keep the old beats; Skip and Continue leave the dish pointed at the gate and the crank full, exactly as `aimDish` and `skyCrank` do now.

## Game 3: Gate Trials (inside the sleeping gate)

Inside the gate is a sleeping crystal arena that only wakes up through movement. Mimi hosts a run of quick "copy me" challenges, and three crystal locks (the gate's carved pictures) open the way to the Starway. Engine: new trials plus set-piece. Length: 6–9 minutes.

**Story setup.** At the end of `beam`, Mimi says "Copy the pictures, darlings!". The pictures glow, the gate opens like a curtain, and the buddies step inside.

**The place.** A round arena of dark violet crystal with three rings of floor tiles. Every completed challenge lights a tile; each ring fully lit wakes a section (lights, music layer, floating crystals). Mimi dances on a raised stage in the middle; Poppy and Nutty stand at the sides and copy the child.

**Core loop: challenge cards.** Each challenge is a card that flips in with Mimi's demo (Mimi does the move first, 1.5 s), then the child copies it within a time window.

| Challenge | Move | Little | Big |
|---|---|---|---|
| Jump! | Jump | 1 jump | 2–3 jumps in a beat |
| Squat! | Duck / squat | hold 0.6 s | hold 1 s, or 3 quick squats |
| Lean! | Lean left or right | either side | the side shown |
| Freeze! | Freeze (statue) | 2 s | 3 s, after a short dance burst |
| Step! | Step to a zone | the side shown | a sequence of 2–3 zones |
| Reach! | Arms up | hold 1 s | arms up, then down, ×3 |
| Pose! | Star / bridge / moon | one pose | two poses in a row |

- Cards come in rounds of 6. A round has a rhythm: 4 active cards, 1 Freeze card as a rest, 1 "Mimi's choice" card (random from what was taught).
- Each round adds one new challenge type; the first time a type appears, the window is double.
- Missed card: Mimi says "Nearly! Try this one!" and a new card comes; the tile stays dark but nothing is lost.
- Combo (Big only): consecutive hits light extra sparkles and raise the score multiplier.

**Structure.**

1. Round 1: jump, step, reach, freeze. Ring 1 lights.
2. Crystal Lock 1: Star — a giant crystal rises; hold the star pose (Little 0.8 s / Big 1.3 s). Poppy and Nutty copy. The lock shatters into light.
3. Round 2: adds squat and lean. Ring 2 lights.
4. Crystal Lock 2: Bridge — hold the bridge pose; then a short sequence: bridge, star.
5. Round 3: everything, a little faster, poses included. Ring 3 lights.
6. Crystal Lock 3: Moon — hold the moon pose. Nutty does it with the wrong arm ("Am I a moon?"), everyone laughs, then all three poses in a row: star, bridge, moon.
7. Finish: the arena fully wakes, "The gate is awake! Bravo!" Portal back; the `starway` scene starts.

**Endless mode.** Rounds continue with mixed cards and shorter windows; score = cards hit, best combo saved.

Config sketch:

```js
gateTrials: {
  id: 'ch01.gate-trials',
  label: 'Chapter 1 · Gate Trials',
  engine: 'trials',
  stage: 'crystal-arena',
  host: 'mimi', copycats: ['poppy', 'nutty'],
  goal: 'Copy Mimi to wake the gate!',
  rounds: [
    { cards: ['jump', 'step', 'reach', 'freeze', 'jump', 'choice'] },
    { cards: ['squat', 'lean', 'jump', 'freeze', 'step', 'choice'] },
    { cards: ['pose', 'squat', 'lean', 'freeze', 'reach', 'choice'] },
  ],
  locks: [
    { pose: 'star' },
    { pose: 'bridge', then: ['bridge', 'star'] },
    { pose: 'moon', then: ['star', 'bridge', 'moon'], oops: { nutty: 'moon' } },
  ],
  tune: {
    little: { window: 3.5, hold: 0.8, freeze: 2, demo: 1.8 },
    big:    { window: 2.2, hold: 1.3, freeze: 3, demo: 1.2 },
  },
}
```

**Done when:** squat, lean and freeze are detected reliably for both age groups in a normal living room; the moon gag still plays; Skip and Continue leave the gate unlocked exactly as `gatePoses` does now.

## Pacing and session length

A typical Little run lands near 29 minutes, about two-thirds of it moving; Big kids run faster but face longer legs and more steps, so they land in the same range. Each game stops at its progress goal (see Decisions); Keep going (endless mode) after any game takes a session past 30 minutes for kids who want more.

Little vs Big numbers (the tune blocks; the adaptive layer moves within these):

| Setting | Little (3–6) | Big (7–12) |
|---|---|---|
| Runner speed, start → max (units/s) | 6 → 8.5 (fly: 9) | 8 → 12.5 (fly: 13) |
| Jump timing window | 0.7 s | 0.4 s |
| Duck: drop needed / hold | 18% of torso / 0.15 s | 22% / 0.1 s |
| Leg length (runner units) | 260 / 300 / 340 | 300 / 360 / 420 |
| Set-piece steps | 2–3 moves | 3–5 moves |
| Arm pumps (crank) | 5 | 8 |
| Signal steps (dish) | 2 | 4 |
| Pose hold | 0.8 s | 1.3 s |
| Trials card window / Mimi demo | 3.5 s / 1.8 s | 2.2 s / 1.2 s |
| Freeze hold | 2 s | 3 s |
| Wind gusts (lean) | off | on |
| Stars and combos | 1–3 stars (combo streak Big only) | 1–3 stars, combo streak |
| Breather card | every 3 min | every 4 min |

## Build plan

Build in 7 phases on the branch `feature/activity-scenes` (not main), one phase per session, each ending with a commit and a Vercel preview link to play.

Opening prompt (every session):

> Read docs/ch01-activity-scenes.md. It is the design for replacing Chapter 1's four activities with three activity scenes (Star Stone Run, Sky Power, Gate Trials). The project is plain ES modules with no build step; three.js 0.169 comes from the import map in index.html. Keep the engine pattern in js/activities (run / reset / finish, picked by name in index.js) and the chapter config pattern in chapters/ch01-first-starway. Work on the branch feature/activity-scenes. Today we do Phase N only. Show me what you will change before you change it, keep every move playable by keyboard, and end with a commit.

| Phase | Build | Main files | Done when |
|---|---|---|---|
| 1 | New moves: duck, lean, freeze; standing baseline; keys S/↓, A/D, freeze; a `?debug` overlay showing every move live | `js/core/input.js` | Each move lights in the overlay with the camera and the keys, for a small child and an adult |
| 2 | Activity stage: separate scene + camera, portal wipe in/out, clone buddies, dispose on exit, pause on lost tracking | `js/core/stage.js`, `js/core/director.js`, `style.css` | A blank test stage can be entered and left 10 times with no memory growth (check the renderer's info counts) |
| 3 | Runner engine: lanes from zone, pooled segments, patterns, forgiving hits, speed curve, legs, HUD pill, result card, endless mode, best score | `js/activities/runner.js`, `js/core/ui.js` | A test track with puffs, gaps and buns runs at 60 fps on a normal laptop and 30+ in Low quality |
| 4 | Set-piece engine, reusing the old engines' logic as step types (jump, armsUp hold, step sequence, pumps, pose hold) | `js/activities/set-piece.js` | A config list of steps plays in order, each step visibly moving the scene |
| 5 | Game 1 Star Stone Run: Sky River stage, obstacles, buns and star stones, 3 bridge set pieces, story lines, wire into chapter.js | `js/stages/sky-river.js`, `activities.js`, `lines.js`, `chapter.js` | The Done-when list in the Game 1 section |
| 6 | Game 2 Sky Power: fly mode (2 heights), spark meter, Find the Signal, Crank Jam, Full Power | `js/stages/sky-above.js`, runner fly mode | The Done-when list in the Game 2 section |
| 7 | Game 3 Gate Trials: trials engine (cards, rounds, Mimi demo, combos), crystal arena, 3 locks with the moon gag | `js/activities/trials.js`, `js/stages/crystal-arena.js` | The Done-when list in the Game 3 section |

After phase 7: tune with real kids. Add a tiny local log (kept in localStorage, never sent anywhere) of minutes per game, hits and misses per obstacle type, and quits, then adjust the tune numbers. Keep the old four engines in the repo as set-piece step types; delete their chapter entries only when the new games pass playtests.

Art for the stages: reuse `alien.js` (trees, pods) for scenery, smooth shading with SMAA, pastel palettes per leg, and instanced meshes for anything repeated (stones, buns, sparks, tiles) to keep draw calls low alongside the webcam tracking.
