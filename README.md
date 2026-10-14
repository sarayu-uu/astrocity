# Astra: The First Starway

The first playable chapter of Astra Buddies. It is one continuous adventure in a 3D floating-island world, not a menu of mini-games. Children move in front of a laptop camera, and their real movements operate the planet's ancient machinery.

## Run it

```
python -m http.server 8000
```

Open http://localhost:8000. You need to serve the folder because the camera only works on `localhost` or HTTPS. The first load needs internet for three.js, the fonts and the pose model.

## The chapter (~15 minutes)

1. **Arrival.** The camera flies through the clouds to Poppy's garden. She is yanking a glowing relic out of the ground while Nutty eats a bun. Nutty wanders off.
2. **Star Square.** Explore by dragging, scrolling, or using WASD. Click characters and buildings. Lumi is tinkering at the workshop, Mimi is rehearsing by the fountain, and Zuzu is asleep under the big tree. Zuzu (with one eye) saw Nutty head to the old bridge.
3. **The old bridge.** Nutty is stranded beside a "giant potato" across the gap.
4. **Movement 1: jump.** Poppy hops the drifting stones when the child jumps. One stone has sunk, and raising both arms lifts it.
5. **Gate Rock.** The potato is a Starway Gate. The relic fits, but there's no power.
6. **Movement 2: arm pumps.** The child cranks Lumi's Sky Crank, which fires a beam across the gap.
7. **Movement 3: poses.** The gate's carvings are poses: star (both arms up), bridge (arms out) and moon (one arm up). Copy and hold each one.
8. **The Starway returns.** The bridge reconnects, and Nutty trips into a hug. The camera pulls back as a second Starway lights up toward **Glow Forest**: *New route discovered*.

There are no scores, stars or fail states. A mistimed jump only makes Poppy wobble. If the child steps out of view, the adventure pauses until they come back.

**Keyboard fallback:**

| Key | Action |
|---|---|
| Space | Jump |
| W / ↑ | Arms up (hold to lift, tap to crank) |
| 1 / 2 / 3 | Star / bridge / moon pose |

## Code

```
js/main.js     renderer, bloom, picking, pause-when-unseen, shared game context
js/story.js    the whole chapter as one script, plus the three movement missions
js/world.js    Star Square, the bridge, Gate Rock, Glow Forest, far islands, sky
js/buddies.js  the five plush characters and their animation states
js/camera.js   cinematic moves, fly-throughs, follow shots, explore controls
js/input.js    webcam + MediaPipe Pose -> jump, arms up/down, three poses
js/ui.js       subtitle dialogue, barks, place name, objective, move coach
js/audio.js    synthesized ambient music and effects
```

Missions are plain async functions built on `await g.frame()`. That makes the next chapter's missions (Glow Forest: reaching, pose matching) easy to add in `story.js` style.

## Known gaps

- The jump and pose thresholds in `js/input.js` are first guesses. They need tuning with real kids in a real room.
- The characters are built in code from the reference sheet. They are close stand-ins, not final art. Swapping in modelled GLB characters later would mean replacing `Buddy` construction only, since animation states are separate.
- "Read lines aloud" uses the browser's built-in voices, which sound robotic. Real voice acting would be a big upgrade.

The first prototype (the mini-game version) is archived in `archive/v1/`.
