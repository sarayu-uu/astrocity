// A playtest session log ("play records"): what happened while a child played, saved on this
// computer and downloaded as JSON to send back. On with Settings › Record play sessions, or
// ?log / ?debug in the address. ?kid=A1 labels the session so it matches a tester sheet.
//
//   g.log(type, data)     anything can add an event; with logging off it does nothing
//   Shift + L             download every saved session (also ?debug › Session log)
//
// Each page load is one session. Sessions stay in localStorage until cleared, so a missed
// download loses nothing. No camera picture or body landmarks are saved.

const KEY = 'astra.sessions.v1';
let keyBound = false; // Shift + L is set up once, however often recording is switched on
let currentSave = null;
const FPS_EVERY = 10; // seconds between frame-rate samples

export function loadSessions() {
  try {
    return JSON.parse(localStorage.getItem(KEY)) ?? [];
  } catch {
    return [];
  }
}

export function clearSessions() {
  try {
    localStorage.removeItem(KEY);
  } catch {
    // No storage: nothing to clear.
  }
}

// Every saved session, with a summary of each, as a downloaded .json file.
export function downloadSessions() {
  const sessions = loadSessions().map(s => ({ ...s, summary: summarize(s) }));
  const blob = new Blob([JSON.stringify({ exportedAt: new Date().toISOString(), sessions }, null, 1)], { type: 'application/json' });
  const a = document.createElement('a');
  const d = new Date();
  const pad = n => String(n).padStart(2, '0');
  a.download = `astra-sessions-${d.getFullYear()}-${pad(d.getMonth() + 1)}-${pad(d.getDate())}-${pad(d.getHours())}${pad(d.getMinutes())}.json`;
  a.href = URL.createObjectURL(blob);
  a.click();
  setTimeout(() => URL.revokeObjectURL(a.href), 2000);
  return sessions.length;
}

export function startSessionLog(g, { kid = null, step = null } = {}) {
  const t0 = performance.now();
  const session = {
    id: new Date().toISOString(),
    kid,
    step,
    url: location.href,
    device: {
      userAgent: navigator.userAgent,
      cores: navigator.hardwareConcurrency ?? null,
      memoryGB: navigator.deviceMemory ?? null,
      screen: `${screen.width}x${screen.height}`,
      pixelRatio: devicePixelRatio,
    },
    events: [],
  };
  const now = () => Math.round(performance.now() - t0) / 1000;

  let saveTimer = null;
  const save = () => {
    clearTimeout(saveTimer);
    saveTimer = null;
    if (session.events.length < 2) return; // nothing happened yet: don't keep an empty session
    try {
      const all = loadSessions().filter(s => s.id !== session.id);
      all.push(session);
      localStorage.setItem(KEY, JSON.stringify(all));
    } catch {
      // Storage full or blocked: the download button still has this session in memory.
    }
  };
  const saveSoon = () => { saveTimer ??= setTimeout(save, 1000); };
  addEventListener('pagehide', save);

  g.log = (type, data = {}) => {
    session.events.push({ t: now(), type, ...data });
    saveSoon();
  };
  g.log('session', { age: g.settings.age });

  currentSave = save;
  if (!keyBound) {
    keyBound = true;
    addEventListener('keydown', e => {
      if (e.code === 'KeyL' && e.shiftKey) {
        currentSave?.();
        const n = downloadSessions();
        flash(`Saved ${n} session${n === 1 ? '' : 's'}`);
      }
    });
  }

  // Called every frame by the main loop: tracking drops, pauses and frame rates.
  let tracked = true, dropAt = 0, paused = false, pauseAt = 0, fpsT = 0, frames = 0;
  const bodyFps = [];
  return {
    session,
    save,
    tick(realDt, { input, needsBody, isPaused, pauseWhy }) {
      // A short drop in tracking while a movement game runs (a long one also pauses play).
      const ok = !needsBody || !input.camera || input.tracking;
      if (!ok && tracked) dropAt = now();
      if (ok && !tracked) g.log('tracking.drop', { seconds: Math.round((now() - dropAt) * 10) / 10 });
      tracked = ok;
      if (isPaused && !paused) {
        pauseAt = now();
        g.log('pause', { why: pauseWhy });
      }
      if (!isPaused && paused) g.log('resume', { pausedSeconds: Math.round((now() - pauseAt) * 10) / 10 });
      paused = isPaused;
      // Frame rates, every few seconds while a movement game runs.
      frames++;
      fpsT += realDt;
      if (input.camera) bodyFps.push(input.debug.fps);
      if (fpsT >= FPS_EVERY) {
        if (needsBody) {
          const body = bodyFps.length ? bodyFps.reduce((s, v) => s + v, 0) / bodyFps.length : null;
          g.log('fps', { game: Math.round(frames / fpsT), body: body === null ? null : Math.round(body) });
        }
        fpsT = 0;
        frames = 0;
        bodyFps.length = 0;
      }
    },
  };
}

