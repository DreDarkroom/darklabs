// Penrose: interface and wiring.

import { Engine } from "./engine.js";
import { Conductor, SECTIONS, ARC_BARS } from "./conductor.js";
import { Midi } from "./midi.js";
import { Tunnel, ArcGraph, arcColor } from "./visuals.js";
import { PROGRESSIONS, NOTE_NAMES, KEY_SEQUENCE, clamp, isBlack, noteName, inMode, snapToMode } from "./theory.js";

const $ = (id) => document.getElementById(id);
const INSTS = [{ id: "piano", name: "Felt Piano" }, { id: "pluck", name: "Pluck" }, { id: "pad", name: "Pad" }];
const PAD_ORDER = [4, 5, 6, 7, 0, 1, 2, 3];
const PAD_ROLE = ["root", "3rd", "5th", "7th", "octave", "3rd ↑", "5th ↑", "9th"];

const DEFAULTS = { v: 2, stair: 60, cowbell: 0, eco: "auto", inst: "piano", key: 2, prog: "frahm", arc: "medium", bpm: 104, felt: 100, space: 30, echo: 15, tape: 40, guide: true, pads: false, lowC: 48, lift: "1", metro: "0", seenHelp: false };
let S = { ...DEFAULTS };
try { Object.assign(S, JSON.parse(localStorage.getItem("penrose.v1") || "{}")); } catch (e) { /* private mode */ }
if (S.v !== 2) Object.assign(S, { v: 2, cowbell: 0, eco: "auto" });
const save = () => { try { localStorage.setItem("penrose.v1", JSON.stringify(S)); } catch (e) { /* ignore */ } };

const engine = new Engine();
const conductor = new Conductor(engine);
let tunnel = null, arcGraph = null, midi = null, lap = 0;
const held = new Map();                 // note id -> { voices, m }
const ptr = new Map();                  // pointerId -> { id, m }
let keyEls = new Map(), view = { lowC: 48, whites: 14, last: 71, qwBase: 48 };

// ───────────────────────────────────────────────────────── helpers

const snap = (m) => (S.guide ? snapToMode(m, conductor.root, "minor") : m);
const secName = () => {
  if (conductor.mode === "auto" && conductor.running) return SECTIONS[conductor.sec];
  const a = conductor.a; return a < 0.07 ? "Intro" : a < 0.78 ? "Climb" : a < 0.97 ? "Build" : "Peak";
};

const lastFx = {};
function applyFx() {
  const want = {
    space: clamp(S.space / 100 + 0.3 * conductor.a, 0, 1), echo: clamp(S.echo / 100 + 0.22 * Math.max(0, conductor.a - 0.4), 0, 1),
    tape: S.tape / 100, felt: S.felt / 100,
  };
  for (const k in want) if (lastFx[k] === undefined || Math.abs(lastFx[k] - want[k]) > 0.004) { lastFx[k] = want[k]; engine.setParam(k, want[k]); }   // only when it changed
  conductor.cowbell = S.cowbell / 100; conductor.stair = S.stair / 100;
}

/** Eco (lighter visuals): on when asked, or automatically on machines reporting 4 cores or fewer. */
function applyEco() { if (tunnel) tunnel.setEco(S.eco === "1" || (S.eco === "auto" && (navigator.hardwareConcurrency || 4) <= 4)); }

// ───────────────────────────────────────────────────────── playing

function press(id, m, vel, raw = false) {
  if (!engine.ready || held.has(id)) return;
  if (!raw) m = snap(m);
  const t = engine.now;
  const v = engine.voices.start(S.inst, m, vel, t);
  held.set(id, { v, m });
  conductor.remember(m, t);
  lightKey(m, "down", true);
  if (tunnel) tunnel.ping(((m % 12) + 12) % 12, 0.4 + 0.5 * vel);
}

function release(id) {
  const h = held.get(id); if (!h) return;
  held.delete(id);
  engine.voices.noteOff(h.v, engine.now);
  if (![...held.values()].some((o) => o.m === h.m)) lightKey(h.m, "down", false);
}

