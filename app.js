// MeowSynth — a tiny browser sampler built from two human "meow" voice memos.
// No frameworks, no build step. Everything below is one signal chain:
//
//   voice(source -> envelope gain) -> shared filter -> dry --------> master gain -> limiter -> speakers
//                                                    \-> reverb send -^
//
"use strict";

const SAMPLES_URL = "samples/manifest.json";

// Standard "typing piano" layout: lowercase = white keys, the row above = black keys.
// Semitone offset is just this array's index — 'a' is the recorded pitch of the sample,
// every key after it is one semitone higher.
const KEY_SEQUENCE = [
  { key: "a", black: false }, { key: "w", black: true },
  { key: "s", black: false }, { key: "e", black: true },
  { key: "d", black: false },
  { key: "f", black: false }, { key: "t", black: true },
  { key: "g", black: false }, { key: "y", black: true },
  { key: "h", black: false }, { key: "u", black: true },
  { key: "j", black: false },
  { key: "k", black: false }, { key: "o", black: true },
  { key: "l", black: false }, { key: "p", black: true },
  { key: ";", black: false },
  { key: "'", black: false },
];

const PAD_KEYS = ["1", "2", "3", "4", "5", "6", "7"];

let audioCtx = null;
let masterGain, filterNode, dryGain, reverbSend, convolver, wetGain, limiter;
let buffers = {};       // slug -> AudioBuffer
let chromaticSlug = null;
let padSlugs = [];      // slugs in pad order, excluding the chromatic base
let manifest = [];

let octaveShift = 0;
const OCTAVE_MIN = -2, OCTAVE_MAX = 3;
const heldKeys = new Set();
let catMeowTimer = null;

// ---------- audio graph ----------

function buildGraph() {
  audioCtx = new (window.AudioContext || window.webkitAudioContext)();

  masterGain = audioCtx.createGain();
  masterGain.gain.value = knobToVolume(getKnob("volumeKnob"));

  filterNode = audioCtx.createBiquadFilter();
  filterNode.type = "lowpass";
  filterNode.frequency.value = getKnob("filterKnob");
  filterNode.Q.value = 0.7;

  dryGain = audioCtx.createGain();
  dryGain.gain.value = 1;

  reverbSend = audioCtx.createGain();
  reverbSend.gain.value = getKnob("reverbKnob") / 100;

  convolver = audioCtx.createConvolver();
  convolver.buffer = makeImpulseResponse(audioCtx, 2.2, 2.6);

  wetGain = audioCtx.createGain();
  wetGain.gain.value = 0.8;

  limiter = audioCtx.createDynamicsCompressor();
  limiter.threshold.value = -10;
  limiter.knee.value = 12;
  limiter.ratio.value = 6;
  limiter.attack.value = 0.003;
  limiter.release.value = 0.25;

  filterNode.connect(dryGain).connect(masterGain);
  filterNode.connect(reverbSend).connect(convolver).connect(wetGain).connect(masterGain);
  masterGain.connect(limiter).connect(audioCtx.destination);
}

// Procedural reverb impulse: filtered exponential-decay noise. No IR file needed.
function makeImpulseResponse(ctx, seconds, decay) {
  const rate = ctx.sampleRate;
  const length = Math.floor(rate * seconds);
  const impulse = ctx.createBuffer(2, length, rate);
  for (let ch = 0; ch < 2; ch++) {
    const data = impulse.getChannelData(ch);
    for (let i = 0; i < length; i++) {
      data[i] = (Math.random() * 2 - 1) * Math.pow(1 - i / length, decay);
    }
  }
  return impulse;
}

function getKnob(id) {
  return parseFloat(document.getElementById(id).value);
}

function knobToVolume(v) {
  return Math.pow(v / 100, 1.4) * 0.9;
}

// ---------- sample loading ----------

async function loadSamples() {
  const res = await fetch(SAMPLES_URL);
  manifest = await res.json();

  const results = await Promise.all(
    manifest.map(async (m) => {
      const r = await fetch(`samples/${m.file}`);
      const arr = await r.arrayBuffer();
      const buf = await audioCtx.decodeAudioData(arr);
      return [m.slug, buf];
    })
  );
  buffers = Object.fromEntries(results);

  const base = manifest.find((m) => m.isChromaticBase);
  chromaticSlug = base ? base.slug : manifest[0].slug;
  padSlugs = manifest.filter((m) => !m.isChromaticBase).map((m) => m.slug);
}