// The numbers a tester cares about, from a session's events: per activity, the time for the
// teach part, each leg and each bridge step; stumbles; hints; tracking; result.
export function summarize(session) {
  const activities = [];
  let a = null, leg = null, bridge = null, step = null;
  const r1 = v => Math.round(v * 10) / 10;
  for (const e of session.events) {
    switch (e.type) {
      case 'activity.start':
        a = { id: e.id, age: e.age, play: e.play, start: e.t, legs: [], bridges: [], cards: {}, rounds: [], hints: {}, trackingDrops: 0, pauses: 0, pausedSeconds: 0, fps: [] };
        activities.push(a);
        break;
      case 'leg.start':
        if (a) a.legs.push((leg = { leg: e.leg, theme: e.theme, teach: !!e.teach, endless: !!e.endless, start: e.t, stumbles: {}, untrackedStumbles: 0 }));
        break;
      case 'teach.done':
        if (leg) leg.teachDoneAfter = r1(e.t - leg.start);
        break;
      case 'hit':
        if (leg) {
          leg.stumbles[e.kind] = (leg.stumbles[e.kind] ?? 0) + 1;
          if (e.untracked) leg.untrackedStumbles++;
        }
        break;
      case 'leg.end':
        if (leg) Object.assign(leg, { seconds: r1(e.t - leg.start), playSeconds: e.playSeconds, buns: e.buns, bunsSeen: e.bunsSeen, cleared: e.cleared });
        break;
      case 'bridge.start':
        if (a) a.bridges.push((bridge = { name: e.name, start: e.t, steps: [] }));
        break;
      case 'step.ready':
        if (bridge) bridge.steps.push((step = { move: e.move, need: e.need, readyAt: e.t, hints: {} }));
        break;
      case 'step.go':
        if (step) {
          step.readySeconds = r1(e.t - step.readyAt);
          step.goAt = e.t;
        }
        break;
      case 'step.done':
        if (step) step.moveSeconds = r1(e.t - (step.goAt ?? step.readyAt));
        break;
      case 'help':
        if (step) step.hints[e.kind] = (step.hints[e.kind] ?? 0) + 1;
        if (a) a.hints[e.kind] = (a.hints[e.kind] ?? 0) + 1;
        break;
      case 'bridge.end':
        if (bridge) bridge.seconds = r1(e.t - bridge.start);
        break;
      // Gate Trials: hits and misses per card type, and each round's tiles (# won, . missed).
      case 'card.hit':
      case 'card.miss':
        if (a) {
          const c = (a.cards[e.card] ??= { hits: 0, misses: 0 });
          if (e.type === 'card.hit') c.hits++;
          else c.misses++;
        }
        break;
      case 'round.end':
        if (a) a.rounds.push({ round: e.round, tiles: (e.tiles ?? []).map(x => (x ? '#' : '.')).join(''), at: e.t });
        break;
      case 'tracking.drop':
        if (a) a.trackingDrops++;
        break;
      case 'pause':
        if (a) a.pauses++;
        break;
      case 'resume':
        if (a) a.pausedSeconds = r1(a.pausedSeconds + e.pausedSeconds);
        break;
      case 'fps':
        if (a) a.fps.push(e);
        break;
      case 'result':
        if (a) a.result = { stars: e.stars, buns: e.buns, bunsSeen: e.bunsSeen, distance: e.distance, choice: e.choice };
        break;
      case 'activity.end':
        if (a) a.totalSeconds = r1(e.t - a.start);
        break;
    }
  }
  for (const act of activities) {
    for (const l of act.legs) delete l.start;
    for (const b of act.bridges) {
      delete b.start;
      for (const s of b.steps) {
        delete s.readyAt;
        delete s.goAt;
      }
    }
    const games = act.fps.map(f => f.game), bodies = act.fps.map(f => f.body).filter(v => v !== null);
    act.fps = {
      game: games.length ? { min: Math.min(...games), avg: Math.round(games.reduce((s, v) => s + v, 0) / games.length) } : null,
      body: bodies.length ? { min: Math.min(...bodies), avg: Math.round(bodies.reduce((s, v) => s + v, 0) / bodies.length) } : null,
    };
    delete act.start;
  }
  return { kid: session.kid, age: session.events.find(e => e.type === 'activity.start')?.age ?? null, activities };
}

function flash(text) {
  const el = document.createElement('div');
  el.textContent = text;
  el.style.cssText = 'position:fixed;left:50%;bottom:24px;transform:translateX(-50%);z-index:40;padding:8px 16px;border-radius:999px;background:rgba(16,20,40,.85);color:#fff;font:600 15px/1.3 system-ui';
  document.body.appendChild(el);
  setTimeout(() => el.remove(), 2200);
}