function releaseAll() { for (const id of [...held.keys()]) release(id); ptr.clear(); }

function setPedal(on) {
  if (!engine.ready) return;
  engine.voices.setPedal(on);
  $("sustain").setAttribute("aria-pressed", String(on));
}

// ───────────────────────────────────────────────────────── keyboard

function buildKeys() {
  const host = $("keys");
  host.innerHTML = "";
  const inner = document.createElement("div"); inner.className = "keys-inner"; host.appendChild(inner);
  const W = host.clientWidth - 16, fine = matchMedia("(pointer: fine)").matches;
  const whites = clamp(Math.floor(W / (fine ? 46 : 42)), 7, 22), ww = 100 / whites, bw = ww * 0.62;
  S.lowC = clamp(Math.round(S.lowC / 12) * 12, 24, 72);
  const qwBase = S.lowC + (whites >= 14 ? 12 : 0);
  keyEls = new Map();
  let m = S.lowC, wi = 0, lastM = m;
  while (wi < whites) {
    const el = document.createElement("div"); el.dataset.midi = m;
    if (!isBlack(m)) {
      el.className = "key white"; el.style.left = wi * ww + "%"; el.style.width = ww + "%";
      const q = m - qwBase, lab = document.createElement("span"); lab.className = "lab";
      lab.textContent = m % 12 === 0 ? noteName(m) : (fine && q >= 0 && q < KEY_SEQUENCE.length ? KEY_SEQUENCE[q].toUpperCase() : "");
      el.appendChild(lab); wi++; lastM = m;
    } else { el.className = "key black"; el.style.left = wi * ww - bw / 2 + "%"; el.style.width = bw + "%"; }
    el.setAttribute("aria-label", noteName(m));
    inner.appendChild(el); keyEls.set(m, el); m++;
  }
  view = { lowC: S.lowC, whites, last: lastM, qwBase };
  $("rangeLabel").textContent = `${noteName(S.lowC)}–${noteName(lastM)}`;
  paintScale();
}

function paintScale() {
  const pcs = new Set(conductor.chordNow().tones.map((n) => ((n % 12) + 12) % 12));
  $("keys").classList.toggle("guide", S.guide);
  for (const [m, el] of keyEls) {
    el.classList.toggle("root", ((m % 12) + 12) % 12 === conductor.pc && !isBlack(m));
    el.classList.toggle("off", S.guide && !inMode(m, conductor.root, "minor"));
    el.classList.toggle("tone", S.guide && pcs.has(((m % 12) + 12) % 12));
  }
}

const lightKey = (m, cls, on) => { const el = keyEls.get(m); if (el) el.classList.toggle(cls, on); };
const keyAt = (x, y) => { const el = document.elementFromPoint(x, y); return el && el.classList && el.classList.contains("key") ? el : null; };
const velAt = (e, el) => {
  if (e.pointerType === "pen" && e.pressure > 0) return clamp(0.25 + e.pressure * 0.75, 0.2, 1);
  const r = el.getBoundingClientRect(); return clamp(0.26 + 0.74 * ((e.clientY - r.top) / r.height), 0.2, 1);
};

