# Astra: The First Starway

The first playable chapter of Astra Buddies. It is one continuous adventure in a 3D floating-island world, not a menu of mini-games. Children move in front of a laptop camera, and their real movements operate the planet's ancient machinery.

## Run it

```
python -m http.server 8000
```

Open http://localhost:8000. You need to serve the folder because the camera only works on `localhost` or HTTPS. The first load needs internet for three.js, the fonts and the pose model.

## The chapter (~20 minutes)

Chapter 1 is a list of steps in [js/chapters/ch01-first-starway/chapter.js](js/chapters/ch01-first-starway/chapter.js). Story scenes and movement games take turns:

| # | Step | Type | Movement |
|---|---|---|---|
| 1 | Poppy finds a stone | scene | |
| 2 | Where is Nutty? | explore (click friends) | |
| 3 | The old bridge | scene | |
| 4 | Star Stone Run | game · `runner` on the Sky River, 3 bridges | step, jump, duck, arms up, poses |
| 5 | The big potato | scene | |
| 6 | Sky Power | game · `runner` fly mode above the clouds, 3 moments | step, arms up / down, pumps, star, lean (Big) |
| 7 | The gate wakes up | scene | |
| 8 | Gate Trials | game · `trials` in the crystal arena: 3 rounds of 8 "copy Mimi" cards, 3 crystal locks | jump, squat, lean, freeze, step, reach, poses, free dance |
| 9 | The Starway comes back | scene | |
| 10 | Play in Star Square | free play | |

The games have stars, a score and a best score, but no fail states: a missed obstacle is a stumble and the run goes on. If the child steps out of view, play pauses until they come back. The original island activities (Cross the Stones, Aim the Dish, Turn the Sky Crank, Copy the Poses) are still in `activities.js` and can be put back in `chapter.js`.

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
js/stages/                 activity stage worlds
  sky-river.js             the Star Stone Run: river canyon, stone lanes, obstacle looks, three bridges
  sky-above.js             Sky Power: the sky above the clouds, Lumi's flying dish, three moments
  crystal-arena.js         Gate Trials: the crystal floor's tile rings, Mimi's stage, three crystal locks
  test-stage.js, test-track.js   plain stages for ?debug tests
js/activities/             reusable movement engines (no story text inside)
  hop-stones.js            jump across drifting stones, lift a sunken one
  side-step.js             step left / right where the arrow points
  arm-pump.js              pump arms to charge a machine
  pose-match.js            copy and hold a row of poses
  runner.js                endless runner in a stage: lanes, jumps, ducks, buns, result card
  runner-sim.js            the runner's rules (seeded, fixed-step, no 3D) and its test bot
  runner-patterns.js       built-in obstacle patterns
  trials.js                "copy me" card rounds with a host (Gate Trials); rules in trials-sim.js
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
    run-scenes.js          story moments inside the Star Stone Run (start, bridges, finish)
```

### Testing moves

Open the game with `?debug` on the end of the address to get the **Moves** panel:
- live lights for every move, and sliders for the duck, lean and freeze thresholds;
- **Record 10 s**, which saves the camera's body landmarks (not video) as a JSON file;
- **Replay…**, which feeds a saved recording back through the same detection.

The **Stages** folder in the `?debug` panel enters and leaves a test stage, and its **×10 enter / leave** checks that memory stays flat (shapes, textures, shader programs).

**Runner test** plays a short run on the test track; tick **Autoplay runs (bot)** to watch the bot play it. `node tools/test-runner.mjs` plays every built-in pattern for Little and Big at the fastest speed the game reaches, with the bot changing lanes as slowly as a child on camera, and fails if any obstacle can't be cleared.

Each leg of the test run ends in a set piece, together using every step type (jump, arms-up hold, step left / right, pumps, pose hold). `node tools/test-set-piece.mjs` plays each step type and checks the rules: nothing finishes without the move, a held move can't carry into the next step, and help comes after 12 s and 25 s without progress. `node tools/test-golden.mjs` plays scripted input through the four original engines and compares every frame with `tools/golden/old-engines.json`, so a change to shared move code that alters them shows up (`--update` saves new results on purpose).

**In the app:** the Story panel's **Play a game** buttons start any movement game straight away (the title then offers *Continue*). **Settings › Play records** turns on the session log below and downloads or clears the records.

**Playtest session log:** on with Settings › Record play sessions, or add `&log` (records quietly) or `?debug` to the address; `&kid=A1` labels the child, e.g. `?step=stone-run&log&kid=A1`. Every page load is one session, saved on that computer: per leg time, stumbles by obstacle, each bridge step's time and the hints shown, tracking drops and pauses, frame rates, and the result. **Shift + L** downloads every saved session as JSON (also `?debug` › Session log, which can clear them). No camera picture or body landmarks are saved. Code: `js/core/session-log.js`; anything can add an event with `g.log(type, data)`.

**Jump to a step:** add `?step=<id>` to the address (ids in `chapter.js`), e.g. `?step=stone-run` for the Star Stone Run, or `?debug&step=stone-run` to have the debug panel too. Earlier steps are fast-forwarded, so the world is set up right.

`node tools/test-trials.mjs` checks every Gate Trials card for Little and Big (hits with the move, misses without it, freeze only while tracked, help after 3 misses, the ready gate). `node tools/test-games.mjs` plays Chapter 1's movement games (Star Stone Run, Sky Power, Gate Trials) with their real config for Little and Big, and reports each leg's time and each game's length, for a perfect player and a slower child (`--game skyPower` for one game, `--legSeconds 95` to try a longer leg time).

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