// ---------- playback ----------

function playSlug(slug, semitoneOffset = 0) {
  const buffer = buffers[slug];
  if (!buffer || !audioCtx) return;

  const now = audioCtx.currentTime;
  const rate = Math.pow(2, semitoneOffset / 12);

  const source = audioCtx.createBufferSource();
  source.buffer = buffer;
  source.playbackRate.value = rate;

  const voiceGain = audioCtx.createGain();
  const ATTACK = 0.004;
  voiceGain.gain.setValueAtTime(0, now);
  voiceGain.gain.linearRampToValueAtTime(1, now + ATTACK);

  // Release knob decides how much of the sample's natural tail survives:
  // low = clipped, punchy "meep"; high = the full recorded meow, faded out cleanly.
  const releasePct = getKnob("releaseKnob") / 100;
  const naturalDur = buffer.duration / rate;
  const playDur = naturalDur * (0.18 + 0.82 * releasePct);
  const fadeDur = Math.min(0.3, Math.max(0.02, playDur * 0.35));
  const fadeStart = Math.max(now + ATTACK, now + playDur - fadeDur);
  voiceGain.gain.setValueAtTime(1, fadeStart);
  voiceGain.gain.linearRampToValueAtTime(0, fadeStart + fadeDur);

  source.connect(voiceGain).connect(filterNode);
  source.start(now);
  source.stop(fadeStart + fadeDur + 0.05);

  pulseCat();
}

function pulseCat() {
  const cat = document.getElementById("cat");
  cat.classList.add("meow");
  clearTimeout(catMeowTimer);
  catMeowTimer = setTimeout(() => cat.classList.remove("meow"), 130);
}

// ---------- UI: chromatic keyboard ----------

function buildKeyboardUI() {
  const el = document.getElementById("keyboard");
  el.innerHTML = "";
  KEY_SEQUENCE.forEach((k, i) => {
    const btn = document.createElement("div");
    btn.className = "key" + (k.black ? " black" : "");
    btn.dataset.key = k.key;
    btn.dataset.offset = i;
    btn.textContent = k.key.toUpperCase();
    el.appendChild(btn);

    const trigger = () => {
      const offset = i + octaveShift * 12;
      playSlug(chromaticSlug, offset);
      btn.classList.add("active");
    };
    const release = () => btn.classList.remove("active");

    btn.addEventListener("mousedown", trigger);
    btn.addEventListener("mouseup", release);
    btn.addEventListener("mouseleave", release);
    btn.addEventListener("touchstart", (e) => { e.preventDefault(); trigger(); }, { passive: false });
    btn.addEventListener("touchend", (e) => { e.preventDefault(); release(); }, { passive: false });
  });
}

// ---------- UI: mood pads ----------

function buildPadsUI() {
  const el = document.getElementById("pads");
  el.innerHTML = "";
  padSlugs.forEach((slug, i) => {
    const meta = manifest.find((m) => m.slug === slug);
    const num = PAD_KEYS[i];
    if (!num) return;

    const btn = document.createElement("div");
    btn.className = "pad";
    btn.dataset.key = num;
    btn.innerHTML = `<span class="num">${num}</span><span class="lbl">${meta.label}</span>`;
    el.appendChild(btn);

    const trigger = () => {
      playSlug(slug, 0);
      btn.classList.add("active");
      setTimeout(() => btn.classList.remove("active"), 140);
    };
    btn.addEventListener("mousedown", trigger);
    btn.addEventListener("touchstart", (e) => { e.preventDefault(); trigger(); }, { passive: false });
  });
}

// ---------- physical keyboard ----------