function wireKeys() {
  const host = $("keys");
  host.addEventListener("pointerdown", (e) => {
    const el = keyAt(e.clientX, e.clientY); if (!el) return;
    e.preventDefault(); engine.resume();
    try { host.setPointerCapture(e.pointerId); } catch (err) { /* synthetic */ }
    const m = +el.dataset.midi, id = "p" + e.pointerId; ptr.set(e.pointerId, { id, m }); press(id, m, velAt(e, el));
  });
  host.addEventListener("pointermove", (e) => {
    const p = ptr.get(e.pointerId); if (!p) return;
    const el = keyAt(e.clientX, e.clientY); if (!el) return;
    const m = +el.dataset.midi; if (m === p.m) return;
    release(p.id); p.m = m; press(p.id, m, Math.min(velAt(e, el), 0.6));
  });
  const up = (e) => { const p = ptr.get(e.pointerId); if (!p) return; release(p.id); ptr.delete(e.pointerId); };
  host.addEventListener("pointerup", up); host.addEventListener("pointercancel", up); host.addEventListener("lostpointercapture", up);
  host.addEventListener("contextmenu", (e) => e.preventDefault());

  const qDown = new Set();
  addEventListener("keydown", (e) => {
    if (e.ctrlKey || e.metaKey || e.altKey) return;
    const tag = e.target && e.target.tagName; if (tag === "INPUT" || tag === "SELECT" || tag === "TEXTAREA") return;
    const k = e.key.toLowerCase();
    if (k === " " && tag !== "BUTTON" && tag !== "SUMMARY") { e.preventDefault(); if (!e.repeat) setPedal(true); return; }
    if (e.repeat) return;
    if (k === "z") { shiftOct(-1); return; } if (k === "x") { shiftOct(1); return; }
    const i = KEY_SEQUENCE.indexOf(k);
    if (i >= 0 && engine.ready) { qDown.add(k); engine.resume(); press("k" + k, view.qwBase + i, 0.55 + Math.random() * 0.14); }
  });
  addEventListener("keyup", (e) => {
    const k = e.key.toLowerCase();
    if (k === " ") { if (!$("sustain").dataset.latched) setPedal(false); return; }
    if (qDown.delete(k)) release("k" + k);
  });
  addEventListener("blur", () => { releaseAll(); qDown.clear(); });
  document.addEventListener("visibilitychange", () => { if (document.hidden) { releaseAll(); qDown.clear(); } });
}

function shiftOct(d) { S.lowC = clamp(S.lowC + d * 12, 24, 72); save(); releaseAll(); buildKeys(); }

// ───────────────────────────────────────────────────────── pads (a drum-style way in)

function padNotes() {
  const c = conductor.chordNow();
  const raw = c.arp.map((n, i) => (i === 7 ? c.tones[4] : n));
  const shift = Math.max(...raw) > 81 ? -12 : 0;
  return raw.map((m) => m + shift);
}

function buildPads() {
  const host = $("pads"); host.innerHTML = "";
  PAD_ORDER.forEach((idx) => {
    const d = document.createElement("div"); d.className = "pad" + (idx === 0 ? " root" : ""); d.dataset.idx = idx;
    d.innerHTML = `<span class="n"></span><span class="r">${PAD_ROLE[idx]}</span>`; host.appendChild(d);
  });
  const down = new Map();
  host.addEventListener("pointerdown", (e) => {
    const pad = e.target.closest(".pad"); if (!pad) return;
    e.preventDefault(); engine.resume();
    try { host.setPointerCapture(e.pointerId); } catch (err) { /* synthetic */ }
    const r = pad.getBoundingClientRect(), vel = clamp(0.3 + 0.7 * ((e.clientY - r.top) / r.height), 0.25, 1);
    const id = "pad" + e.pointerId; down.set(e.pointerId, { id, pad }); pad.classList.add("down");
    press(id, padNotes()[+pad.dataset.idx], vel, true);
  });
  const up = (e) => { const d = down.get(e.pointerId); if (!d) return; down.delete(e.pointerId); d.pad.classList.remove("down"); release(d.id); };
  host.addEventListener("pointerup", up); host.addEventListener("pointercancel", up); host.addEventListener("lostpointercapture", up);
  host.addEventListener("contextmenu", (e) => e.preventDefault());
  updatePads();
}

function updatePads() {
  const notes = padNotes();
  $("pads").querySelectorAll(".pad").forEach((d) => { d.querySelector(".n").textContent = noteName(notes[+d.dataset.idx]); });
}

