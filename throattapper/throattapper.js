const AudioContext = window.AudioContext || window.webkitAudioContext;
let ctx;
let masterGain;
let distortion;
let compressor;
let dropMode = false;

const buffers = {
    'tap-1': null, // soft
    'tap-2': null, // hard
    'tap-3': null, // double
    'tap-4': null, // rapid
    'hum': null
};

// Map QWERTY middle row to semitones (starting at C)
// A S D F G H J K L ; '
// C C# D D# E F F# G G# A A#
const keyToSemitone = {
    'a': 0,
    'w': 1,
    's': 2,
    'e': 3,
    'd': 4,
    'f': 5,
    't': 6,
    'g': 7,
    'y': 8,
    'h': 9,
    'u': 10,
    'j': 11,
    'k': 12,
    'o': 13,
    'l': 14,
    'p': 15,
    ';': 16,
    "'": 17
};

function makeDistortionCurve(amount) {
    const k = typeof amount === 'number' ? amount : 50,
        n_samples = 44100,
        curve = new Float32Array(n_samples),
        deg = Math.PI / 180;
    for (let i = 0; i < n_samples; ++i) {
        let x = i * 2 / n_samples - 1;
        curve[i] = (3 + k) * x * 20 * deg / (Math.PI + k * Math.abs(x));
    }
    return curve;
}

async function loadSample(name, url) {
    try {
        const response = await fetch(url);
        const arrayBuffer = await response.arrayBuffer();
        buffers[name] = await ctx.decodeAudioData(arrayBuffer);
    } catch (e) {
        console.error(`Failed to load ${url}`, e);
    }
}

async function initAudio() {
    if (ctx) return;
    
    ctx = new AudioContext();
    
    masterGain = ctx.createGain();
    
    distortion = ctx.createWaveShaper();
    distortion.curve = makeDistortionCurve(400);
    distortion.oversample = '4x';
    
    compressor = ctx.createDynamicsCompressor();
    compressor.threshold.setValueAtTime(-24, ctx.currentTime);
    compressor.knee.setValueAtTime(30, ctx.currentTime);
    compressor.ratio.setValueAtTime(12, ctx.currentTime);
    compressor.attack.setValueAtTime(0.003, ctx.currentTime);
    compressor.release.setValueAtTime(0.25, ctx.currentTime);
    
    updateRouting();
    
    await Promise.all([
        loadSample('tap-1', 'assets/audio/tap-single-soft.wav'),
        loadSample('tap-2', 'assets/audio/tap-single-hard.wav'),
        loadSample('tap-3', 'assets/audio/tap-double.wav'),
        loadSample('tap-4', 'assets/audio/tap-rapid.wav'),
        loadSample('hum', 'assets/audio/tonal-hum.wav')
    ]);
}

function updateRouting() {
    if (!ctx) return;
    
    masterGain.disconnect();
    distortion.disconnect();
    compressor.disconnect();
    
    if (dropMode) {
        masterGain.connect(distortion);
        distortion.connect(compressor);
        compressor.connect(ctx.destination);
    } else {
        masterGain.connect(ctx.destination);
    }
}

function playTap(type) {
    if (!ctx || !buffers[type]) return;
    
    const source = ctx.createBufferSource();
    source.buffer = buffers[type];
    source.connect(masterGain);
    source.start();
}

function playHum(semitoneOffset) {
    if (!ctx || !buffers['hum']) return;
    
    const source = ctx.createBufferSource();
    source.buffer = buffers['hum'];
    
    // Calculate playback rate for pitch shift
    // Default rate is 1.0. Each semitone is a ratio of 2^(1/12)
    source.playbackRate.value = Math.pow(2, semitoneOffset / 12);
    
    source.connect(masterGain);
    source.start();
}

document.addEventListener('keydown', async (e) => {
    if (e.repeat) return; // Prevent key hold repeats
    
    await initAudio();
    
    const key = e.key.toLowerCase();
    
    if (key === '1') playTap('tap-1');
    else if (key === '2') playTap('tap-2');
    else if (key === '3') playTap('tap-3');
    else if (key === '4') playTap('tap-4');
    
    if (keyToSemitone.hasOwnProperty(key)) {
        playHum(keyToSemitone[key]);
    }
});

document.getElementById('btn-drop').addEventListener('click', async (e) => {
    await initAudio();
    dropMode = !dropMode;
    const btn = e.target;
    btn.textContent = `DROP MODE: ${dropMode ? 'ON' : 'OFF'}`;
    btn.classList.toggle('active', dropMode);
    updateRouting();
});

// Click anywhere to initialize audio context (browser autoplay policy)
document.addEventListener('click', initAudio, { once: true });
