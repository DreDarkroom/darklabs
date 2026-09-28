// ChungusCello — page wiring. Everything the page does is hooked up here; the
// sound lives in engine.js and the string itself in cello-worklet.js.

import { Engine, ARTICULATIONS, CHUG_PATTERNS, DEFAULTS } from "./engine.js";
import { Sampler, BORROW, NUM_SLOTS } from "./sampler.js";
import { Looper } from "./looper.js";
import { PhrasePlayer, PHRASES } from "./phrases.js";
import { Mic } from "./pitch.js";
import { Midi } from "./midi.js";
import { PRESETS, presetSettings } from "./presets.js";
import { Fingerboard } from "./fingerboard.js";
import { PianoKeys, BowPad, startScope, drawLoopRing, drawPeaks, drawTuner } from "./controls.js";
import { encodeWav, encodeMidi, makeZip, encodeRpp, download, normalise, stamp } from "./files.js";
import { BODY_TYPES, ROOM_TYPES } from "./fx.js";
import { TUNINGS, SCALES, DOUBLE_STOPS, KEY_SEQUENCE, pitchClassName, noteName, ftom, snapToScale, clamp } from "./theory.js";
import { lsGet, lsSet, lsDel } from "./store.js";

const $ = (id) => document.getElementById(id);
const engine = new Engine();
const sampler = new Sampler(engine);
engine.sampler = sampler;
const looper = new Looper(engine);
const phrases = new PhrasePlayer(engine);
const mic = new Mic(engine);
const midi = new Midi(engine, { onProgram: (n) => applyPreset(PRESETS[n % PRESETS.length]), onStatus: (m) => status("midiStatus", m) });

const ui = Object.assign({ octave: 0, surface: "fb", snap: "soft", range: 19, handBow: false, loopBars: "free", countIn: true, onePass: false, preset: "concert" }, lsGet("ui", {}));
let fb = null, keys = null, bowpad = null;

function status(id, msg, err = false) { const el = $(id); if (!el) return; el.textContent = msg || ""; el.classList.toggle("err", !!err); }
function saveUi() { lsSet("ui", ui); }
let saveTimer = null;
function saveSettings() { clearTimeout(saveTimer); saveTimer = setTimeout(() => lsSet("settings", engine.s), 400); }

// ======================================================================
// Settings in: share link > saved > defaults
// ======================================================================