function setPadsMode(on) {
  S.pads = on; save(); releaseAll();
  $("pads").hidden = !on; $("keys").hidden = on;
  $("padsBtn").setAttribute("aria-pressed", String(on));
  document.querySelectorAll("#octDown, #octUp, #rangeLabel").forEach((el) => { el.hidden = on; });
  if (on) updatePads();
  updateCoach();
}

function setGuide(on) { S.guide = on; save(); $("guideBtn").setAttribute("aria-pressed", String(on)); paintScale(); updateCoach(); }

function updateCoach() {
  let t;
  if (!conductor.running) t = conductor.a > 0.02 ? "Holding. Press <b>Climb</b> to carry on from here." : "Play a few slow notes. When you're ready, press <b>Climb</b>.";
  else if (conductor.mode === "hold") t = "You're holding the <b>Ascent</b>. Press <b>Climb</b> to let the arc carry on from here.";
  else t = ({
    Intro: "<b>Intro.</b> Just the piano. Play over it, or let it breathe.",
    Climb: "<b>Climb.</b> Layers are arriving. Play the <b>glowing</b> keys: they fit the chord.",
    Build: "<b>Build.</b> Here it comes. Listen for the roll.",
    Peak: "<b>Peak.</b> Everything is open.",
    Release: "<b>Release.</b> Falling back to the piano. The key lifts next lap.",
  })[secName()] || "";
  if (S.guide && S.pads && conductor.running) t += " Tap the pads: every one is a note from the chord.";
  $("coach").innerHTML = t;
}

// ───────────────────────────────────────────────────────── UI

