// GlowGrain: interface and wiring.

import { Engine } from "./engine.js";
import { Conductor, LAYERS } from "./conductor.js";
import { Midi } from "./midi.js";
import { Sky } from "./visuals.js";
import { renderTake } from "./export.js";
import { encodeWav, encodeMidi, normalise, fadeOut, download, stamp } from "./wav.js";
import { MODES, PROGRESSIONS, NOTE_NAMES, KEY_SEQUENCE, clamp, lerp, smooth, isBlack, noteName, modeStep, snapToMode, inMode } from "./theory.js";

const $ = (id) => document.getElementById(id);
const INSTS = [
  { id: "piano", name: "Felt Piano" }, { id: "marimba", name: "Marimba" }, { id: "pad", name: "Sun Pad" },
  { id: "choir", name: "Voice" }, { id: "bass", name: "Bass" },
];
const BLOOM_HINTS = [[0, "just the felt piano, close and dry"], [0.06, "the strings begin to sing back"], [0.16, "companions answer your notes"],
  [0.28, "a marimba circles your phrase"], [0.4, "a warm bass settles in"], [0.52, "soft electronic air underneath"],
  [0.64, "a Latin pulse, barely there"], [0.76, "a voice appears"], [0.88, "the muse plays along"], [0.97, "in full bloom"]];
const PERC_MIDI = { shaker: 70, tick: 76, drum: 63 };

const DEFAULTS = { v: 2, inst: "piano", key: 2, mode: "minor", prog: "frahm", bpm: 72, felt: 100, space: 28, tape: 55, echo: 10, harmony: "off", lock: false, lowC: 48, loopBars: 4, metro: "0", snap: "1", guide: true, pads: false, seenHelp: false };
let S = { ...DEFAULTS };
try { Object.assign(S, JSON.parse(localStorage.getItem("glowgrain.v1") || "{}")); } catch (e) { /* private mode */ }
if (S.v !== 2) { Object.assign(S, { v: 2, key: 2, mode: "minor", prog: "frahm", bpm: 72, tape: 55, space: 28 }); }   // v2: the musical identity moved to minor / modal
const save = () => { try { localStorage.setItem("glowgrain.v1", JSON.stringify(S)); } catch (e) { /* ignore */ } };

const engine = new Engine();
const conductor = new Conductor(engine);
let sky = null, midi = null;
const held = new Map();                 // note id -> { voices, notes }
const ptr = new Map();                  // pointerId -> { id, midi }
let keyEls = new Map();                 // midi -> element
let view = { lowC: 48, whites: 14, last: 71 };
let lastTake = null, takeTimer = 0;

// ───────────────────────────────────────────────────────── helpers

const root = () => 60 + S.key;
function snap(m) { return S.lock ? snapToMode(m, root(), S.mode) : m; }

function harmonyNotes(m) {
  if (S.inst === "bass") return [m];
  const m0 = snapToMode(m, root(), S.mode);
  switch (S.harmony) {
    case "oct": return [m, m - 12];
    case "triad": return [m, modeStep(m0, 2, root(), S.mode), modeStep(m0, 4, root(), S.mode)];
    case "open": return [m - 12, m, modeStep(m0, 4, root(), S.mode), modeStep(m0, 2, root(), S.mode) + 12];
    default: return [m];
  }
}

function bloomHint(b) { let h = BLOOM_HINTS[0][1]; for (const [at, t] of BLOOM_HINTS) if (b >= at) h = t; return h; }

function applyFx() {
  const b = conductor.bloom;
  engine.setParam("space", clamp(S.space / 100 + 0.3 * b, 0, 1));
  engine.setParam("echo", clamp(S.echo / 100 + 0.22 * smooth(0.45, 1, b), 0, 1));
  engine.setParam("tape", S.tape / 100);
  engine.setParam("felt", S.felt / 100);
  conductor.refreshFx();
}

// ───────────────────────────────────────────────────────── playing

