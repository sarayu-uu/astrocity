# Astra: The First Starway

The first playable chapter of Astra Buddies. It is one continuous adventure in a 3D floating-island world, not a menu of mini-games. Children move in front of a laptop camera, and their real movements operate the planet's ancient machinery.

## Run it

```
python -m http.server 8000
```

Open http://localhost:8000. You need to serve the folder because the camera only works on `localhost` or HTTPS. The first load needs internet for three.js, the fonts and the pose model.

## The chapter (~15 minutes)

Chapter 1 is a list of steps in [js/chapters/ch01-first-starway/chapter.js](js/chapters/ch01-first-starway/chapter.js). Story scenes and movement activities take turns:

| # | Step | Type | Movement |
|---|---|---|---|
| 1 | Poppy finds a stone | scene | |
| 2 | Where is Nutty? | explore (click friends) | |
| 3 | The old bridge | scene | |
| 4 | Cross the stones | activity · `hop-stones` | jump, both arms up |
| 5 | The big potato | scene | |
| 6 | Aim the dish | activity · `side-step` | step left / right |
| 7 | Turn the Sky Crank | activity · `arm-pump` | arms up, then down |
| 8 | The gate wakes up | scene | |
| 9 | Copy the poses | activity · `pose-match` | star, bridge, moon |
| 10 | The Starway comes back | scene | |
| 11 | Play in Star Square | free play | |

There are no scores, stars or fail states. A mistimed jump only makes Poppy wobble. If the child steps out of view, the adventure pauses until they come back.

**Story controls (every chapter gets these):**

- **Skip** on every scene.
- **Hear again** (speaker button) on every line.
- **Play again** or **Keep going** after every activity. It keeps going by itself after 8 seconds.
- **Continue** on the title screen, which starts from the last step you reached.
- **Story panel** (book button), which replays any step you have reached.

Skip and replay work by fast-forwarding the earlier steps behind a curtain, so the world is always in the right state.

**Left / right:** the camera picture is split into three equal parts (left, middle, right). The game uses the middle of the child's shoulders and hips, in the mirrored picture, so "left" is the child's own left. During left/right activities the camera preview shows the three parts, with the target part in yellow.

**Keyboard fallback:**

| Key | Action |
|---|---|
| Space | Jump |
| W / ↑ | Arms up (hold to lift, tap to crank) |
| ← / → | Step left / right |
| S / ↓ | Duck |
| A / D | Lean left / right |
| (no key) | Freeze |
| 1 / 2 / 3 | Star / bridge / moon pose |
| Enter / R | Keep going / play again (after an activity) |

## Code

```
js/main.js                 boot: renderer, main loop, picking, panels
js/core/                   shared systems, not tied to any chapter
  game.js                  the game context `g`: frame / wait / tween, skipping, camera setup
  director.js              plays a chapter's steps: skip, continue, replay, play again
  stage.js                 activity stages: separate little worlds behind a portal, island paused
  input.js                 webcam + MediaPipe Pose -> jump, arms, poses, zone, duck, lean, freeze
  debug-moves.js           the ?debug Moves panel: live lights, threshold sliders, record / replay
  ui.js                    dialogue, barks, coach, title, skip, done card, arrows
  camera.js                cinematic moves, follow shots, explore controls
  audio.js                 synthesized music and sound effects
js/world/
  world.js                 Star Square, the bridge, Gate Rock, Glow Forest, sky
  buddies.js               the five plush characters and their animation states
js/stages/                 activity stage worlds (test-stage.js, test-track.js: ?debug tests)
js/activities/             reusable movement engines (no story text inside)
  hop-stones.js            jump across drifting stones, lift a sunken one
  side-step.js             step left / right where the arrow points
  arm-pump.js              pump arms to charge a machine
  pose-match.js            copy and hold a row of poses
  runner.js                endless runner in a stage: lanes, jumps, ducks, buns, result card
  runner-sim.js            the runner's rules (seeded, fixed-step, no 3D) and its test bot
  runner-patterns.js       built-in obstacle patterns
  set-piece.js             a story obstacle fixed with a short list of big moves (also at runner leg ends)
  set-piece-sim.js         its rules (steps, the "Ready…" gate, help when stuck) and its test bot
  moves.js                 how a move is counted (hold meters, pumps, following the body), shared by all
  index.js                 the list of engines
js/chapters/
  index.js                 the list of chapters
  ch01-first-starway/
    chapter.js             running order of steps
    scenes.js              story scenes (camera and staging)
    lines.js               every line of dialogue, in simple English
    activities.js          each activity: label, engine, difficulty, text, world object
```

### Testing moves

Open the game with `?debug` on the end of the address to get the **Moves** panel:
- live lights for every move, and sliders for the duck, lean and freeze thresholds;
- **Record 10 s**, which saves the camera's body landmarks (not video) as a JSON file;
- **Replay…**, which feeds a saved recording back through the same detection.

The **Stages** folder in the `?debug` panel enters and leaves a test stage, and its **×10 enter / leave** checks that memory stays flat (shapes, textures, shader programs).

**Runner test** plays a short run on the test track; tick **Autoplay runs (bot)** to watch the bot play it. `node tools/test-runner.mjs` plays every built-in pattern for Little and Big at the fastest speed the game reaches, with the bot changing lanes as slowly as a child on camera, and fails if any obstacle can't be cleared.

Each leg of the test run ends in a set piece, together using every step type (jump, arms-up hold, step left / right, pumps, pose hold). `node tools/test-set-piece.mjs` plays each step type and checks the rules: nothing finishes without the move, a held move can't carry into the next step, and help comes after 12 s and 25 s without progress. `node tools/test-golden.mjs` plays scripted input through the four original engines and compares every frame with `tools/golden/old-engines.json`, so a change to shared move code that alters them shows up (`--update` saves new results on purpose).

To check a recording without a browser, run `node tools/replay-moves.mjs recording.json`. It prints when each move starts and stops. You can override a threshold, for example `--duckDrop 0.2`.

### Editing

- **Change words:** edit `lines.js`, or the `text` of an activity in `activities.js`.
- **Change difficulty:** edit `tune` in `activities.js`. `all` applies to everyone, `little` and `big` override it.
- **Reorder or remove steps:** edit `steps` in `chapter.js`.
- **New version of an activity for another chapter:** copy its entry into that chapter's `activities.js`, then give it a new `id` and `label`, and change the words, numbers and world object. The engine doesn't change.
- **New kind of activity:** add an engine in `js/activities/` with `run`, `reset` (for Play again) and `finish` (the end state, for skipping), then list it in `js/activities/index.js`.
- **New chapter:** add a `ch02-…/` folder with the same four files and list it in `js/chapters/index.js`.

## Known gaps

- The jump and pose thresholds in `js/core/input.js` are first guesses. They need tuning with real kids in a real room.
- The characters are built in code from the reference sheet. They are close stand-ins, not final art. Swapping in modelled GLB characters later would mean replacing `Buddy` construction only, since animation states are separate.
- The left/right zones need testing in a real room. A child may need to take a big step to move from one third of the picture to the next, depending on how far they are from the laptop.
- "Read lines aloud" uses the browser's built-in voices, which sound robotic. Real voice acting would be a big upgrade.

The first prototype (the mini-game version) is archived in `archive/v1/`.