function buildUI() {
  const inst = $("inst");
  INSTS.forEach((it) => {
    const b = document.createElement("button"); b.type = "button"; b.textContent = it.name; b.dataset.inst = it.id;
    b.setAttribute("role", "radio"); b.setAttribute("aria-checked", String(S.inst === it.id));
    b.onclick = () => { S.inst = it.id; save(); releaseAll(); inst.querySelectorAll("button").forEach((x) => x.setAttribute("aria-checked", String(x === b))); };
    inst.appendChild(b);
  });

  const sel = (id, items, val) => { const s = $(id); items.forEach(([v, t]) => { const o = document.createElement("option"); o.value = v; o.textContent = t; s.appendChild(o); }); s.value = val; return s; };
  const harmonyChanged = () => { conductor.chord = null; save(); paintScale(); updatePads(); };
  sel("key", NOTE_NAMES.map((n, i) => [i, n + " minor"]), S.key).onchange = (e) => { S.key = +e.target.value; conductor.key = S.key; harmonyChanged(); };
  sel("prog", Object.entries(PROGRESSIONS).map(([k, v]) => [k, v.name]), S.prog).onchange = (e) => { S.prog = e.target.value; conductor.prog = S.prog; harmonyChanged(); };
  $("lift").value = S.lift; $("lift").onchange = (e) => { S.lift = e.target.value; conductor.autoLift = S.lift === "1"; save(); };
  $("metro").value = S.metro; $("metro").onchange = (e) => { S.metro = e.target.value; conductor.metro = S.metro === "1"; save(); };
  $("arcSel").value = S.arc; $("arcSel").onchange = (e) => { S.arc = e.target.value; conductor.arc = S.arc; conductor.arcBar = 0; save(); };
  Object.assign(conductor, { key: S.key, prog: S.prog, arc: S.arc, bpm: S.bpm, autoLift: S.lift === "1", metro: S.metro === "1" });

  $("eco").value = S.eco; $("eco").onchange = (e) => { S.eco = e.target.value; save(); applyEco(); };
  for (const id of ["felt", "space", "echo", "tape", "cowbell", "stair"]) {
    const el = $(id); el.value = S[id]; el.addEventListener("input", () => { S[id] = +el.value; save(); applyFx(); });
  }
  const bpm = $("bpm"); bpm.value = S.bpm; $("bpmOut").textContent = S.bpm;
  bpm.addEventListener("input", () => { S.bpm = +bpm.value; conductor.bpm = S.bpm; engine.setParam("bpm", S.bpm); $("bpmOut").textContent = S.bpm; save(); });

  $("octDown").onclick = () => shiftOct(-1); $("octUp").onclick = () => shiftOct(1);
  $("sustain").onclick = (e) => { const on = e.currentTarget.getAttribute("aria-pressed") !== "true"; if (on) e.currentTarget.dataset.latched = "1"; else delete e.currentTarget.dataset.latched; setPedal(on); };
  $("padsBtn").onclick = () => setPadsMode(!S.pads);
  $("guideBtn").onclick = () => setGuide(!S.guide);
  $("howto").open = !S.seenHelp; S.seenHelp = true; save();

  // the climb
  const slider = $("ascent");
  slider.addEventListener("input", () => { conductor.setManual(+slider.value / 1000); applyFx(); paintClimb(); updateCoach(); });
  let dragging = false;
  slider.addEventListener("pointerdown", () => { dragging = true; engine.resume(); });
  addEventListener("pointerup", () => { dragging = false; }); addEventListener("pointercancel", () => { dragging = false; });
  window.__dragging = () => dragging;
  $("climb").onclick = () => { engine.resume(); conductor.toggleAuto(); paintClimb(); updateCoach(); };
  conductor.on("mode", () => { paintClimb(); updateCoach(); });
  conductor.on("transport", () => { paintClimb(); updateCoach(); paintScale(); updatePads(); });
  conductor.on("section", () => updateCoach());
  conductor.on("cycle", () => { lap++; });

  conductor.on("bar", (b) => {
    const delay = Math.max(0, (b.t - engine.now) * 1000);
    setTimeout(() => {
      $("chordLine").textContent = `${b.label}  ·  ${b.roman}`;
      paintScale(); updatePads();
      if (engine.voices.pedal) engine.voices.liftPedal();             // the pedal clears itself at each chord change
    }, delay);
  });
  conductor.on("beat", (b) => {
    const dots = [...$("beats").children], delay = Math.max(0, (b.t - engine.now) * 1000);
    setTimeout(() => { dots.forEach((d, i) => d.classList.toggle("on", i === b.beat)); setTimeout(() => dots[b.beat].classList.remove("on"), 140); if (tunnel) tunnel.beat(b.beat === 0); }, delay);
  });
  conductor.on("drop", (d) => setTimeout(() => tunnel && tunnel.boom(), Math.max(0, (d.t - engine.now) * 1000)));
  conductor.on("note", (n) => {
    if (n.inst === "pad" || n.inst === "bass") return;
    const delay = Math.max(0, (n.t - engine.now) * 1000), m = n.midi;
    setTimeout(() => {
      if (tunnel && n.inst !== "pluck") tunnel.ping(((m % 12) + 12) % 12, 0.3 + 0.4 * n.vel);
      const el = keyEls.get(m); if (!el) return;
      el.classList.add("ghost"); setTimeout(() => el.classList.remove("ghost"), 240);
    }, delay);
  });
  engine.on("state", (s) => { $("stateChip").hidden = s === "running"; });

  // MIDI
  const mb = $("midiBtn");
  midi = new Midi({
    onOn: (n, v) => press("m" + n, n, Math.max(0.12, v)), onOff: (n) => release("m" + n), onPedal: (on) => setPedal(on),
    onPanic: () => { releaseAll(); engine.voices.panic(); },
    onBloom: (v) => { slider.value = Math.round(v * 1000); slider.dispatchEvent(new Event("input")); },
    onPorts: (ports) => { mb.classList.toggle("on", ports.length > 0); mb.textContent = ports.length ? "MIDI · " + ports[0].name.slice(0, 18) : "MIDI"; $("midiLine").textContent = ports.length ? `MIDI in: ${ports.map((p) => p.name).join(", ")}` : "MIDI enabled. Plug in a keyboard."; },
  });
  if (!midi.supported) { mb.title = "Web MIDI isn't available in this browser; touch and keyboard still work."; mb.textContent = "no MIDI"; mb.disabled = true; }
  mb.onclick = async () => { try { await midi.enable(); } catch (e) { $("midiLine").textContent = e.message; } };
}

