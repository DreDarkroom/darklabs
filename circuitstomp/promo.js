/* CircuitStomp promo — presented by CS-01.
   Everything here is drawn on a canvas and played live through the same engine as the
   instrument, so the promo can also be recorded straight to a video file. */

"use strict";

(function () {
  const BPM = 174;
  const SD = 60 / BPM / 4;            // one sixteenth
  const BARS = 24;
  const TOTAL = BARS * 16 * SD + 2.2;  // + tail for the last hit

  const cv = document.getElementById("promoCanvas");
  if (!cv) return;
  const g = cv.getContext("2d");
  const W = cv.width, H = cv.height;
  const RED = "#ff2f4e", ORANGE = "#ff8a3d", FG = "#f2e4e6", DIM = "#7a6468", BG = "#060607";

  // ---- the score: [unitIndex] -> 16-char row per section ----
  const S = {
    boot:   { 2: "x.o.x.o.x.o.x.oo", 5: "..........x....." },
    intro:  { 0: "X.........X.....", 1: "....X.......X...", 2: "x.o.x.o.x.o.x.o." },
    drop:   { 0: "X.........X.....", 1: "....X.......X...", 2: "x.oox.o.x.oox.o.", 7: "X..x..x...X..x..", 4: "...........o....", 5: "..............xo" },
    drop2:  { 0: "X.........Xo....", 1: "....X..o....X.x.", 2: "x.o.x.oox.o.x.oo", 7: "X..x......X.x...", 3: "......x.........", 6: "..........x....." },
    half:   { 0: "X...............", 1: "........X.......", 2: "x...x...x...x...", 6: "......x.......x." },
  };
  const NEURO_NOTES = { drop: { 0: 0, 3: 3, 6: 5, 10: 0, 13: -2 }, drop2: { 0: 0, 3: 3, 10: 7, 12: 5 } };
  const PARADE = [[0, 1], [2, 3], [4, 5], [6, 7]];
  const UNIT_NAMES = ["KICK", "SNARE", "HAT", "SERVO", "CLANK", "BITZAP", "VOXBOT", "NEURO"];

  function sectionFor(bar) {
    if (bar < 4) return "boot";
    if (bar < 8) return "intro";
    if (bar < 12) return "parade";
    if (bar < 16) return "drop";
    if (bar < 20) return "drop2";
    return "half";
  }

  function hitsAt(bar, step) {
    const sec = sectionFor(bar);
    const out = [];
    if (sec === "parade") {
      const pair = PARADE[bar - 8];
      pair.forEach((u, k) => { if (step === k * 8 || step === k * 8 + 3 || step === k * 8 + 6) out.push([u, step % 8 === 0 ? 3 : 2, u === 7 ? [0, 3, 7][Math.floor(step / 3) % 3] : 0]); });
      if (bar === 11 && step >= 8) out.push([1, step % 2 ? 1 : 2, 0]);    // snare roll into the drop
      return out;
    }
    if (bar === 23 && step > 0) return out;                                 // let the last hit ring
    const rows = S[sec];
    Object.keys(rows).forEach((u) => {
      const c = rows[u][step];
      if (c === "." || !c) return;
      const lvl = c === "X" ? 3 : c === "x" ? 2 : 1;
      const n = NEURO_NOTES[sec] && +u === 7 ? (NEURO_NOTES[sec][step] || 0) : 0;
      out.push([+u, lvl, n]);
    });
    return out;
  }

  // ---- captions (bar -> text) ----
  const CAPTIONS = [
    [4, 6, "Hi. I'm CS-01."],
    [6, 8, "I build drum & bass out of pure circuitry."],
    [8, 12, "Eight robot voices. Zero samples."],
    [12, 16, "Sequence it. Play it live. Chain it into songs."],
    [16, 20, "Stems, MIDI and a Reaper project. One click."],
    [20, 24, "Free. In your browser. Now you."],
  ];

  // ---- runtime ----
  let running = false, t0 = 0, nextStepTime = 0, stepIdx = 0, timer = null, raf = null;
  let groups = {}, analyser = null, scope = null;
  let flashes = new Array(8).fill(-10), eyeFlash = -10, antFlash = -10;
  let spokenBars = new Set();
  let recorder = null, recChunks = [], recDest = null;

  function now() { return CS.live.currentTime - t0; }

  function schedule() {
    const live = CS.live;
    while (nextStepTime < live.currentTime + 0.12 && stepIdx < BARS * 16) {
      const bar = Math.floor(stepIdx / 16), step = stepIdx % 16;
      hitsAt(bar, step).forEach(([u, lvl, n]) => {
        CS.triggerUnit(live, CS.chain, groups, u, nextStepTime, CS.STEP_VEL[lvl], n, true);
        const at = nextStepTime - t0;
        flashes[u] = at;
        if (u === 0) eyeFlash = at;
        if (u === 2) antFlash = at;
      });
      // robot "speech" bleeps when a caption starts
      CAPTIONS.forEach(([b, , txt]) => {
        if (bar === b && step < Math.min(16, Math.ceil(txt.length / 3)) && step % 2 === 0) {
          CS.triggerUnit(live, CS.chain, groups, 6, nextStepTime, 0.35, [12, 15, 19, 17, 24][(step / 2) % 5], true);
        }
      });
      nextStepTime += SD;
      stepIdx++;
    }
    if (now() > TOTAL) finish();
  }

  // ---- drawing ----
  function ease(x) { return x < 0 ? 0 : x > 1 ? 1 : 1 - Math.pow(1 - x, 3); }

  function drawFloor(t, beat) {
    g.save();
    const horizon = H * 0.62;
    g.strokeStyle = "rgba(255,47,78,0.22)";
    g.lineWidth = 1;
    for (let i = -12; i <= 12; i++) {
      g.beginPath(); g.moveTo(W / 2 + i * 18, horizon); g.lineTo(W / 2 + i * 150, H); g.stroke();
    }
    const scroll = (t / (SD * 4)) % 1;
    for (let k = 0; k < 12; k++) {
      const z = (k + scroll) / 12;
      const y = horizon + Math.pow(z, 2.2) * (H - horizon);
      g.globalAlpha = 0.15 + z * 0.4;
      g.beginPath(); g.moveTo(0, y); g.lineTo(W, y); g.stroke();
    }
    g.globalAlpha = 1;
    const glow = g.createLinearGradient(0, horizon - 40, 0, horizon + 4);
    glow.addColorStop(0, "rgba(255,47,78,0)"); glow.addColorStop(1, `rgba(255,47,78,${0.18 + beat * 0.25})`);
    g.fillStyle = glow; g.fillRect(0, horizon - 40, W, 44);
    g.restore();
  }

  function roundRect(x, y, w, h, r) {
    g.beginPath(); g.moveTo(x + r, y); g.arcTo(x + w, y, x + w, y + h, r); g.arcTo(x + w, y + h, x, y + h, r);
    g.arcTo(x, y + h, x, y, r); g.arcTo(x, y, x + w, y, r); g.closePath();
  }

  function drawRobot(t, cx, cy, s, appear) {
    if (appear <= 0) return;
    g.save();
    g.globalAlpha = appear;
    g.translate(cx, cy + (1 - appear) * 60);
    g.scale(s, s);
    const kick = Math.max(0, 1 - (t - eyeFlash) / 0.18);
    const bob = Math.sin(t * Math.PI * 2 * (BPM / 60) / 2) * 3;
    g.translate(0, bob - kick * 6);

    // antenna
    g.strokeStyle = DIM; g.lineWidth = 4;
    g.beginPath(); g.moveTo(0, -150); g.lineTo(0, -195); g.stroke();
    const ant = Math.max(0, 1 - (t - antFlash) / 0.1);
    g.fillStyle = ant > 0.1 ? ORANGE : "#3a1c20";
    g.shadowColor = ORANGE; g.shadowBlur = 24 * ant;
    g.beginPath(); g.arc(0, -202, 10, 0, Math.PI * 2); g.fill();
    g.shadowBlur = 0;

    // shoulders
    g.fillStyle = "#120a0b"; g.strokeStyle = "#2a1418"; g.lineWidth = 3;
    roundRect(-230, 120, 460, 140, 30); g.fill(); g.stroke();
    // chest LEDs = the 8 units
    for (let u = 0; u < 8; u++) {
      const f = Math.max(0, 1 - (t - flashes[u]) / 0.15);
      g.fillStyle = f > 0.05 ? (u === 7 ? ORANGE : RED) : "#2a1418";
      g.shadowColor = RED; g.shadowBlur = 16 * f;
      roundRect(-150 + u * 38, 170, 26, 26, 5); g.fill();
    }
    g.shadowBlur = 0;

    // head
    g.fillStyle = "#170c0e"; g.strokeStyle = RED; g.lineWidth = 4;
    roundRect(-170, -150, 340, 260, 34); g.fill(); g.stroke();
    // bolts
    g.fillStyle = "#2a1418";
    [[-150, -130], [150, -130], [-150, 90], [150, 90]].forEach(([x, y]) => { g.beginPath(); g.arc(x, y, 6, 0, Math.PI * 2); g.fill(); });

    // eyes
    const blink = (t % 3.7) < 0.12 ? 0.15 : 1;
    [-70, 70].forEach((x) => {
      g.fillStyle = "#0a0506"; g.beginPath(); g.arc(x, -50, 42, 0, Math.PI * 2); g.fill();
      g.fillStyle = RED; g.shadowColor = RED; g.shadowBlur = 20 + kick * 40;
      g.beginPath(); g.ellipse(x, -50, 20 + kick * 6, (20 + kick * 6) * blink, 0, 0, Math.PI * 2); g.fill();
      g.shadowBlur = 0;
    });

    // mouth = live oscilloscope of the engine
    g.fillStyle = "#0a0506"; roundRect(-110, 30, 220, 50, 10); g.fill();
    if (analyser) {
      analyser.getByteTimeDomainData(scope);
      g.strokeStyle = ORANGE; g.lineWidth = 3; g.beginPath();
      for (let i = 0; i < scope.length; i += 4) {
        const x = -104 + (i / scope.length) * 208;
        const y = 55 + ((scope[i] - 128) / 128) * 22;
        i ? g.lineTo(x, y) : g.moveTo(x, y);
      }
      g.stroke();
    }
    g.restore();
  }

  function typeText(txt, x, y, size, progress, color, align) {
    const n = Math.floor(txt.length * Math.min(1, progress));
    g.font = `700 ${size}px "SF Mono","Cascadia Code","JetBrains Mono",Menlo,Consolas,monospace`;
    g.textAlign = align || "center";
    g.fillStyle = color || FG;
    const shown = txt.slice(0, n) + (progress < 1 && Math.floor(performance.now() / 250) % 2 ? "_" : "");
    g.fillText(shown, x, y);
  }

  function drawGrid(t, bar) {
    const step = Math.floor((t / SD) % 16);
    const x0 = W / 2 - 16 * 30 / 2, y0 = H - 70;
    for (let s = 0; s < 16; s++) {
      const hot = hitsAt(bar, s).length > 0;
      g.fillStyle = s === step ? ORANGE : hot ? "rgba(255,47,78,0.8)" : "#1d1013";
      roundRect(x0 + s * 30, y0, 24, 24, 4); g.fill();
    }
  }

  function draw() {
    if (!running) return;
    const t = now();
    const bar = Math.floor(t / (SD * 16));
    const barT = (t % (SD * 16)) / (SD * 16);
    const sec = sectionFor(Math.min(bar, BARS - 1));
    const beat = Math.max(0, 1 - (t - eyeFlash) / 0.2);

    g.fillStyle = BG; g.fillRect(0, 0, W, H);
    if (bar >= 4) drawFloor(t, beat);

    if (sec === "boot") {
      const lines = ["> CS-01 // POWER ON", "> loading 8 robot voices .......... ok", "> searching for samples .......... none", "> good. everything here is synthesised."];
      lines.forEach((ln, i) => typeText(ln, 120, 200 + i * 60, 30, (t - i * SD * 16 * 0.8) / (SD * 16 * 0.7), i === 3 ? ORANGE : FG, "left"));
      drawRobot(t, W / 2, H * 0.52, 0.9, bar === 3 ? ease(barT * 1.5) : 0);
    } else if (sec === "parade") {
      drawRobot(t, W * 0.28, H * 0.5, 0.95, 1);
      const pair = PARADE[Math.min(3, bar - 8)];
      pair.forEach((u, k) => {
        const f = Math.max(0, 1 - (t - flashes[u]) / 0.25);
        g.font = `700 ${78 + f * 10}px "SF Mono",Menlo,Consolas,monospace`;
        g.textAlign = "left";
        g.fillStyle = f > 0.05 ? RED : "#3a1c20";
        g.shadowColor = RED; g.shadowBlur = 30 * f;
        g.fillText(UNIT_NAMES[u], W * 0.52, H * 0.38 + k * 110);
        g.shadowBlur = 0;
      });
    } else if (sec === "half" && bar >= 21) {
      const a = ease((t - 21 * SD * 16) / (SD * 16));
      g.globalAlpha = a;
      g.font = `700 104px "SF Mono",Menlo,Consolas,monospace`;
      g.textAlign = "center"; g.fillStyle = FG;
      g.shadowColor = RED; g.shadowBlur = 30;
      g.fillText("CircuitStomp", W / 2, H * 0.42);
      g.shadowBlur = 0;
      g.font = `400 30px "SF Mono",Menlo,Consolas,monospace`;
      g.fillStyle = DIM;
      g.fillText("free · in your browser · no sign-up", W / 2, H * 0.42 + 64);
      g.fillStyle = RED;
      g.fillText("Darkroom Labs", W / 2, H * 0.42 + 118);
      g.globalAlpha = 1;
      drawRobot(t, W / 2, H * 0.98, 0.45, a);
    } else {
      drawRobot(t, W / 2, H * 0.47, 1, 1);
      if (sec === "drop" || sec === "drop2") drawGrid(t, bar);
      if (sec === "drop2") {
        const files = ["01_kick.wav", "02_snare.wav", "03_hat.wav", "08_neuro.wav", "loop.mid", "loop.RPP"];
        files.forEach((f, i) => {
          const p = ((t - 16 * SD * 16) / (SD * 16 * 3) - i * 0.12);
          if (p <= 0 || p > 1.2) return;
          const x = W / 2 + (i % 2 ? 1 : -1) * (260 + p * 260), y = H * 0.25 + i * 55 - p * 60;
          g.globalAlpha = Math.min(1, 1.2 - p);
          g.fillStyle = "#170c0e"; g.strokeStyle = ORANGE; g.lineWidth = 2;
          roundRect(x - 110, y - 26, 220, 40, 6); g.fill(); g.stroke();
          g.font = `700 20px "SF Mono",Menlo,Consolas,monospace`; g.textAlign = "center"; g.fillStyle = FG;
          g.fillText(f, x, y + 1);
          g.globalAlpha = 1;
        });
      }
    }

    // captions (lower third)
    CAPTIONS.forEach(([b0, b1, txt]) => {
      if (bar >= b0 && bar < b1 && !(b0 === 20 && bar >= 21)) {
        const p = (t - b0 * SD * 16) / (SD * 16 * 0.6);
        g.fillStyle = "rgba(6,6,7,0.72)";
        g.fillRect(0, H - 150, W, 60);
        typeText(txt, W / 2, H - 108, 34, p, FG);
      }
    });

    // scanlines + subtle vignette
    g.fillStyle = "rgba(0,0,0,0.12)";
    for (let y = 0; y < H; y += 3) g.fillRect(0, y, W, 1);
    const v = g.createRadialGradient(W / 2, H / 2, H * 0.3, W / 2, H / 2, H * 0.9);
    v.addColorStop(0, "rgba(0,0,0,0)"); v.addColorStop(1, "rgba(0,0,0,0.55)");
    g.fillStyle = v; g.fillRect(0, 0, W, H);

    // tiny progress bar
    g.fillStyle = RED; g.fillRect(0, H - 4, (t / TOTAL) * W, 4);

    raf = requestAnimationFrame(draw);
  }

  function poster() {
    g.fillStyle = BG; g.fillRect(0, 0, W, H);
    eyeFlash = -10; flashes.fill(-10); antFlash = -10;
    drawFloor(0, 0);
    drawRobot(1, W / 2, H * 0.47, 1, 1);
    g.font = `700 44px "SF Mono",Menlo,Consolas,monospace`; g.textAlign = "center"; g.fillStyle = FG;
    g.fillText("CS-01 presents CircuitStomp", W / 2, H - 60);
  }

  async function start(record) {
    if (running) return;
    if (!window.CS || !CS.ready) { setStatus("Boot the robot first (the red button at the top)."); return; }
    CS.stop();
    const live = CS.live;
    if (live.state === "suspended") await live.resume();
    if (!analyser) { analyser = live.createAnalyser(); analyser.fftSize = 1024; scope = new Uint8Array(analyser.fftSize); }
    CS.chain.out.connect(analyser);
    groups = {}; flashes.fill(-10); eyeFlash = -10; antFlash = -10;
    t0 = live.currentTime + 0.15; nextStepTime = t0; stepIdx = 0;
    running = true;
    document.body.classList.add("promo-on");
    document.getElementById("promoPlay").hidden = true;
    if (record) startRecording();
    timer = setInterval(schedule, 25);
    schedule();
    draw();
    setStatus(record ? "Recording… keep this tab in front until it finishes (about 36 s)." : "");
  }

  function finish() {
    if (!running) return;
    running = false;
    document.body.classList.remove("promo-on");
    clearInterval(timer);
    cancelAnimationFrame(raf);
    try { CS.chain.out.disconnect(analyser); } catch (e) { /* */ }
    document.getElementById("promoPlay").hidden = false;
    document.getElementById("promoPlay").innerHTML = "&#8635; play again";
    if (recorder && recorder.state === "recording") recorder.stop();
    else poster();
  }

  function pickMime() {
    const opts = ["video/webm;codecs=vp9,opus", "video/webm;codecs=vp8,opus", "video/webm", "video/mp4"];
    return opts.find((m) => window.MediaRecorder && MediaRecorder.isTypeSupported && MediaRecorder.isTypeSupported(m)) || "";
  }

  function startRecording() {
    if (!window.MediaRecorder || !cv.captureStream) { setStatus("This browser can't record canvas video. Chrome, Edge or Firefox can.", true); return; }
    recDest = CS.live.createMediaStreamDestination();
    CS.chain.out.connect(recDest);
    const stream = new MediaStream([...cv.captureStream(30).getVideoTracks(), ...recDest.stream.getAudioTracks()]);
    const mime = pickMime();
    recorder = new MediaRecorder(stream, mime ? { mimeType: mime, videoBitsPerSecond: 6000000 } : undefined);
    recChunks = [];
    recorder.ondataavailable = (e) => { if (e.data && e.data.size) recChunks.push(e.data); };
    recorder.onstop = async () => {
      try { CS.chain.out.disconnect(recDest); } catch (e) { /* */ }
      const type = recorder.mimeType || "video/webm";
      const blob = new Blob(recChunks, { type });
      const ext = type.includes("mp4") ? "mp4" : "webm";
      try {
        const name = await window.__csDownload(blob, `circuitstomp_promo.${ext}`, type);
        setStatus(`Saved ${name} (${(blob.size / 1048576).toFixed(1)} MB). .webm plays in browsers and VLC and uploads straight to YouTube.`);
      } catch (e) { setStatus(e.message || "Couldn't save the video.", true); }
      recorder = null;
      poster();
    };
    recorder.start(1000);
  }

  function setStatus(msg, err) {
    const el = document.getElementById("promoStatus");
    if (!el) return;
    el.textContent = msg || ""; el.classList.toggle("err", !!err);
  }

  document.getElementById("promoPlay").addEventListener("click", () => start(false));
  document.getElementById("promoRec").addEventListener("click", () => start(true));
  document.getElementById("promoDrawer").addEventListener("toggle", (e) => { if (!e.target.open && running) finish(); });
  poster();
})();