function press(id, m, vel, raw = false) {
  if (!engine.ready || held.has(id)) return;
  if (!raw) m = snap(m);
  const notes = raw ? [m] : harmonyNotes(m);
  const inst = S.inst;
  const t = S.snap === "1" ? conductor.snapTime(engine.now) : engine.now;          // beat snap: pull the hit onto the grid
  const voices = notes.map((n) => engine.voices.start(inst, n, n === m ? vel : vel * 0.78, t));
  held.set(id, { voices, notes, m, t });
  notes.forEach((n) => conductor.recordOn(id + ":" + n, inst, n, vel, t));
  conductor.remember(m, t);                       // the marimba and the muse will carry this note on
  conductor.companion(inst, m, vel, t);           // and the instrument answers it, in the key
  lightKey(m, "down", true); burst(m, vel, 3);
}

function release(id) {
  const h = held.get(id); if (!h) return;
  held.delete(id);
  const tr = Math.max(engine.now, h.t + 0.07);                                       // a snapped note must have started before it ends
  for (const v of h.voices) engine.voices.noteOff(v, tr);
  h.notes.forEach((n) => conductor.recordOff(id + ":" + n, tr));
  if (![...held.values()].some((o) => o.m === h.m)) lightKey(h.m, "down", false);
}

function releaseAll() {
  for (const id of [...held.keys()]) release(id);
  ptr.clear();
}

function setPedal(on) {
  if (!engine.ready) return;
  engine.voices.setPedal(on);
  const b = $("sustain"); b.setAttribute("aria-pressed", String(on));
}

// ───────────────────────────────────────────────────────── keyboard

function buildKeys() {
  const host = $("keys");
  host.innerHTML = "";
  const inner = document.createElement("div"); inner.className = "keys-inner"; host.appendChild(inner);
  const W = host.clientWidth - 16;
  const fine = matchMedia("(pointer: fine)").matches;
  const whites = clamp(Math.floor(W / (fine ? 46 : 42)), 7, 22);
  const ww = 100 / whites, bw = ww * 0.62;
  S.lowC = clamp(Math.round(S.lowC / 12) * 12, 24, 84 - 12);
  const qwBase = S.lowC + (whites >= 14 ? 12 : 0);
  keyEls = new Map();
  let m = S.lowC, wi = 0, lastM = m;
  while (wi < whites) {
    const el = document.createElement("div");
    el.dataset.midi = m;
    if (!isBlack(m)) {
      el.className = "key white"; el.style.left = wi * ww + "%"; el.style.width = ww + "%";
      const q = m - qwBase, lab = document.createElement("span"); lab.className = "lab";
      lab.textContent = m % 12 === 0 ? noteName(m) : (fine && q >= 0 && q < KEY_SEQUENCE.length ? KEY_SEQUENCE[q].toUpperCase() : "");
      el.appendChild(lab); wi++; lastM = m;
    } else {
      el.className = "key black"; el.style.left = wi * ww - bw / 2 + "%"; el.style.width = bw + "%";
    }
    el.setAttribute("aria-label", noteName(m));
    inner.appendChild(el); keyEls.set(m, el); m++;
  }
  view = { lowC: S.lowC, whites, last: lastM, qwBase };
  $("rangeLabel").textContent = `${noteName(S.lowC)}–${noteName(lastM)}`;
  paintScale();
}

function paintScale() {
  for (const [m, el] of keyEls) {
    el.classList.toggle("root", ((m % 12) + 12) % 12 === S.key % 12 && !isBlack(m));
    el.classList.toggle("off", S.lock && !inMode(m, root(), S.mode));
  }
  paintTones();
}

/** Glow the keys that belong to the chord sounding now (or the tonic chord when stopped). */
function paintTones() {
  const keysEl = $("keys");
  keysEl.classList.toggle("guide", S.guide);
  const pcs = new Set(conductor.chordNow().tones.map((n) => ((n % 12) + 12) % 12));
  for (const [m, el] of keyEls) el.classList.toggle("tone", S.guide && pcs.has(((m % 12) + 12) % 12));
}

// ───────────────────────────────────────────────────────── pads (a drum-style way in)

const PAD_ORDER = [4, 5, 6, 7, 0, 1, 2, 3];                       // top row = the high notes, bottom row = root-3rd-5th-7th
const PAD_ROLE = ["root", "3rd", "5th", "7th", "octave", "3rd \u2191", "5th \u2191", "9th"];