function paintClimb() {
  const b = $("climb"), on = conductor.mode === "auto" && conductor.running;
  b.dataset.on = String(on);
  b.innerHTML = on ? "&#10074;&#10074; Pause" : (conductor.a > 0.02 ? "&#9654; Continue" : "&#9654; Climb");
}

// ───────────────────────────────────────────────────────── frame loop + boot

function frameLoop() {
  let last = performance.now(), n = 0, accT = 0;
  const f = (now) => {
    const dt = (now - last) / 1000; last = now; accT += dt; n++;
    const a = conductor.a;
    if (tunnel) tunnel.frame(dt, { a, level: engine.level() });
    if (accT > 0.12) {
      accT = 0;
      const slider = $("ascent");
      if (conductor.mode === "auto" && conductor.running && !window.__dragging()) slider.value = Math.round(a * 1000);
      const [r, g, b] = arcColor(a), root = document.documentElement.style;
      root.setProperty("--acc", `rgb(${r | 0},${g | 0},${b | 0})`); root.setProperty("--accrgb", `${r | 0}, ${g | 0}, ${b | 0}`); root.setProperty("--glow", `rgba(${r | 0}, ${g | 0}, ${b | 0}, .5)`);
      $("secName").textContent = secName();
      $("keyLine").textContent = `${NOTE_NAMES[conductor.pc]} minor · lap ${lap + 1} · ${conductor.mode === "auto" && conductor.running ? "auto" : "hold"}`;
      if (arcGraph) arcGraph.draw(conductor.N, a, conductor.arcBar, conductor.mode === "auto");
      if (conductor.running) applyFx();
    }
    requestAnimationFrame(f);
  };
  requestAnimationFrame(f);
}

let resizeT = 0;
function onResize() { clearTimeout(resizeT); resizeT = setTimeout(() => { if (!$("app").hidden) { releaseAll(); buildKeys(); } }, 150); }

async function begin() {
  const btn = $("startBtn"); btn.disabled = true; $("startErr").textContent = "";
  try { await engine.start(); } catch (e) { console.error(e); btn.disabled = false; $("startErr").textContent = e.message || "Couldn't start audio."; return; }
  engine.setParam("bpm", S.bpm); applyFx();
  $("app").hidden = false; $("start").classList.add("gone"); setTimeout(() => $("start").remove(), 900);
  if (arcGraph) arcGraph.resize();
  buildKeys(); buildPads(); setPadsMode(S.pads); setGuide(S.guide); paintClimb(); updateCoach();
  if (arcGraph) arcGraph.resize();
  // a soft welcome: the key's minor-ninth chord, spread low to high
  const t = engine.now + 0.12, wc = conductor.chordNow().tones;
  [[wc[0] - 12, 0], [wc[2] - 12, 0.26], [wc[4] - 12, 0.55], [wc[1], 0.85], [wc[3], 1.2]].forEach(([n, d], i) => engine.voices.playTimed("piano", n, 0.3 + i * 0.03, t + d, 2));
}

addEventListener("DOMContentLoaded", () => {
  tunnel = new Tunnel($("sky")); applyEco();
  arcGraph = new ArcGraph($("arcmap"));
  buildUI(); wireKeys(); frameLoop();
  addEventListener("resize", onResize);
  document.addEventListener("pointerdown", () => { if (engine.ctx && engine.ctx.state !== "running") engine.resume(); }, true);
  $("startBtn").addEventListener("click", begin);
  if ("serviceWorker" in navigator && location.protocol.startsWith("http")) navigator.serviceWorker.register("sw.js").catch(() => {});
});

window.__pn = { engine, conductor, press, release, setPedal, setGuide, setPadsMode, padNotes, buildKeys, noteName, get S() { return S; } };