function b64urlEncode(str) { return btoa(unescape(encodeURIComponent(str))).replace(/\+/g, "-").replace(/\//g, "_").replace(/=+$/, ""); }
function b64urlDecode(s) { s = s.replace(/-/g, "+").replace(/_/g, "/"); while (s.length % 4) s += "="; return decodeURIComponent(escape(atob(s))); }
function diffFromDefaults(s) { const out = {}; for (const k of Object.keys(DEFAULTS)) if (s[k] !== DEFAULTS[k]) out[k] = s[k]; return out; }
function sanitize(obj) {
  const out = {};
  if (!obj || typeof obj !== "object") return out;
  for (const k of Object.keys(DEFAULTS)) if (k in obj && typeof obj[k] === typeof DEFAULTS[k]) out[k] = obj[k];
  return out;
}

let sharedLoaded = false;
(function loadInitialSettings() {
  const saved = sanitize(lsGet("settings", null));
  engine.setMany(Object.assign({}, DEFAULTS, saved));
  const m = location.hash.match(/[#&]s=([A-Za-z0-9_-]+)/);
  if (m) {
    try { engine.setMany(Object.assign({}, DEFAULTS, sanitize(JSON.parse(b64urlDecode(m[1]))))); sharedLoaded = true; } catch (e) { /* bad link */ }
  }
})();

// ======================================================================
// Static UI (before audio starts)
// ======================================================================

function fillSelect(sel, entries, value) {
  sel.innerHTML = "";
  for (const [v, label] of entries) { const o = document.createElement("option"); o.value = v; o.textContent = label; sel.appendChild(o); }
  if (value != null) sel.value = String(value);
}

function buildStatic() {
  // articulations
  const arts = $("arts");
  for (const a of ARTICULATIONS) {
    const b = document.createElement("button");
    b.className = "art"; b.dataset.art = a.id; b.title = `${a.name} (${a.key}) — ${a.tip}`;
    b.setAttribute("role", "radio");
    b.innerHTML = `<span class="k">${a.key}</span><span class="n">${a.name}</span>`;
    b.addEventListener("click", () => setArt(a.id));
    arts.appendChild(b);
  }
  fillSelect($("presetSel"), PRESETS.map((p) => [p.id, p.name]).concat([["custom", "— your settings —"]]), ui.preset);
  fillSelect($("tuningSel"), Object.entries(TUNINGS).map(([k, v]) => [k, v.name]));
  fillSelect($("keySel"), Array.from({ length: 12 }, (_, i) => [i, pitchClassName(i)]));
  fillSelect($("scaleSel"), Object.entries(SCALES).map(([k, v]) => [k, v.name]));
  fillSelect($("bodySel"), Object.entries(BODY_TYPES));
  fillSelect($("roomSel"), Object.entries(ROOM_TYPES));
  fillSelect($("dsSel"), Object.entries(DOUBLE_STOPS).map(([k, v]) => [k, v.name]));
  fillSelect($("chugSel"), Object.entries(CHUG_PATTERNS).map(([k, v]) => [k, v.name]));

  // preset grid
  const grid = $("presetGrid");
  for (const p of PRESETS) {
    const b = document.createElement("button");
    b.className = "preset"; b.dataset.id = p.id;
    b.innerHTML = `<b>${p.name}</b><span>${p.desc}</span>`;
    b.addEventListener("click", () => applyPreset(p));
    grid.appendChild(b);
  }
  renderUserPresets();

  // phrases
  const list = $("phrases");
  for (const p of PHRASES) {
    const row = document.createElement("div");
    row.className = "phrase"; row.dataset.id = p.id;
    row.innerHTML = `<div><div class="nm">${p.name}</div><div class="cr">${p.credit} &middot; ${p.bpm} bpm &middot; ${p.bars} bar${p.bars > 1 ? "s" : ""}</div></div>`;
    const play = document.createElement("button"); play.className = "btn small"; play.textContent = "▶ Play";
    play.addEventListener("click", () => playPhrase(p));
    const lp = document.createElement("button"); lp.className = "btn small"; lp.textContent = "⟳ into looper";
    lp.addEventListener("click", () => phraseIntoLooper(p));
    row.append(play, lp);
    list.appendChild(row);
  }

  // surface options
  $("snapSel").value = ui.snap; $("rangeSel").value = String(ui.range);
  $("loopBars").value = String(ui.loopBars); $("countInChk").checked = ui.countIn; $("onePassChk").checked = ui.onePass;
  $("handBow").checked = ui.handBow;

  bindSettings();
  syncAll();
}

// [data-set] controls ←→ engine settings
function bindSettings() {
  for (const el of document.querySelectorAll("[data-set]")) {
    const name = el.dataset.set;
    const read = () => {
      if (el.type === "checkbox") return el.checked;
      if (el.type === "range" || el.type === "number" || "num" in el.dataset) return +el.value;
      return el.value;
    };
    const ev = el.tagName === "SELECT" || el.type === "number" ? "change" : "input";
    el.addEventListener(ev, () => {
      let v = read();
      if (typeof DEFAULTS[name] === "number" && !isFinite(v)) return;
      if (name === "a4") v = clamp(v, 400, 480);
      if (name === "transpose") v = clamp(Math.round(v), -24, 24);
      engine.set(name, v);
      markCustom();
    });
  }
}

function syncAll() {
  const s = engine.s;
  for (const el of document.querySelectorAll("[data-set]")) {
    const v = s[el.dataset.set];
    if (v == null) continue;
    if (el.type === "checkbox") el.checked = !!v; else if (document.activeElement !== el) el.value = String(v);
  }
  for (const b of document.querySelectorAll(".art")) { const on = b.dataset.art === s.articulation; b.classList.toggle("on", on); b.setAttribute("aria-checked", on); }
  $("octLabel").textContent = ui.octave > 0 ? "+" + ui.octave : String(ui.octave);
  const compact = window.innerWidth <= 560;
  const dsName = s.doubleStop === "off" || !DOUBLE_STOPS[s.doubleStop] ? "off" : DOUBLE_STOPS[s.doubleStop].name.split(" (")[0].toLowerCase();
  $("sectionBtn").textContent = (compact ? "×" : "Players: ") + s.section;
  $("dsBtn").textContent = (compact ? "2nd: " : "Double stop: ") + dsName;
  $("dsBtn").classList.toggle("on2", s.doubleStop !== "off");
  $("sectionBtn").classList.toggle("on2", s.section > 1);
  $("bpm").value = Math.round(s.bpm);
  $("metroChk").checked = !!s.metronome;
  $("dynVal").textContent = dynName(s.dynamics);
  $("bowReadout").textContent = `— ${bowName(s.bowPos)}, ${Math.round(s.pressure * 100)}% pressure`;
  for (const b of document.querySelectorAll(".preset[data-id]")) b.classList.toggle("on", b.dataset.id === ui.preset);
}

function dynName(d) { return ["ppp", "pp", "p", "mp", "mf", "f", "ff", "fff"][Math.min(7, Math.floor(d * 8))]; }
function bowName(p) { return p < 0.2 ? "sul tasto" : p < 0.4 ? "toward tasto" : p < 0.62 ? "normal" : p < 0.85 ? "toward bridge" : "ponticello"; }

engine.on("setting", (e) => {
  saveSettings();
  if (e.name === "bpm") $("bpm").value = Math.round(e.value);
  if (["articulation", "section", "doubleStop", "dynamics", "bowPos", "pressure", "metronome"].includes(e.name) || !document.querySelector(`[data-set="${e.name}"]:focus`)) syncAll();
});
engine.on("settings", () => { syncAll(); saveSettings(); });

function markCustom() { if (ui.preset !== "custom") { ui.preset = "custom"; $("presetSel").value = "custom"; saveUi(); syncAll(); } }

function setArt(id) { engine.set("articulation", id); }

function applyPreset(p, silent = false) {
  if (!p) return;
  engine.setMany(presetSettings(p, engine.s));
  ui.preset = p.id; saveUi();
  $("presetSel").value = p.id;
  if (fb) { fb.dirty = true; }
  if (keys) keys.render();
  syncAll();
  if (!silent) status("status", `Sound: ${p.name} — ${p.desc}`);
  // MeowCello needs a meow: borrow MeowSynth's if the sampler slot is empty
  if (p.id === "meowcello" && engine.ready && !sampler.hasSample()) {
    sampler.borrow(sampler.active, "meow-classic").then((sl) => { installed(sampler.active, sl); engine.set("source", "both"); status("status", "MeowCello: borrowed MeowSynth's Classic Mew and layered it with the string. Meow."); }).catch(() => {});
  }
}

// ======================================================================
// Boot
// ======================================================================

buildStatic();

$("startBtn").addEventListener("click", async () => {
  const btn = $("startBtn");
  btn.disabled = true; btn.textContent = "rosining the bow…";
  try {
    await engine.start();
    await sampler.restore();
  } catch (e) {
    console.error(e);
    status("startErr", "Couldn't start audio: " + (e && e.message ? e.message : e), true);
    btn.disabled = false; btn.textContent = "tap to rosin the bow";
    return;
  }
  $("startScreen").hidden = true;
  document.body.classList.add("playing");
  $("panel").hidden = false;
  $("drawers").hidden = false;
  afterStart();
});

function afterStart() {
  fb = new Fingerboard($("fingerboard"), engine, { range: ui.range, snap: ui.snap });
  keys = new PianoKeys($("keyboard"), engine, () => 48 + 12 * ui.octave);
  bowpad = new BowPad($("bowpad"), $("bowCanvas"), engine, () => { markCustom(); });
  bowpad.setHandBow(ui.handBow);
  startScope($("scope"), engine);
  setSurface(ui.surface);
  wirePanel();
  wireLooper();
  wireVoice();
  wireRecorder();
  wireMidi();
  wirePresets();
  wireLearn();
  wireKeyboard();
  wireVR();
  renderSlots();
  updateDock();
  window.addEventListener("resize", updateDock);
  // short landscape screens (phones sideways): bring the whole fingerboard into view
  const fitBoard = () => { if (window.innerHeight < 520 && window.innerWidth > window.innerHeight && ui.surface === "fb") $("fingerboard").scrollIntoView({ block: "center", behavior: "smooth" }); };
  setTimeout(fitBoard, 150);
  window.addEventListener("orientationchange", () => setTimeout(fitBoard, 350));
  syncAll();
  if (sharedLoaded) status("status", "Loaded a shared sound from the link. Play!");
  else if (!engine.worklet) status("status", "This browser has no AudioWorklet, so you're hearing a simple fallback voice instead of the string model. Try an up-to-date Chrome, Edge, Firefox or Safari.", true);
  else status("status", "Ready. Touch the fingerboard, or play the computer keys A–' (Z/X for octaves).");
  // hello: a single open C, gently
  engine.noteOn("hello", 36, 0.5, { art: "arco", noDouble: true, noSection: true, noTranspose: true });
  setTimeout(() => engine.noteOff("hello"), 900);
  registerSW();
}

function updateDock() { $("dock").hidden = !(window.innerWidth <= 760 && !$("panel").hidden); }

function registerSW() {
  if (!("serviceWorker" in navigator)) return;
  if (location.protocol !== "https:" && location.hostname !== "localhost" && location.hostname !== "127.0.0.1") return;
  navigator.serviceWorker.register("sw.js").catch(() => {});
}

// ======================================================================
// Panel: quick controls, surface, bow row
// ======================================================================

function setSurface(which) {
  ui.surface = which; saveUi();
  $("tabFb").classList.toggle("on", which === "fb"); $("tabFb").setAttribute("aria-selected", which === "fb");
  $("tabKeys").classList.toggle("on", which === "keys"); $("tabKeys").setAttribute("aria-selected", which === "keys");
  $("fingerboard").hidden = which !== "fb"; $("fbHelp").hidden = which !== "fb"; $("fbOpts").hidden = which !== "fb";
  $("keysWrap").hidden = which !== "keys";
  if (which === "fb" && fb) { fb.resize(); fb.dirty = true; }
  if (which === "keys" && keys) keys.render();
}

function shiftOctave(d) {
  ui.octave = clamp(ui.octave + d, -1, 3); saveUi();
  $("octLabel").textContent = ui.octave > 0 ? "+" + ui.octave : String(ui.octave);
  if (keys) keys.render();
}

const SECTIONS = [1, 2, 4, 8];
const DS_ORDER = ["off", "fifth", "octave", "third", "sixth", "fourth", "fifth_oct"];
function cycleSection() { engine.set("section", SECTIONS[(SECTIONS.indexOf(engine.s.section) + 1) % SECTIONS.length]); markCustom(); }
function cycleDouble() { engine.set("doubleStop", DS_ORDER[(DS_ORDER.indexOf(engine.s.doubleStop) + 1) % DS_ORDER.length]); markCustom(); }
function toggleDrone() {
  const root = 36 + (engine.s.keyRoot % 12);
  const on = engine.toggleDrone([root, root + 7]);
  $("droneBtn").classList.toggle("on2", on); $("dockDrone").classList.toggle("on2", on);
  status("status", on ? `Drone on: ${noteName(root)} + ${noteName(root + 7)} (the key's root and fifth — change key in Sound).` : "Drone off.");
}
function panic() { engine.panic(); phrases.stop(); if (fb) fb.releaseAll(); stopSing(); $("droneBtn").classList.remove("on2"); $("dockDrone").classList.remove("on2"); status("status", "All notes off."); }

function wirePanel() {
  $("presetSel").addEventListener("change", (e) => { const p = PRESETS.find((x) => x.id === e.target.value); if (p) applyPreset(p); });
  $("octDown").addEventListener("click", () => shiftOctave(-1));
  $("octUp").addEventListener("click", () => shiftOctave(1));
  $("sectionBtn").addEventListener("click", cycleSection);
  $("dsBtn").addEventListener("click", cycleDouble);
  $("droneBtn").addEventListener("click", toggleDrone);
  $("panicBtn").addEventListener("click", panic);
  $("tabFb").addEventListener("click", () => setSurface("fb"));
  $("tabKeys").addEventListener("click", () => setSurface("keys"));
  $("snapSel").addEventListener("change", (e) => { ui.snap = e.target.value; fb.snap = ui.snap; saveUi(); });
  $("rangeSel").addEventListener("change", (e) => { ui.range = +e.target.value; fb.range = ui.range; fb.dirty = true; saveUi(); });
  $("handBow").addEventListener("change", (e) => {
    ui.handBow = e.target.checked; saveUi(); bowpad.setHandBow(ui.handBow);
    status("status", ui.handBow ? "Hand bow on: hold notes with one hand and stroke the bow pad left and right with the other. Faster = louder; stop moving and the bow stops." : "Hand bow off: Dynamics sets the bow speed.");
  });
  // dock (mobile)
  $("dockRec").addEventListener("click", () => looper.press());
  $("dockStop").addEventListener("click", () => looper.stopPress());
  $("dockUndo").addEventListener("click", () => looper.undo());
  $("dockDrone").addEventListener("click", toggleDrone);
  $("dockPanic").addEventListener("click", panic);

  // ASCII cello: glow on every note, strings "buzz" while sounding
  const art = $("celloArt");
  const base = art.textContent;
  let glowT = null;
  engine.on("noteon", () => { art.classList.add("hit"); clearTimeout(glowT); glowT = setTimeout(() => art.classList.remove("hit"), 140); });
  engine.on("chug", () => { art.classList.add("hit"); clearTimeout(glowT); glowT = setTimeout(() => art.classList.remove("hit"), 80); });
  let flip = false;
  setInterval(() => {
    const busy = engine.levels.size > 0;
    flip = !flip;
    const txt = busy ? base.replace(/\|\|/g, flip ? ")(" : "||") : base;
    if (art.textContent !== txt) art.textContent = txt;
  }, 70);
}

// ======================================================================
// Looper UI
// ======================================================================

function wireLooper() {
  looper.bars = ui.loopBars === "free" ? "free" : +ui.loopBars;
  looper.countIn = ui.countIn; looper.onePass = ui.onePass;
  $("loopRec").addEventListener("click", () => looper.press());
  $("loopStop").addEventListener("click", () => looper.stopPress());
  $("loopUndo").addEventListener("click", () => looper.undo());
  $("loopClear").addEventListener("click", () => { if (!looper.layers.length || confirm("Clear every loop layer?")) looper.clear(); });
  $("loopBars").addEventListener("change", (e) => { ui.loopBars = e.target.value; looper.bars = e.target.value === "free" ? "free" : +e.target.value; saveUi(); });
  $("countInChk").addEventListener("change", (e) => { ui.countIn = looper.countIn = e.target.checked; saveUi(); });
  $("onePassChk").addEventListener("change", (e) => { ui.onePass = looper.onePass = e.target.checked; saveUi(); });
  $("bpm").addEventListener("change", (e) => {
    const v = +e.target.value;
    if (!isFinite(v)) return;
    if (looper.layers.length) { status("loopStatus", "The loop sets the tempo while it has layers — clear it to change BPM."); $("bpm").value = Math.round(engine.s.bpm); return; }
    engine.setBpm(v);
  });
  $("tapBtn").addEventListener("click", tapTempo);
  $("metroChk").addEventListener("change", (e) => engine.set("metronome", e.target.checked));
  looper.onChange(renderLooper);
  renderLooper();
  const ring = $("loopRing");
  const tick = () => { drawLoopRing(ring, looper, engine); requestAnimationFrame(tick); };
  tick();
}

let taps = [];
function tapTempo() {
  const now = performance.now();
  taps = taps.filter((t) => now - t < 2500);
  taps.push(now);
  if (taps.length >= 2) {
    const iv = (taps[taps.length - 1] - taps[0]) / (taps.length - 1);
    if (!looper.layers.length) engine.setBpm(60000 / iv);
  }
}

function renderLooper() {
  const st = looper.state;
  const rec = $("loopRec");
  rec.classList.toggle("on", st === "recording" || st === "countin");
  rec.classList.toggle("dub", st === "overdub");
  rec.innerHTML = { empty: "&#9679; Rec", countin: "&#9679; Count&hellip;", recording: looper.bars === "free" ? "&#9679; Close loop" : "&#9679; Recording", playing: "&#9679; Overdub", overdub: "&#9679; End dub", stopped: looper.layers.length ? "&#9654; Play" : "&#9679; Rec" }[st];
  $("dockRec").innerHTML = rec.innerHTML;
  $("dockRec").className = rec.className.replace("big", "");
  $("loopStop").innerHTML = st === "stopped" && looper.layers.length ? "&#9654; Play" : "&#9632; Stop";
  const msg = {
    empty: `Press Rec (or Space) and play. ${looper.bars === "free" ? "Press again to close the loop — its length sets the tempo." : `Records ${looper.bars} bar${+looper.bars > 1 ? "s" : ""} at ${Math.round(engine.s.bpm)} bpm${looper.countIn ? " after a one-bar count-in" : ""}.`}`,
    countin: "Count-in… recording starts on the next bar.",
    recording: looper.bars === "free" ? "Recording — press again to close the loop." : "Recording — it stops itself on the bar line.",
    playing: "Looping. Press Overdub to add a layer.",
    overdub: looper.onePass ? "Overdubbing one pass…" : "Overdubbing — press again to finish the layer.",
    stopped: "Stopped. Press Play (Enter) to start again.",
  }[st];
  status("loopStatus", msg);
  $("bpm").disabled = looper.layers.length > 0;
  // layers
  const box = $("layers");
  box.innerHTML = "";
  for (const l of looper.layers) {
    const row = document.createElement("div");
    row.className = "layer" + (l.muted ? " muted" : "");
    const nm = document.createElement("span"); nm.className = "nm"; nm.textContent = l.name + (l.half ? " ½" : "") + (l.reversed ? " ⇄" : "");
    const cv = document.createElement("canvas");
    const vol = document.createElement("input"); vol.type = "range"; vol.min = 0; vol.max = 1.5; vol.step = 0.01; vol.value = l.vol; vol.setAttribute("aria-label", l.name + " volume");
    vol.addEventListener("input", () => looper.setVol(l, +vol.value));
    const btns = document.createElement("span"); btns.className = "lb";
    const mk = (label, title, fn, on) => { const b = document.createElement("button"); b.className = "btn small" + (on ? " on2" : ""); b.textContent = label; b.title = title; b.addEventListener("click", fn); btns.appendChild(b); };
    mk("M", "mute", () => looper.toggleMute(l), l.muted);
    mk("⇄", "reverse", () => looper.toggleReverse(l), l.reversed);
    mk("½", "half speed (an octave down, twice as long)", () => looper.toggleHalf(l), l.half);
    mk("✕", "delete this layer", () => looper.remove(l));
    row.append(nm, cv, vol, btns);
    box.appendChild(row);
    requestAnimationFrame(() => drawPeaks(cv, l.peaks, l.muted ? "#4a3236" : "#ff2f4e"));
  }
}

// ======================================================================
// Voice & mic: tuner, sing-to-play, sampler, mic → looper
// ======================================================================

let tunerTimer = null, singTimer = null, micUsers = new Set();
async function useMic(who) {
  try { await mic.open(); micUsers.add(who); return true; }
  catch (e) { status("micStatus", "Microphone: " + (e.message || e) + " (allow mic access in the browser's site settings).", true); return false; }
}
function releaseMic(who) { micUsers.delete(who); if (!micUsers.size) mic.close(); }

function wireVoice() {
  // reference strings
  const refs = $("refStrings");
  const renderRefs = () => {
    refs.innerHTML = "";
    for (const m of engine.openStrings()) {
      const b = document.createElement("button"); b.className = "btn small"; b.textContent = noteName(m);
      b.title = "play this open string as a reference";
      b.addEventListener("click", () => { engine.noteOn("ref", m, 0.6, { art: "arco", noDouble: true, noSection: true, noTranspose: true }); setTimeout(() => engine.noteOff("ref"), 1800); });
      refs.appendChild(b);
    }
  };
  renderRefs();
  engine.on("setting", (e) => { if (e.name === "tuning") renderRefs(); });

  drawTuner($("tunerCanvas"), 0, false);
  $("tunerBtn").addEventListener("click", async () => {
    if (tunerTimer) { clearInterval(tunerTimer); tunerTimer = null; $("tunerBtn").textContent = "Start tuner"; $("tunerBtn").classList.remove("on"); releaseMic("tuner"); drawTuner($("tunerCanvas"), 0, false); return; }
    if (!(await useMic("tuner"))) return;
    $("tunerBtn").textContent = "Stop tuner"; $("tunerBtn").classList.add("on");
    let smooth = 0, lastNote = null;
    tunerTimer = setInterval(() => {
      const r = mic.read();
      if (r.freq > 0 && r.clarity > 0.88 && r.rms > 0.004) {
        const m = ftom(r.freq), near = Math.round(m), c = (m - near) * 100;
        if (near !== lastNote) smooth = c; lastNote = near;
        smooth += (c - smooth) * 0.35;
        $("tunerNote").textContent = noteName(near);
        $("tunerHz").textContent = `${r.freq.toFixed(1)} Hz  ${smooth >= 0 ? "+" : ""}${smooth.toFixed(0)}¢`;
        drawTuner($("tunerCanvas"), smooth, true);
      }
    }, 45);
    status("micStatus", "Tuner listening. Play one string at a time; green = within 5 cents.");
  });

  $("singBtn").addEventListener("click", async () => { if (singTimer) stopSing(); else await startSing(); });

  $("micLoop").addEventListener("change", async (e) => {
    if (e.target.checked) {
      if (!(await useMic("loop"))) { e.target.checked = false; return; }
      micRoute(true);
      status("micStatus", "Mic → looper: whatever the mic hears is recorded into loop layers (you won't hear it unless Monitor is on).");
    } else { micRoute(false); releaseMic("loop"); }
  });
  $("micMon").addEventListener("change", async (e) => {
    if (e.target.checked) { if (!(await useMic("mon"))) { e.target.checked = false; return; } micMonitor(true); }
    else { micMonitor(false); releaseMic("mon"); }
  });
  engine.on("sampler", renderSlots);
}

let micLoopGain = null, micMonGain = null;
function micRoute(on) {
  if (on && mic.src && engine.perfTap) { micLoopGain = engine.ctx.createGain(); mic.src.connect(micLoopGain); micLoopGain.connect(engine.perfTap); }
  else if (micLoopGain) { try { micLoopGain.disconnect(); mic.src && mic.src.disconnect(micLoopGain); } catch (e) { /* */ } micLoopGain = null; }
}
function micMonitor(on) {
  if (on && mic.src) { micMonGain = engine.ctx.createGain(); micMonGain.gain.value = 0.9; mic.src.connect(micMonGain); micMonGain.connect(engine.master); }
  else if (micMonGain) { try { micMonGain.disconnect(); mic.src && mic.src.disconnect(micMonGain); } catch (e) { /* */ } micMonGain = null; }
}

async function startSing() {
  if (!(await useMic("sing"))) return;
  $("singBtn").textContent = "Stop singing"; $("singBtn").classList.add("on");
  let sounding = false, quiet = 0, hist = [];
  singTimer = setInterval(() => {
    const r = mic.read();
    const gate = +$("singGate").value;
    $("singMeter").style.width = Math.min(100, (r.rms / 0.2) * 100) + "%";
    const voiced = r.freq > 0 && r.clarity > 0.82 && r.rms > gate;
    if (voiced) {
      let m = ftom(r.freq) + 12 * +$("singOct").value;
      // median of the last three readings kills octave blips
      hist.push(m); if (hist.length > 3) hist.shift();
      const sorted = hist.slice().sort((a, b) => a - b);
      m = sorted[sorted.length >> 1];
      const target = $("singSnap").checked ? snapToScale(m, engine.s.keyRoot, engine.s.scale) : m;
      const vel = clamp(0.3 + (r.rms - gate) * 6, 0.25, 1);
      quiet = 0;
      if (!sounding) { engine.noteOn("sing", target, vel, { noTranspose: true }); sounding = true; }
      else engine.noteUpdate("sing", { midi: target, glide: 0.05, vel, noTranspose: true });
      $("singRead").textContent = `${noteName(target)} ${r.freq.toFixed(0)} Hz`;
    } else if (sounding && ++quiet > 4) {
      engine.noteOff("sing"); sounding = false; hist = [];
      $("singRead").textContent = "";
    }
  }, 30);
  status("micStatus", "Sing, hum or whistle a steady note — the cello follows your pitch and loudness. Headphones stop it hearing itself.");
}
function stopSing() {
  if (!singTimer) return;
  clearInterval(singTimer); singTimer = null;
  engine.noteOff("sing");
  $("singBtn").textContent = "Start singing"; $("singBtn").classList.remove("on");
  $("singMeter").style.width = "0";
  releaseMic("sing");
}

const recStops = new Map();
function renderSlots() {
  const box = $("slots");
  if (!box) return;
  box.innerHTML = "";
  for (let i = 0; i < NUM_SLOTS; i++) {
    const s = sampler.slot(i);
    const d = document.createElement("div");
    d.className = "slot" + (sampler.active === i ? " sel" : "");
    const meta = s ? `${s.pitched ? noteName(s.root) + " " + (Math.round((s.root - Math.round(s.root)) * 100) >= 0 ? "+" : "") + Math.round((s.root - Math.round(s.root)) * 100) + "¢" : "no clear pitch (plays as C4)"} · ${s.buffer.duration.toFixed(2)}s${s.loopEnd > s.loopStart ? " · loops" : ""}` : "empty";
    d.innerHTML = `<div class="top"><span class="nm">${i + 1} · ${s ? escapeHtml(s.name) : "empty slot"}</span></div><div class="meta">${meta}</div>`;
    const cv = document.createElement("canvas"); d.appendChild(cv);
    const acts = document.createElement("div"); acts.className = "acts";
    const btn = (label, fn, cls = "") => { const b = document.createElement("button"); b.className = "btn small " + cls; b.textContent = label; b.addEventListener("click", fn); acts.appendChild(b); return b; };
    btn(sampler.active === i ? "✓ in use" : "Use", () => { sampler.active = i; renderSlots(); if (engine.s.source === "model" && s) engine.set("source", "both"); }, sampler.active === i ? "on" : "");
    const rb = btn(recStops.has(i) ? "■ Stop" : "● Rec", () => recordSlot(i), recStops.has(i) ? "on" : "");
    rb.title = "record from the mic (up to 10 s)";
    const lf = document.createElement("label"); lf.className = "btn small file-btn"; lf.textContent = "Load";
    const inp = document.createElement("input"); inp.type = "file"; inp.accept = "audio/*,.wav,.mp3,.m4a,.aac,.ogg,.flac";
    inp.addEventListener("change", async () => { const f = inp.files[0]; if (!f) return; try { const sl = await sampler.fromArrayBuffer(i, await f.arrayBuffer(), f.name.replace(/\.[^.]+$/, "")); installed(i, sl); } catch (e) { status("micStatus", "Couldn't read that file: " + (e.message || e), true); } });
    lf.appendChild(inp); acts.appendChild(lf);
    const bsel = document.createElement("select"); bsel.setAttribute("aria-label", "Borrow a sound");
    bsel.innerHTML = `<option value="">borrow…</option>` + BORROW.map((b) => `<option value="${b.id}">${b.name}</option>`).join("");
    bsel.addEventListener("change", async () => { if (!bsel.value) return; try { const sl = await sampler.borrow(i, bsel.value); installed(i, sl); } catch (e) { status("micStatus", e.message || String(e), true); } });
    acts.appendChild(bsel);
    if (s) {
      btn("▶", () => { const prev = sampler.active; sampler.active = i; const v = sampler.play(Math.round(s.root), 0.8, "arco", engine.now, {}); setTimeout(() => { if (v) v.stop(0, 0.2); sampler.active = prev; }, 900); });
      btn("✕", () => sampler.clear(i));
    }
    d.appendChild(acts);
    box.appendChild(d);
    if (s) requestAnimationFrame(() => drawPeaks(cv, peaksFromBuffer(s.buffer), sampler.active === i ? "#ff8a3d" : "#7a6468"));
  }
}
function peaksFromBuffer(b, n = 90) { const d = b.getChannelData(0), out = new Float32Array(n), st = d.length / n; for (let i = 0; i < n; i++) { let m = 0; for (let k = Math.floor(i * st); k < Math.floor((i + 1) * st); k++) m = Math.max(m, Math.abs(d[k])); out[i] = m; } return out; }
function escapeHtml(s) { return String(s).replace(/[&<>"']/g, (c) => ({ "&": "&amp;", "<": "&lt;", ">": "&gt;", '"': "&quot;", "'": "&#39;" }[c])); }

async function recordSlot(i) {
  if (recStops.has(i)) {
    const stop = recStops.get(i); recStops.delete(i);
    renderSlots();
    status("micStatus", "Analysing…");
    try {
      const data = await stop();
      releaseMic("rec");
      const sl = await sampler.install(i, data, engine.ctx.sampleRate, "Chungus " + (i + 1));
      installed(i, sl);
    } catch (e) { status("micStatus", e.message || String(e), true); }
    return;
  }
  if (!(await useMic("rec"))) return;
  try { recStops.set(i, mic.startRecording()); } catch (e) { status("micStatus", e.message, true); return; }
  status("micStatus", "Recording into slot " + (i + 1) + "… sing or play a steady note, then press Stop (10 s max).");
  renderSlots();
}

function installed(i, sl) {
  sampler.active = i;
  if (engine.s.source === "model") engine.set("source", "both");
  const cents = Math.round((sl.root - Math.round(sl.root)) * 100);
  status("micStatus", sl.pitched
    ? `Slot ${i + 1}: detected ${noteName(sl.root)} (${cents >= 0 ? "+" : ""}${cents}¢)${sl.loopEnd > sl.loopStart ? `, sustain loop ${(sl.loopEnd - sl.loopStart).toFixed(2)} s` : ""}. Sound source is now "${engine.s.source}" — play!`
    : `Slot ${i + 1}: no steady pitch found, so it plays as C4 and slides from there. Sound source: "${engine.s.source}".`);
  renderSlots();
}

// ======================================================================
// Phrases
// ======================================================================

function playPhrase(p) {
  if (p.id === "chungus" && engine.s.articulation !== "chug") setArt("chug");
  phrases.play(p, { loop: $("phLoop").checked, transpose: +$("phTrans").value });
}
phrases.onChange(() => {
  for (const r of document.querySelectorAll(".phrase")) r.classList.toggle("playing", !!phrases.cur && phrases.cur.phrase.id === r.dataset.id);
});
$("phStop").addEventListener("click", () => phrases.stop());

function phraseIntoLooper(p) {
  if (!engine.ready) return;
  if (looper.layers.length && !confirm("Replace the current loop with this phrase?")) return;
  looper.clear();
  phrases.stop();
  engine.setBpm(p.bpm);
  const bars = [1, 2, 4, 8].includes(p.bars) ? p.bars : 4;
  looper.bars = bars; looper.countIn = false;
  $("loopBars").value = String(bars);
  if (p.id === "chungus") setArt("chug");
  looper.startFirst();
  phrases.play(p, { start: looper.capStart, loop: false, setTempo: false, transpose: +$("phTrans").value });
  looper.countIn = ui.countIn;
  ui.loopBars = String(bars); saveUi();
  status("loopStatus", `Recording "${p.name}" into the looper (${bars} bars at ${p.bpm} bpm)…`);
  document.getElementById("looper").scrollIntoView({ behavior: "smooth", block: "center" });
}

// ======================================================================
// Recorder + exports
// ======================================================================

let perf = null, lastTake = null;
function wireRecorder() {
  $("recBtn").addEventListener("click", toggleRecord);
  $("recWav").addEventListener("click", () => {
    if (!lastTake) return;
    download(encodeWav(lastTake.ch, engine.ctx.sampleRate, +$("bitSel").value), `chunguscello-${stamp()}.wav`, "audio/wav");
  });
  $("recMidi").addEventListener("click", () => {
    if (!lastTake) return;
    download(encodeMidi(lastTake.notes, engine.s.bpm), `chunguscello-${stamp()}.mid`, "audio/midi");
  });
  $("exMix").addEventListener("click", exportMix);
  $("exStems").addEventListener("click", exportStems);
  engine.on("noteon", (e) => { if (perf) perf.open.set(e.key, { t: Math.max(0, e.time - perf.start), midi: e.midi, vel: e.vel }); });
  engine.on("noteoff", (e) => {
    if (!perf) return;
    const o = perf.open.get(e.key);
    if (o) { perf.open.delete(e.key); perf.notes.push({ t: o.t, d: Math.max(0.02, e.time - perf.start - o.t), midi: o.midi, vel: o.vel }); }
  });
}

async function toggleRecord() {
  if (!engine.ready) return;
  if (!perf) {
    const start = engine.now;
    const cap = engine.captureBegin("master", start);
    if (!cap) { status("exStatus", "Recording needs AudioWorklet support in this browser.", true); return; }
    perf = { cap, start, notes: [], open: new Map(), timer: setInterval(() => { const s = engine.now - start; $("recTime").textContent = `${Math.floor(s / 60)}:${String(Math.floor(s % 60)).padStart(2, "0")}`; }, 250) };
    $("recBtn").classList.add("on"); $("recBtn").innerHTML = "&#9632; Stop"; $("recTime").classList.add("on");
    status("exStatus", "Recording everything you hear (not the metronome)…");
    return;
  }
  const p = perf; perf = null;
  clearInterval(p.timer);
  const end = engine.now;
  for (const [, o] of p.open) p.notes.push({ t: o.t, d: Math.max(0.02, end - p.start - o.t), midi: o.midi, vel: o.vel });
  engine.captureEnd(p.cap, end);
  $("recBtn").classList.remove("on"); $("recBtn").innerHTML = "&#9679; Record"; $("recTime").classList.remove("on");
  const res = await p.cap.done;
  if (!res) return;
  lastTake = { ch: res.ch, notes: p.notes };
  $("recWav").disabled = false; $("recMidi").disabled = p.notes.length === 0;
  status("exStatus", `Take: ${(res.ch[0].length / engine.ctx.sampleRate).toFixed(1)} s, ${p.notes.length} notes. Download it as WAV and/or MIDI.`);
  const d = $("recDrawer"); if (!d.open) d.open = true;
}

function exportMix() {
  if (!looper.layers.length) { status("exStatus", "Record a loop first.", true); return; }
  const ch = looper.renderMix(+$("exRepeats").value);
  if ($("exNorm").checked) normalise(ch, -1);
  download(encodeWav(ch, engine.ctx.sampleRate, +$("bitSel").value), `chunguscello-loop-${stamp()}.wav`, "audio/wav");
  status("exStatus", "Loop mix exported.");
}

function exportStems() {
  if (!looper.layers.length) { status("exStatus", "Record a loop first.", true); return; }
  const sr = engine.ctx.sampleRate, bits = +$("bitSel").value, rep = +$("exRepeats").value;
  const base = `chunguscello-${stamp()}`;
  const files = [], stems = [];
  looper.layers.forEach((l, i) => {
    const ch = looper.renderLayer(l, rep);
    const fn = `${String(i + 1).padStart(2, "0")}-${l.name.replace(/\s+/g, "-").toLowerCase()}${l.half ? "-half" : ""}${l.reversed ? "-rev" : ""}${l.muted ? "-muted" : ""}.wav`;
    files.push({ name: `${base}/${fn}`, data: encodeWav(ch, sr, bits) });
    stems.push({ name: l.name + (l.muted ? " (muted)" : ""), file: fn });
  });
  const mix = looper.renderMix(rep);
  if ($("exNorm").checked) normalise(mix, -1);
  files.push({ name: `${base}/00-mix.wav`, data: encodeWav(mix, sr, bits) });
  const len = mix[0].length / sr;
  files.push({ name: `${base}/${base}.rpp`, data: encodeRpp(stems, len, engine.s.bpm, "ChungusCello loop") });
  files.push({ name: `${base}/info.txt`, data: `ChungusCello loop export\n\nTempo: ${engine.s.bpm.toFixed(2)} BPM (4/4)\nLength: ${len.toFixed(4)} s (${rep} repeat${rep > 1 ? "s" : ""})\nSample rate: ${sr} Hz, ${bits}-bit\nLayers: ${looper.layers.length}\n\nAll WAVs start at 0 and are the same length. Reaper: unzip, open the .rpp. Other DAWs: drag all WAVs to bar 1 and set the tempo above.\n\nMade with ChungusCello — Dre Darklabs\n` });
  download(makeZip(files), `${base}.zip`, "application/zip");
  status("exStatus", `Exported ${looper.layers.length} stem${looper.layers.length > 1 ? "s" : ""} + mix + Reaper project.`);
}

// ======================================================================
// MIDI
// ======================================================================

function wireMidi() {
  $("midiSupport").textContent = midi.supported ? "Web MIDI is available. Plug in a controller and press Enable." : "This browser has no Web MIDI (Safari/iOS and Firefox without the add-on don't). Chrome, Edge and Opera do, on desktop and Android.";
  $("midiEnable").disabled = !midi.supported;
  $("midiEnable").addEventListener("click", async () => {
    try { await midi.enable(); status("midiStatus", "MIDI on. Play!"); $("midiEnable").textContent = "MIDI enabled"; $("midiEnable").classList.add("on"); }
    catch (e) { status("midiStatus", e.message || String(e), true); }
  });
  midi.onPorts(() => {
    const ins = midi.inputs(), outs = midi.outputs();
    fillSelect($("midiIn"), [["", "all inputs"]].concat(ins.map((i) => [i.id, i.name])), midi.inId);
    fillSelect($("midiOut"), [["", "off"]].concat(outs.map((o) => [o.id, o.name])), midi.outId);
    if (!ins.length) status("midiStatus", "No MIDI inputs found yet — plug one in (it'll appear here).");
  });
  $("midiIn").addEventListener("change", (e) => midi.setInput(e.target.value));
  $("midiOut").addEventListener("change", (e) => midi.setOutput(e.target.value));
  $("midiMpe").addEventListener("change", (e) => { midi.mpe = e.target.checked; if (midi.mpe) { midi.bendRange = 48; $("midiBend").value = "48"; } });
  $("midiBend").addEventListener("change", (e) => { midi.bendRange = +e.target.value; });
}

// ======================================================================
// Presets & share
// ======================================================================

function renderUserPresets() {
  const box = $("userPresets");
  box.innerHTML = "";
  const list = lsGet("userPresets", []);
  if (!list.length) { box.innerHTML = `<p class="dim small-note">Nothing saved yet.</p>`; return; }
  list.forEach((p, i) => {
    const b = document.createElement("button");
    b.className = "preset";
    b.innerHTML = `<span class="x" title="delete">✕</span><b>${escapeHtml(p.name)}</b><span>your sound</span>`;
    b.addEventListener("click", (e) => {
      if (e.target.classList.contains("x")) { const l = lsGet("userPresets", []); l.splice(i, 1); lsSet("userPresets", l); renderUserPresets(); return; }
      engine.setMany(Object.assign({}, DEFAULTS, sanitize(p.s), { volume: engine.s.volume }));
      ui.preset = "custom"; $("presetSel").value = "custom"; saveUi(); syncAll();
      status("shareStatus", `Loaded "${p.name}".`);
    });
    box.appendChild(b);
  });
}

function wirePresets() {
  $("savePreset").addEventListener("click", () => {
    const name = ($("userPresetName").value || "").trim() || `My sound ${new Date().toLocaleDateString()}`;
    const list = lsGet("userPresets", []);
    list.push({ name, s: diffFromDefaults(engine.s) });
    lsSet("userPresets", list);
    $("userPresetName").value = "";
    renderUserPresets();
    status("shareStatus", `Saved "${name}" in this browser.`);
  });
  $("shareBtn").addEventListener("click", async () => {
    const url = location.origin + location.pathname + "#s=" + b64urlEncode(JSON.stringify(diffFromDefaults(engine.s)));
    try { await navigator.clipboard.writeText(url); status("shareStatus", "Share link copied. Anyone who opens it gets this exact sound."); }
    catch (e) { prompt("Copy this link:", url); }
  });
  $("exportSettings").addEventListener("click", () => download(JSON.stringify({ app: "ChungusCello", v: 1, settings: diffFromDefaults(engine.s) }, null, 2), `chunguscello-sound-${stamp()}.json`, "application/json"));
  $("importSettings").addEventListener("change", async (e) => {
    const f = e.target.files[0]; if (!f) return;
    try { const o = JSON.parse(await f.text()); engine.setMany(Object.assign({}, DEFAULTS, sanitize(o.settings || o))); ui.preset = "custom"; saveUi(); syncAll(); status("shareStatus", "Settings loaded."); }
    catch (err) { status("shareStatus", "That file isn't a ChungusCello settings file.", true); }
    e.target.value = "";
  });
  $("resetBtn").addEventListener("click", () => { if (!confirm("Reset every sound setting to the defaults? (Loops, recordings and saved sounds are kept.)")) return; lsDel("settings"); applyPreset(PRESETS[0]); history.replaceState(null, "", location.pathname); });
}

// ======================================================================
// Learn: "Try it" buttons
// ======================================================================

function wireLearn() {
  for (const b of document.querySelectorAll("[data-try]")) {
    b.addEventListener("click", () => {
      for (const step of b.dataset.try.split(",")) {
        const [k, v] = step.split(":");
        if (k === "preset") applyPreset(PRESETS.find((p) => p.id === v));
        else if (k === "art") setArt(v);
        else if (k === "surface") setSurface(v);
        else if (k === "snap") { ui.snap = v; $("snapSel").value = v; fb.snap = v; setSurface("fb"); saveUi(); }
        else if (k === "phrase") { const p = PHRASES.find((x) => x.id === v); if (p) playPhrase(p); }
        else if (k === "loopphrase") { const p = PHRASES.find((x) => x.id === v); if (p) phraseIntoLooper(p); }
        else if (k === "drawer") { const d = $(v); if (d) { d.open = true; d.scrollIntoView({ behavior: "smooth" }); } }
      }
    });
  }
}

// ======================================================================
// Computer keyboard
// ======================================================================

function typing(e) { const t = e.target; return t && ((t.tagName === "INPUT" && !["range", "checkbox"].includes(t.type)) || t.tagName === "TEXTAREA" || t.tagName === "SELECT" || t.isContentEditable); }

function wireKeyboard() {
  const held = new Set();
  window.addEventListener("keydown", (e) => {
    if (typing(e) || e.metaKey || e.ctrlKey || e.altKey) return;
    const k = e.key.length === 1 ? e.key.toLowerCase() : e.key;
    if (e.repeat) { if ([" ", "Backspace", "PageDown", "PageUp"].includes(k)) e.preventDefault(); return; }
    const idx = KEY_SEQUENCE.findIndex((x) => x.key === k);
    if (idx >= 0) {
      if (held.has(k)) return;
      held.add(k);
      engine.noteOn("kb:" + k, 48 + 12 * ui.octave + idx, 0.8);
      return;
    }
    const art = ARTICULATIONS.find((a) => a.key === k);
    if (art) { setArt(art.id); return; }
    switch (k) {
      case "z": shiftOctave(-1); break;
      case "x": shiftOctave(1); break;
      case " ": e.preventDefault(); looper.press(); break;
      case "PageDown": e.preventDefault(); looper.press(); break;
      case "PageUp": e.preventDefault(); looper.undo(); break;
      case "Enter": if (e.target.tagName !== "BUTTON") { e.preventDefault(); looper.stopPress(); } break;
      case "Backspace": e.preventDefault(); looper.undo(); break;
      case "Escape": panic(); break;
      case "r": toggleRecord(); break;
      case "q": toggleDrone(); break;
      case "m": engine.set("metronome", !engine.s.metronome); break;
      case "t": tapTempo(); break;
      case "c": cycleDouble(); break;
      case "v": cycleSection(); break;
      case "ArrowUp": e.preventDefault(); engine.set("dynamics", clamp(engine.s.dynamics + 0.05, 0, 1)); break;
      case "ArrowDown": e.preventDefault(); engine.set("dynamics", clamp(engine.s.dynamics - 0.05, 0, 1)); break;
      case "ArrowRight": e.preventDefault(); engine.set("bowPos", clamp(engine.s.bowPos + 0.05, 0, 1)); break;
      case "ArrowLeft": e.preventDefault(); engine.set("bowPos", clamp(engine.s.bowPos - 0.05, 0, 1)); break;
      case "[": case "]": {
        const i = PRESETS.findIndex((p) => p.id === ui.preset);
        const n = (Math.max(0, i) + (k === "]" ? 1 : PRESETS.length - 1)) % PRESETS.length;
        applyPreset(PRESETS[n]);
        break;
      }
    }
  });
  window.addEventListener("keyup", (e) => {
    const k = e.key.length === 1 ? e.key.toLowerCase() : e.key;
    if (held.has(k)) { held.delete(k); engine.noteOff("kb:" + k); }
  });
  window.addEventListener("blur", () => { for (const k of held) engine.noteOff("kb:" + k); held.clear(); });
  document.addEventListener("visibilitychange", () => { if (document.hidden) { for (const k of held) engine.noteOff("kb:" + k); held.clear(); } });
}

// ======================================================================
// VR / 3D
// ======================================================================

let vr = null;
async function loadVR() { if (!vr) vr = await import("./vr.js"); return vr; }

function wireVR() {
  const xr = navigator.xr;
  const set = (msg) => { $("vrSupport").textContent = msg; };
  if (!xr) set(window.isSecureContext ? "No WebXR in this browser — open this page in the Meta Quest Browser to play in VR. The 3D view works anywhere." : "WebXR needs https.");
  else {
    xr.isSessionSupported("immersive-vr").then((ok) => {
      $("vrBtn").disabled = !ok;
      set(ok ? "Headset ready." : "This browser has WebXR but no VR headset. On a Quest, open this page in the Quest Browser.");
    }).catch(() => set("Couldn't check for VR support."));
  }
  $("vrBtn").addEventListener("click", async () => {
    try {
      const m = await loadVR();
      await m.enterVR({ engine, looper, fbOpts: () => ({ easy: $("vrEasy").checked, snap: $("vrSnap").checked, ar: $("vrAR").checked }), onStatus: (s, err) => status("vrStatus", s, err), onArt: setArt, onDrone: toggleDrone });
    } catch (e) { console.error(e); status("vrStatus", "Couldn't start VR: " + (e.message || e), true); }
  });
  $("view3dBtn").addEventListener("click", async () => {
    const box = $("view3d");
    if (!box.hidden) { box.hidden = true; if (vr) vr.stopPreview(); $("view3dBtn").textContent = "3D view"; return; }
    box.hidden = false; $("view3dBtn").textContent = "Hide 3D view";
    try { const m = await loadVR(); m.startPreview(box, { engine, looper }); }
    catch (e) { console.error(e); status("vrStatus", "Couldn't start the 3D view: " + (e.message || e), true); }
  });
}

// debugging / tests
window.chungus = { engine, looper, sampler, phrases, mic, midi, get fb() { return fb; }, ui };