function findKeyEl(char) {
  return document.querySelector(`.key[data-key="${cssEscape(char)}"]`);
}
function findPadEl(char) {
  return document.querySelector(`.pad[data-key="${cssEscape(char)}"]`);
}
function cssEscape(s) {
  return s.replace(/["'\\]/g, "\\$&");
}

function onKeyDown(e) {
  if (e.repeat) return;
  const char = e.key.length === 1 ? e.key.toLowerCase() : e.key;

  if (char === "z") { shiftOctave(-1); return; }
  if (char === "x") { shiftOctave(1); return; }

  if (heldKeys.has(char)) return;
  heldKeys.add(char);

  const keyDef = KEY_SEQUENCE.findIndex((k) => k.key === char);
  if (keyDef !== -1) {
    playSlug(chromaticSlug, keyDef + octaveShift * 12);
    const el = findKeyEl(char);
    if (el) el.classList.add("active");
    return;
  }

  const padIdx = PAD_KEYS.indexOf(char);
  if (padIdx !== -1 && padSlugs[padIdx]) {
    playSlug(padSlugs[padIdx], 0);
    const el = findPadEl(char);
    if (el) { el.classList.add("active"); setTimeout(() => el.classList.remove("active"), 140); }
  }
}

function onKeyUp(e) {
  const char = e.key.length === 1 ? e.key.toLowerCase() : e.key;
  heldKeys.delete(char);
  const el = findKeyEl(char);
  if (el) el.classList.remove("active");
}

function shiftOctave(dir) {
  octaveShift = Math.max(OCTAVE_MIN, Math.min(OCTAVE_MAX, octaveShift + dir));
  document.getElementById("octLabel").textContent = octaveShift > 0 ? `+${octaveShift}` : `${octaveShift}`;
}

// ---------- knob wiring ----------

function wireKnobs() {
  document.getElementById("filterKnob").addEventListener("input", (e) => {
    if (filterNode) filterNode.frequency.setTargetAtTime(parseFloat(e.target.value), audioCtx.currentTime, 0.01);
  });
  document.getElementById("reverbKnob").addEventListener("input", (e) => {
    if (reverbSend) reverbSend.gain.setTargetAtTime(parseFloat(e.target.value) / 100, audioCtx.currentTime, 0.01);
  });
  document.getElementById("volumeKnob").addEventListener("input", (e) => {
    if (masterGain) masterGain.gain.setTargetAtTime(knobToVolume(parseFloat(e.target.value)), audioCtx.currentTime, 0.01);
  });
  document.getElementById("octDown").addEventListener("click", () => shiftOctave(-1));
  document.getElementById("octUp").addEventListener("click", () => shiftOctave(1));
}

// ---------- boot ----------

async function start() {
  const startBtn = document.getElementById("startBtn");
  startBtn.disabled = true;
  startBtn.textContent = "waking the cat…";

  buildGraph();
  if (audioCtx.state === "suspended") await audioCtx.resume();
  await loadSamples();

  buildKeyboardUI();
  buildPadsUI();
  wireKnobs();

  document.getElementById("startScreen").hidden = true;
  document.getElementById("panel").hidden = false;

  window.addEventListener("keydown", onKeyDown);
  window.addEventListener("keyup", onKeyUp);

  // Give an audible hello.
  playSlug(chromaticSlug, 0);
}

document.getElementById("startBtn").addEventListener("click", start);

// Subtle parallax on the header — cat and title drift a few px against the
// cursor (or device tilt on mobile). Slow and small on purpose.
(function parallax() {
  const cat = document.getElementById("cat");
  const title = document.querySelector(".title");
  if (!cat || !title) return;
  let raf = null;
  function apply(nx, ny) {
    if (raf) return;
    raf = requestAnimationFrame(() => {
      cat.style.transform = `translate(${nx * 6}px, ${ny * 4}px)`;
      title.style.transform = `translate(${nx * 3}px, ${ny * 2}px)`;
      raf = null;
    });
  }
  window.addEventListener("mousemove", (e) => {
    const nx = e.clientX / window.innerWidth - 0.5;
    const ny = e.clientY / window.innerHeight - 0.5;
    apply(nx, ny);
  });
  window.addEventListener("deviceorientation", (e) => {
    if (e.gamma == null || e.beta == null) return;
    apply(Math.max(-0.5, Math.min(0.5, e.gamma / 45)), Math.max(-0.5, Math.min(0.5, (e.beta - 45) / 45)));
  });
})();

// Fill in the repo link from the page's own location if it's a GitHub Pages URL.
(function setRepoLink() {
  const a = document.getElementById("repoLink");
  const host = location.hostname;
  if (host.endsWith("github.io")) {
    const user = host.split(".")[0];
    const repo = location.pathname.split("/").filter(Boolean)[0];
    if (user && repo) a.href = `https://github.com/${user}/${repo}`;
  } else {
    a.href = "https://github.com/";
  }
})();