function padNotes() {
  const c = conductor.chordNow();
  // root 3rd 5th 7th, then the same four an octave up (the last as the 9th), kept out of the piercing top octave
  const raw = c.arp.map((n, i) => (i === 7 ? c.tones[4] : n));
  const shift = Math.max(...raw) > 81 ? -12 : 0;                   // move the whole chord together so the pads stay in ascending order
  return raw.map((m) => m + shift + (S.inst === "bass" ? -24 : 0));
}

function buildPads() {
  const host = $("pads"); host.innerHTML = "";
  PAD_ORDER.forEach((idx) => {
    const d = document.createElement("div"); d.className = "pad" + (idx === 0 ? " root" : ""); d.dataset.idx = idx;
    d.innerHTML = `<span class="n"></span><span class="r">${PAD_ROLE[idx]}</span>`;
    host.appendChild(d);
  });
  const down = new Map();
  host.addEventListener("pointerdown", (e) => {
    const pad = e.target.closest(".pad"); if (!pad) return;
    e.preventDefault(); engine.resume();
    try { host.setPointerCapture(e.pointerId); } catch (err) { /* synthetic */ }
    const r = pad.getBoundingClientRect(), vel = clamp(0.3 + 0.7 * ((e.clientY - r.top) / r.height), 0.25, 1);
    const id = "pad" + e.pointerId, note = padNotes()[+pad.dataset.idx];
    down.set(e.pointerId, { id, pad }); pad.classList.add("down");
    press(id, note, vel, true);
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
  document.querySelectorAll("#octDown, #octUp, #rangeLabel, #lock").forEach((el) => { el.hidden = on; });
  if (on) updatePads();
  updateCoach();
}

function setGuide(on) {
  S.guide = on; S.lock = on; S.snap = on ? "1" : "0"; conductor.quantize = on; save();
  $("guideBtn").setAttribute("aria-pressed", String(on));
  $("lock").setAttribute("aria-pressed", String(S.lock)); $("snap").value = S.snap;
  paintScale(); updateCoach();
}

function updateCoach() {
  const L = conductor.loop.state;
  let t = "";
  if (L === "countin") t = "<b>Count-in.</b> Get ready: your loop starts on beat <b>1</b> of the next bar.";
  else if (L === "recording") t = "<b>Recording.</b> Play your part now. It loops by itself when the bars are up.";
  else if (L === "odwait" || L === "overdub") t = "<b>Overdub.</b> Layer another part on top. Press Loop again to stop layering.";
  else if (S.guide && conductor.running) t = "Play the <b>glowing</b> notes: they change with each chord. Tap along with the beat dots; <b>1</b> is the big one.";
  else if (S.guide) t = S.pads
    ? "Tap the pads. Every pad is a note from the chord, so <b>nothing can sound wrong</b>. Slide <b>Bloom</b> up to bring the band in."
    : "Play the <b>glowing</b> keys. They fit together, so <b>nothing can sound wrong</b>. Or press <b>Pads</b> for a drum-style layout. Slide <b>Bloom</b> up for the band.";
  $("coach").innerHTML = t;
}

function lightKey(m, cls, on) { const el = keyEls.get(m); if (el) el.classList.toggle(cls, on); }

function keyRect(m) { const el = keyEls.get(m); return el ? el.getBoundingClientRect() : null; }

function burst(m, vel, n) {
  if (!sky) return;
  const r = keyRect(m); if (!r) return;
  sky.spawn(r.left + r.width / 2, r.top + r.height * 0.3, vel, n);
}

function keyAt(x, y) {
  const el = document.elementFromPoint(x, y);
  return el && el.classList && el.classList.contains("key") ? el : null;
}

function velAt(e, el) {
  if (e.pointerType === "pen" && e.pressure > 0) return clamp(0.25 + e.pressure * 0.75, 0.2, 1);
  const r = el.getBoundingClientRect();
  return clamp(0.26 + 0.74 * ((e.clientY - r.top) / r.height), 0.2, 1);
}

function wireKeys() {
  const host = $("keys");
  host.addEventListener("pointerdown", (e) => {
    const el = keyAt(e.clientX, e.clientY); if (!el) return;
    e.preventDefault(); engine.resume();
    try { host.setPointerCapture(e.pointerId); } catch (err) { /* synthetic events */ }
    const m = +el.dataset.midi, id = "p" + e.pointerId;
    ptr.set(e.pointerId, { id, m });
    press(id, m, velAt(e, el));
  });
  host.addEventListener("pointermove", (e) => {
    const p = ptr.get(e.pointerId); if (!p) return;
    const el = keyAt(e.clientX, e.clientY); if (!el) return;
    const m = +el.dataset.midi; if (m === p.m) return;
    release(p.id); p.m = m;
    press(p.id, m, Math.min(velAt(e, el), 0.6));
  });
  const up = (e) => { const p = ptr.get(e.pointerId); if (!p) return; release(p.id); ptr.delete(e.pointerId); };
  host.addEventListener("pointerup", up);
  host.addEventListener("pointercancel", up);
  host.addEventListener("lostpointercapture", up);
  host.addEventListener("contextmenu", (e) => e.preventDefault());

  const qDown = new Set();
  addEventListener("keydown", (e) => {
    if (e.ctrlKey || e.metaKey || e.altKey) return;
    const t = e.target, tag = t && t.tagName;
    if (tag === "INPUT" || tag === "SELECT" || tag === "TEXTAREA") return;
    const k = e.key.toLowerCase();
    if (k === " " && tag !== "BUTTON" && tag !== "SUMMARY") { e.preventDefault(); if (!e.repeat) setPedal(true); return; }
    if (e.repeat) return;
    if (k === "z") { shiftOct(-1); return; }
    if (k === "x") { shiftOct(1); return; }
    const i = KEY_SEQUENCE.indexOf(k);
    if (i >= 0 && engine.ready) { qDown.add(k); engine.resume(); press("k" + k, view.qwBase + i, 0.58 + Math.random() * 0.14); }
  });
  addEventListener("keyup", (e) => {
    const k = e.key.toLowerCase();
    if (k === " ") { if (!$("sustain").dataset.latched) setPedal(false); return; }
    if (qDown.delete(k)) release("k" + k);
  });
  addEventListener("blur", () => { releaseAll(); qDown.clear(); });
  document.addEventListener("visibilitychange", () => { if (document.hidden) { releaseAll(); qDown.clear(); } });
}

function shiftOct(d) {
  S.lowC = clamp(S.lowC + d * 12, 24, 72); save();
  releaseAll(); buildKeys();
}

// ───────────────────────────────────────────────────────── UI

function buildUI() {
  const inst = $("inst");
  INSTS.forEach((it) => {
    const b = document.createElement("button"); b.type = "button"; b.textContent = it.name; b.dataset.inst = it.id;
    b.setAttribute("role", "radio"); b.setAttribute("aria-checked", String(S.inst === it.id));
    b.addEventListener("click", () => { S.inst = it.id; save(); releaseAll(); inst.querySelectorAll("button").forEach((x) => x.setAttribute("aria-checked", String(x === b))); updatePads(); });
    inst.appendChild(b);
  });

  const ul = $("layers");
  LAYERS.forEach((L) => {
    const li = document.createElement("li"), b = document.createElement("button");
    b.type = "button"; b.className = "layer"; b.textContent = L.name; b.dataset.layer = L.id;
    b.title = `${L.name}: wakes with Bloom. Click to pin on, again to mute, again for automatic.`;
    b.addEventListener("click", () => {
      const cur = conductor.pin[L.id];
      if (cur === undefined) conductor.pin[L.id] = true; else if (cur === true) conductor.pin[L.id] = false; else delete conductor.pin[L.id];
      conductor.refresh(); paintLayers();
    });
    li.appendChild(b); ul.appendChild(li);
  });

  const sel = (id, items, val) => { const s = $(id); items.forEach(([v, t]) => { const o = document.createElement("option"); o.value = v; o.textContent = t; s.appendChild(o); }); s.value = val; return s; };
  const harmonyChanged = () => { conductor.cur = null; conductor.chord = null; conductor.refreshFx(); save(); paintScale(); updatePads(); };
  sel("key", NOTE_NAMES.map((n, i) => [i, n]), S.key).onchange = (e) => { S.key = +e.target.value; conductor.key = S.key; harmonyChanged(); };
  sel("mode", Object.entries(MODES).map(([k, v]) => [k, v.name]), S.mode).onchange = (e) => { S.mode = e.target.value; conductor.mode = S.mode; harmonyChanged(); };
  sel("prog", Object.entries(PROGRESSIONS).map(([k, v]) => [k, v.name]), S.prog).onchange = (e) => { S.prog = e.target.value; conductor.prog = S.prog; harmonyChanged(); };
  $("metro").value = S.metro; $("metro").onchange = (e) => { S.metro = e.target.value; conductor.metro = S.metro === "1"; save(); };
  conductor.key = S.key; conductor.mode = S.mode; conductor.prog = S.prog; conductor.metro = S.metro === "1"; conductor.bpm = S.bpm;

  for (const id of ["felt", "space", "tape", "echo"]) {
    const el = $(id); el.value = S[id];
    el.addEventListener("input", () => { S[id] = +el.value; save(); applyFx(); });
  }
  const bpm = $("bpm"); bpm.value = S.bpm; $("bpmOut").textContent = S.bpm;
  bpm.addEventListener("input", () => { S.bpm = +bpm.value; conductor.bpm = S.bpm; engine.setParam("bpm", S.bpm); $("bpmOut").textContent = S.bpm; save(); });

  $("harmony").value = S.harmony; $("harmony").onchange = (e) => { S.harmony = e.target.value; save(); };
  const lock = $("lock"); lock.setAttribute("aria-pressed", String(S.lock));
  lock.onclick = () => { S.lock = !S.lock; lock.setAttribute("aria-pressed", String(S.lock)); save(); paintScale(); };
  $("octDown").onclick = () => shiftOct(-1); $("octUp").onclick = () => shiftOct(1);
  $("sustain").onclick = (e) => { const on = e.currentTarget.getAttribute("aria-pressed") !== "true"; e.currentTarget.dataset.latched = on ? "1" : ""; if (!on) delete e.currentTarget.dataset.latched; setPedal(on); };

  $("padsBtn").onclick = () => setPadsMode(!S.pads);
  $("guideBtn").onclick = () => setGuide(!S.guide);
  $("snap").value = S.snap; conductor.quantize = S.snap === "1";
  $("snap").onchange = (e) => { S.snap = e.target.value; conductor.quantize = S.snap === "1"; save(); };
  if (!S.seenHelp && S.guide) S.lock = true;                  // first visit: Guide means the key is locked too
  $("howto").open = !S.seenHelp; S.seenHelp = true; save();
  $("lock").setAttribute("aria-pressed", String(S.lock));

  const bloom = $("bloom");
  const onBloom = () => {
    const b = +bloom.value / 100; conductor.bloom = b;
    $("bloomHint").textContent = bloomHint(b); applyFx(); conductor.refresh(); paintLayers();
  };
  bloom.addEventListener("input", onBloom);

  // loop + take
  $("loopBtn").onclick = () => { engine.resume(); conductor.loopPress(); };
  $("undoBtn").onclick = () => conductor.loopUndo();
  $("clearBtn").onclick = () => conductor.loopClear();
  $("loopBars").value = S.loopBars; conductor.loop.bars = S.loopBars;
  $("loopBars").onchange = (e) => { S.loopBars = +e.target.value; conductor.loopSetBars(S.loopBars); save(); };
  conductor.on("loop", paintLoop); paintLoop(conductor.loopInfo());

  $("recBtn").onclick = toggleTake;
  $("saveWav").onclick = () => saveTake("wav");
  $("saveMid").onclick = () => saveTake("mid");

  conductor.on("bar", (b) => {
    const delay = Math.max(0, (b.t - engine.now) * 1000);
    setTimeout(() => {
      $("chordLine").textContent = `${b.label}  ·  ${b.roman}`;
      paintTones(); updatePads(); updateCoach();
      if (S.guide && engine.voices.pedal) engine.voices.liftPedal();       // the pedal clears itself at each chord change
    }, delay);
  });
  conductor.on("beat", (b) => {
    const dots = [...$("beats").children], delay = Math.max(0, (b.t - engine.now) * 1000);
    setTimeout(() => { dots.forEach((d, i) => d.classList.toggle("on", i === b.beat)); setTimeout(() => dots[b.beat].classList.remove("on"), 140); }, delay);
  });
  conductor.on("transport", (on) => {
    if (!on) { $("chordLine").innerHTML = "&nbsp;"; [...$("beats").children].forEach((d) => d.classList.remove("on")); }
    paintTones(); updatePads(); updateCoach();
  });
  conductor.on("loop", updateCoach);
  conductor.on("note", (n) => {
    if (n.inst === "perc") return;
    const delay = Math.max(0, (n.t - engine.now) * 1000), m = n.midi;
    setTimeout(() => {
      const el = keyEls.get(m); if (!el) return;
      el.classList.add("ghost"); setTimeout(() => el.classList.remove("ghost"), n.inst === "pad" ? 900 : 260);
      burst(m, n.vel * 0.7, 1);
    }, delay);
  });

  engine.on("state", (s) => { $("stateChip").hidden = s === "running"; });

  // MIDI
  const mb = $("midiBtn");
  midi = new Midi({
    onOn: (n, v) => press("m" + n, n, Math.max(0.12, v)), onOff: (n) => release("m" + n),
    onPedal: (on) => setPedal(on), onPanic: () => { releaseAll(); engine.voices.panic(); },
    onBloom: (v) => { bloom.value = Math.round(v * 100); onBloom(); },
    onPorts: (ports) => { mb.classList.toggle("on", ports.length > 0); mb.textContent = ports.length ? "MIDI · " + ports[0].name.slice(0, 18) : "MIDI"; $("midiLine").textContent = ports.length ? `MIDI in: ${ports.map((p) => p.name).join(", ")}` : "MIDI enabled. Plug in a keyboard."; },
  });
  if (!midi.supported) { mb.title = "Web MIDI isn't available in this browser; touch and keyboard still work."; mb.textContent = "no MIDI"; mb.disabled = true; }
  mb.onclick = async () => { try { await midi.enable(); } catch (e) { $("midiLine").textContent = e.message; } };
}

function paintLayers() {
  document.querySelectorAll(".layer").forEach((b) => {
    const id = b.dataset.layer, pin = conductor.pin[id];
    b.classList.toggle("awake", conductor.amt(id) > 0.5);
    b.classList.toggle("pinned", pin === true); b.classList.toggle("muted", pin === false);
  });
}

function paintLoop(info) {
  const b = $("loopBtn");
  b.dataset.state = info.state;
  b.innerHTML = { idle: `&#9679; Loop ${info.bars} bars`, countin: "count-in&hellip;", recording: "recording&hellip;", playing: "&#9673; Overdub", odwait: "overdub next pass&hellip;", overdub: "overdubbing&hellip;" }[info.state];
  $("undoBtn").disabled = !info.layers; $("clearBtn").disabled = info.state === "idle";
  $("loopBars").disabled = info.state !== "idle";
  $("bpm").disabled = info.layers > 0;
}

// ───────────────────────────────────────────────────────── takes

function fmt(s) { return `${Math.floor(s / 60)}:${String(Math.floor(s % 60)).padStart(2, "0")}`; }

function toggleTake() {
  if (!engine.ready) return;
  const b = $("recBtn");
  if (!engine.taking) {
    engine.startTake(); b.dataset.on = "true"; $("takeInfo").textContent = ""; $("saveWav").disabled = $("saveMid").disabled = true;
    takeTimer = setInterval(() => { b.innerHTML = `&#9632; Stop &middot; ${fmt(engine.now - engine.takeStart)}`; }, 250);
    b.innerHTML = "&#9632; Stop &middot; 0:00";
  } else {
    clearInterval(takeTimer);
    const events = engine.stopTake();
    b.dataset.on = "false"; b.innerHTML = "&#9679; Record take";
    lastTake = events.length ? { events, bpm: conductor.bpm, vowel: "ah", len: engine.takeLen, params: { ...engine.takePeak } } : null;
    $("saveWav").disabled = $("saveMid").disabled = !lastTake;
    $("takeInfo").textContent = lastTake ? `${fmt(engine.takeLen)} · ${events.length} notes` : "Nothing was played.";
  }
}

async function saveTake(kind) {
  if (!lastTake) return;
  const info = $("takeInfo");
  try {
    if (kind === "mid") {
      const ev = lastTake.events.map((e) => e.inst === "perc" ? { t: e.t, dur: 0.1, midi: PERC_MIDI[e.kind] || 60, vel: e.vel, ch: 9 } : { t: e.t, dur: e.dur ?? 0.5, midi: e.midi, vel: e.vel });
      download(encodeMidi(ev, lastTake.bpm), `glowgrain-${stamp()}.mid`, "audio/midi");
      return;
    }
    info.textContent = "rendering…"; $("saveWav").disabled = true;
    const chs = await renderTake(engine, lastTake.events, { vowel: lastTake.vowel, params: lastTake.params });
    fadeOut(chs, engine.ctx.sampleRate, 1.2); normalise(chs, -1.5);
    download(encodeWav(chs, engine.ctx.sampleRate, 16), `glowgrain-${stamp()}.wav`, "audio/wav");
    info.textContent = `saved · ${fmt(chs[0].length / engine.ctx.sampleRate)}`;
  } catch (e) {
    console.error(e); info.textContent = "Export failed: " + (e.message || e);
  } finally { $("saveWav").disabled = false; }
}

// ───────────────────────────────────────────────────────── boot

function frameLoop() {
  let last = performance.now(), acc = 0;
  const f = (now) => {
    const dt = (now - last) / 1000; last = now; acc += dt;
    if (sky) sky.frame(dt, engine.level(), conductor.bloom);
    if (acc > 0.25) {
      acc = 0; paintLayers();
      const L = conductor.loop;
      if (engine.ready && (L.state === "playing" || L.state === "overdub" || L.state === "odwait") && L.len > 0) {
        $("loopFill").style.width = (((engine.now - L.start) % L.len + L.len) % L.len / L.len * 100).toFixed(1) + "%";
      } else $("loopFill").style.width = "0";
    }
    requestAnimationFrame(f);
  };
  requestAnimationFrame(f);
}

let resizeT = 0;
function onResize() { clearTimeout(resizeT); resizeT = setTimeout(() => { if (!$("app").hidden) { releaseAll(); buildKeys(); } }, 150); }

async function begin() {
  const btn = $("startBtn"); btn.disabled = true; $("startErr").textContent = "";
  try {
    await engine.start();
  } catch (e) {
    console.error(e); btn.disabled = false;
    $("startErr").textContent = e.message || "Couldn't start audio.";
    return;
  }
  engine.setParam("bpm", S.bpm); applyFx();
  $("app").hidden = false; $("start").classList.add("gone");
  setTimeout(() => $("start").remove(), 800);
  buildKeys(); buildPads();
  $("guideBtn").setAttribute("aria-pressed", String(S.guide));
  $("lock").setAttribute("aria-pressed", String(S.lock));
  setPadsMode(S.pads);
  // a soft welcome: the key's own minor-ninth chord, spread low to high, so the first sound is the felt piano
  const t = engine.now + 0.12, wc = conductor.chordNow().tones;
  [[wc[0] - 12, 0], [wc[2] - 12, 0.24], [wc[4] - 12, 0.5], [wc[1], 0.78], [wc[3], 1.1]]
    .forEach(([n, d], i) => engine.voices.playTimed("piano", n, 0.3 + i * 0.03, t + d, 1.8));
}

addEventListener("DOMContentLoaded", () => {
  sky = new Sky($("sky"));
  buildUI();
  wireKeys();
  frameLoop();
  addEventListener("resize", onResize);
  document.addEventListener("pointerdown", () => { if (engine.ctx && engine.ctx.state !== "running") engine.resume(); }, true);
  $("startBtn").addEventListener("click", begin);
  if ("serviceWorker" in navigator && location.protocol.startsWith("http")) navigator.serviceWorker.register("sw.js").catch(() => {});
});

window.__gg = { engine, conductor, setGuide, setPadsMode, padNotes, paintTones, get S() { return S; }, press, release, setPedal, buildKeys, renderTake, encodeWav, noteName };
