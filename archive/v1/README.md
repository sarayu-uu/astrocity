# Astra Buddies: motion-game prototype

A browser prototype of the Astra Buddies motion games. Kids move in front of a webcam to play.
Pose tracking runs fully in the browser with MediaPipe Pose Landmarker, so no video leaves the device.

## Run it

The camera only works on `localhost` or HTTPS, so serve the folder rather than opening the file directly:

```
python -m http.server 8000
```

Then open http://localhost:8000. An internet connection is needed the first time, to load the font and the pose model.

## The games

| Game | Region | Movement | How it works |
|---|---|---|---|
| Poppy's Bubble Hop | Bubble Bay | Jump | Jump to hop Poppy over the bubbles. Bumping one only makes her dizzy for a moment. |
| Mimi's Freeze Dance | Star Square | Dance, freeze | Dance while the music plays. Hold still when it stops (after a short grace period). |

- **Age setting:** "Little ones" get slower bubbles, a JUMP! prompt, fewer rounds, a longer freeze grace period and looser thresholds.
- **Safety and forgiveness:** there are no lives and no fail states. The game pauses whenever the child leaves the camera's view.
- **Keyboard fallback:** Space to jump. Hold ←/→ (or wiggle the mouse) to dance, and let go to freeze.

## Tuning

Motion detection lives in `js/input.js`:

- **Jump:** the hips rise above their resting height by more than `JUMP_SENSITIVITY` torso-lengths.
- **Energy:** how far the body travels over about 250 ms, in torso-lengths per second.

The Freeze Dance thresholds (`danceAt`, `stillBelow`) are at the top of `js/games/freeze.js`. These are first guesses and need testing with real kids. In camera mode, press `?` to show live energy readings in the camera preview.

## Structure

```
index.html, style.css   screens (start, game picker, results) and layout
js/main.js              screen flow, game loop, letterboxed 1280x720 canvas, pause-on-lost-tracking
js/input.js             webcam + MediaPipe -> jump / energy / tracking; keyboard fallback
js/draw.js              palette, plush-shaded buddies, scenery, particles
js/audio.js             synthesized sound effects and dance music (no audio files)
js/games/hop.js         Poppy's Bubble Hop
js/games/freeze.js      Mimi's Freeze Dance
```

To add a mission, add a class with `update(dt, input)`, `draw(ctx)`, `done`, `result` and `dispose()`. Then register it in `GAMES` in `main.js`.

## Placeholder art

The buddies are drawn in code and are placeholders. Poppy and Nutty follow the brief's descriptions. Lumi, Mimi and Zuzu are stand-in designs until their approved character references are available.
