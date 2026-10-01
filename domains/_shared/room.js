// A room: the darkroom kit boiled down to one call, for the small sites that just want a living backdrop and a gentle sound.
// Usage:  const r = room({ canvas, bpm: 84, key: 5, prog: "frahm", ascent: 0.2 });   r.sound(true) on a click.
// Sound is never automatic: browsers need a gesture, and a quiet page is a kind page.
import { Engine } from "../../kit/engine.js";
import { Conductor } from "../../kit/conductor.js";
import { Tunnel } from "../../kit/visuals.js";

export function room({ canvas, bpm = 90, key = 0, prog = "frahm", ascent = 0.2, space = 0.45, echo = 0.18, eco = null }) {
  const engine = new Engine(), conductor = new Conductor(engine);
  Object.assign(conductor, { key, prog, bpm, autoLift: true });
  engine.params.bpm = bpm;
  const tunnel = new Tunnel(canvas);
  tunnel.setEco(eco ?? ((navigator.hardwareConcurrency || 4) <= 4));
  const reduce = matchMedia("(prefers-reduced-motion: reduce)").matches;
  const st = { on: false, a: ascent, target: ascent, last: performance.now() };

  async function sound(on) {
    if (!on) { st.on = false; conductor.stop(); if (engine.voices) engine.voices.panic(); return false; }
    if (!engine.ready) await engine.start();
    else if (engine.ctx.state !== "running") await engine.resume();
    engine.setParam("bpm", bpm); engine.setParam("space", space); engine.setParam("echo", echo);
    st.on = true; conductor.setManual(st.a);
    return true;
  }
  function frame(now) {
    const dt = Math.min(0.05, (now - st.last) / 1000); st.last = now;
    st.a += (st.target - st.a) * Math.min(1, dt * 1.6);
    if (st.on) conductor.setManual(st.a);
    tunnel.frame(dt, { a: reduce ? 0.05 : st.a, level: engine.level ? engine.level() : 0 });
    requestAnimationFrame(frame);
  }
  requestAnimationFrame(frame);
  const api = {
    engine, conductor, tunnel, sound,
    get on() { return st.on; },
    set ascent(v) { st.target = v; },
    play(note, vel = 0.5, inst = "pluck") { if (st.on && engine.voices) { engine.voices.playTimed(inst, note, vel, engine.now, 0.7); tunnel.ping(note % 12, 0.8); } },
  };
  window.__room = api;                                   // a debug handle (also how the tests reach in)
  return api;
}
