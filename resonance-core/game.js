const canvas = document.getElementById('gameCanvas');
const ctx = canvas.getContext('2d');

// --- AUDIO SYSTEM ---
let audioCtx = null;
let masterGain = null;
let isAudioInitialized = false;

// Rhythm loop state
let nextNoteTime = 0;
let current16thNote = 0;
let lookahead = 25.0; // ms
let scheduleAheadTime = 0.1; // s
const tempo = 168; // BPM
let isRhythmPlaying = false;

function initAudioContext() {
    if (isAudioInitialized) return;
    try {
        const AudioContext = window.AudioContext || window.webkitAudioContext;
        audioCtx = new AudioContext();
        masterGain = audioCtx.createGain();
        masterGain.gain.value = 0.6;
        masterGain.connect(audioCtx.destination);
        isAudioInitialized = true;

        // Start rhythm loop
        isRhythmPlaying = true;
        nextNoteTime = audioCtx.currentTime + 0.1;
    } catch (e) {
        console.warn('Web Audio API not supported', e);
    }
}

// Procedural Drum Synthesis
function playKick(time) {
    if (!audioCtx) return;
    const osc = audioCtx.createOscillator();
    const gain = audioCtx.createGain();

    osc.connect(gain);
    gain.connect(masterGain);

    osc.frequency.setValueAtTime(130, time);
    osc.frequency.exponentialRampToValueAtTime(30, time + 0.1);

    gain.gain.setValueAtTime(1, time);
    gain.gain.exponentialRampToValueAtTime(0.01, time + 0.2);

    osc.start(time);
    osc.stop(time + 0.2);
}

function playSnare(time) {
    if (!audioCtx) return;
    // Noise
    const bufferSize = audioCtx.sampleRate * 0.2;
    const buffer = audioCtx.createBuffer(1, bufferSize, audioCtx.sampleRate);
    const data = buffer.getChannelData(0);
    for (let i = 0; i < bufferSize; i++) {
        data[i] = Math.random() * 2 - 1;
    }
    const noise = audioCtx.createBufferSource();
    noise.buffer = buffer;

    const noiseFilter = audioCtx.createBiquadFilter();
    noiseFilter.type = 'highpass';
    noiseFilter.frequency.value = 1000;

    const noiseGain = audioCtx.createGain();
    noiseGain.gain.setValueAtTime(1, time);
    noiseGain.gain.exponentialRampToValueAtTime(0.01, time + 0.2);

    noise.connect(noiseFilter);
    noiseFilter.connect(noiseGain);
    noiseGain.connect(masterGain);

    // Tone
    const osc = audioCtx.createOscillator();
    osc.type = 'triangle';
    const oscGain = audioCtx.createGain();

    osc.frequency.setValueAtTime(200, time);
    oscGain.gain.setValueAtTime(0.6, time);
    oscGain.gain.exponentialRampToValueAtTime(0.01, time + 0.1);

    osc.connect(oscGain);
    oscGain.connect(masterGain);

    noise.start(time);
    osc.start(time);
    noise.stop(time + 0.2);
    osc.stop(time + 0.2);
}

function playHihat(time) {
    if (!audioCtx) return;
    const bufferSize = audioCtx.sampleRate * 0.1;
    const buffer = audioCtx.createBuffer(1, bufferSize, audioCtx.sampleRate);
    const data = buffer.getChannelData(0);
    for (let i = 0; i < bufferSize; i++) {
        data[i] = Math.random() * 2 - 1;
    }
    const noise = audioCtx.createBufferSource();
    noise.buffer = buffer;

    const noiseFilter = audioCtx.createBiquadFilter();
    noiseFilter.type = 'highpass';
    noiseFilter.frequency.value = 7000;

    const gain = audioCtx.createGain();
    gain.gain.setValueAtTime(0.3, time);
    gain.gain.exponentialRampToValueAtTime(0.01, time + 0.05);

    noise.connect(noiseFilter);
    noiseFilter.connect(gain);
    gain.connect(masterGain);

    noise.start(time);
    noise.stop(time + 0.05);
}

// Synth Sounds
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

function playGuitarStab() {
    if (!audioCtx) return;
    const time = audioCtx.currentTime;
    const osc = audioCtx.createOscillator();
    osc.type = 'sawtooth';
    osc.frequency.setValueAtTime(110, time); // A2

    const distortion = audioCtx.createWaveShaper();
    distortion.curve = makeDistortionCurve(400);
    distortion.oversample = '4x';

    const filter = audioCtx.createBiquadFilter();
    filter.type = 'lowpass';
    filter.frequency.setValueAtTime(2000, time);
    filter.frequency.exponentialRampToValueAtTime(400, time + 0.3);

    const gain = audioCtx.createGain();
    gain.gain.setValueAtTime(0.5, time);
    gain.gain.exponentialRampToValueAtTime(0.01, time + 0.3);

    osc.connect(distortion);
    distortion.connect(filter);
    filter.connect(gain);
    gain.connect(masterGain);

    osc.start(time);
    osc.stop(time + 0.3);
}

function playBrassBlast() {
    if (!audioCtx) return;
    const time = audioCtx.currentTime;

    const osc1 = audioCtx.createOscillator();
    const osc2 = audioCtx.createOscillator();
    osc1.type = 'sawtooth';
    osc2.type = 'sawtooth';

    osc1.frequency.setValueAtTime(220, time); // A3
    osc2.frequency.setValueAtTime(224, time); // Detuned

    const filter = audioCtx.createBiquadFilter();
    filter.type = 'lowpass';
    filter.frequency.setValueAtTime(1000, time);
    filter.frequency.exponentialRampToValueAtTime(3000, time + 0.1);
    filter.frequency.exponentialRampToValueAtTime(500, time + 0.5);

    const gain = audioCtx.createGain();
    gain.gain.setValueAtTime(0, time);
    gain.gain.linearRampToValueAtTime(0.6, time + 0.05);
    gain.gain.exponentialRampToValueAtTime(0.01, time + 0.6);

    osc1.connect(filter);
    osc2.connect(filter);
    filter.connect(gain);
    gain.connect(masterGain);

    osc1.start(time);
    osc2.start(time);
    osc1.stop(time + 0.6);
    osc2.stop(time + 0.6);
}

function playCymbal() {
    if (!audioCtx) return;
    const time = audioCtx.currentTime;

    const bufferSize = audioCtx.sampleRate * 2.0;
    const buffer = audioCtx.createBuffer(1, bufferSize, audioCtx.sampleRate);
    const data = buffer.getChannelData(0);
    for (let i = 0; i < bufferSize; i++) {
        data[i] = Math.random() * 2 - 1;
    }
    const noise = audioCtx.createBufferSource();
    noise.buffer = buffer;

    // Metallic bandpass filter array
    const frequencies = [300, 800, 1200, 3000, 6000];
    const gain = audioCtx.createGain();
    gain.gain.setValueAtTime(0.3, time);
    gain.gain.exponentialRampToValueAtTime(0.01, time + 1.5);

    frequencies.forEach(freq => {
        const filter = audioCtx.createBiquadFilter();
        filter.type = 'bandpass';
        filter.frequency.value = freq;
        filter.Q.value = 10;
        noise.connect(filter);
        filter.connect(gain);
    });

    gain.connect(masterGain);

    noise.start(time);
    noise.stop(time + 1.5);
}

// Rhythm Scheduler
function scheduleRhythm() {
    if (!audioCtx || !isRhythmPlaying) return;
    while (nextNoteTime < audioCtx.currentTime + scheduleAheadTime) {
        scheduleNote(current16thNote, nextNoteTime);
        nextNote();
    }
}

function nextNote() {
    const secondsPerBeat = 60.0 / tempo;
    nextNoteTime += 0.25 * secondsPerBeat; // 16th note
    current16thNote++;
    if (current16thNote === 16) {
        current16thNote = 0;
    }
}

function scheduleNote(beatNumber, time) {
    // Basic DnB pattern
    if (beatNumber === 0 || beatNumber === 10) {
        playKick(time);
    }
    if (beatNumber === 4 || beatNumber === 12) {
        playSnare(time);
    }
    // Fast hi-hats with some swing
    if (beatNumber % 2 === 0 || beatNumber === 7 || beatNumber === 15) {
        playHihat(time);
    }
}

// --- GAME STATE ---
const GameState = {
    MENU: 0,
    PLAYING: 1,
    RESPAWN: 2,
    VICTORY: 3
};
let currentState = GameState.MENU;

// --- INPUT ---
const input = {
    left: false,
    right: false,
    jump: false,
    jumpJustPressed: false,
    strike: false,
    strikeJustPressed: false,
    restart: false
};

// Keyboard listeners
window.addEventListener('keydown', (e) => {
    switch(e.code) {
        case 'KeyA':
        case 'ArrowLeft':
            input.left = true; break;
        case 'KeyD':
        case 'ArrowRight':
            input.right = true; break;
        case 'Space':
        case 'KeyW':
        case 'ArrowUp':
            if (!input.jump) input.jumpJustPressed = true;
            input.jump = true;
            break;
        case 'KeyJ':
        case 'KeyE':
        case 'KeyK':
            if (!input.strike) input.strikeJustPressed = true;
            input.strike = true;
            break;
        case 'KeyR':
            input.restart = true; break;
    }
});

window.addEventListener('keyup', (e) => {
    switch(e.code) {
        case 'KeyA':
        case 'ArrowLeft':
            input.left = false; break;
        case 'KeyD':
        case 'ArrowRight':
            input.right = false; break;
        case 'Space':
        case 'KeyW':
        case 'ArrowUp':
            input.jump = false; break;
        case 'KeyJ':
        case 'KeyE':
        case 'KeyK':
            input.strike = false; break;
        case 'KeyR':
            input.restart = false; break;
    }
});

// Mobile Touch Listeners
const setupTouchBtn = (id, keyStart, keyEnd) => {
    const btn = document.getElementById(id);
    if (!btn) return;
    btn.addEventListener('touchstart', (e) => {
        e.preventDefault();
        keyStart();
    }, { passive: false });
    btn.addEventListener('touchend', (e) => {
        e.preventDefault();
        keyEnd();
    }, { passive: false });
};

setupTouchBtn('btn-left', () => input.left = true, () => input.left = false);
setupTouchBtn('btn-right', () => input.right = true, () => input.right = false);
setupTouchBtn('btn-jump',
    () => { if (!input.jump) input.jumpJustPressed = true; input.jump = true; },
    () => input.jump = false
);
setupTouchBtn('btn-strike',
    () => { if (!input.strike) input.strikeJustPressed = true; input.strike = true; },
    () => input.strike = false
);

// Prevent generic touch actions on canvas
canvas.addEventListener('touchstart', (e) => {
    e.preventDefault();
    if (currentState === GameState.MENU) {
        startGame();
    }
}, { passive: false });
document.addEventListener('keydown', (e) => {
    if (currentState === GameState.MENU) {
        startGame();
    }
});

function startGame() {
    currentState = GameState.PLAYING;
    initAudioContext();
}

// --- PLAYER & PHYSICS ---
const player = {
    x: 100,
    y: 100,
    width: 32,
    height: 48,
    vx: 0,
    vy: 0,
    speed: 360, // Max horizontal speed px/s
    accel: 2000,
    friction: 1500,
    gravity: 1200,
    jumpForce: -450,
    fallMultiplier: 2.5,
    lowJumpMultiplier: 2.0,

    isGrounded: false,
    jumpBufferTimer: 0,
    coyoteTimer: 0,

    // Attack state
    isStriking: false,
    strikeTimer: 0,
    strikeDuration: 0.12, // 120ms
    facingRight: true,

    color: '#08080A',
    glowColor: '#FF1E44'
};

// Physics helpers
function AABB(rect1, rect2) {
    return (
        rect1.x < rect2.x + rect2.width &&
        rect1.x + rect1.width > rect2.x &&
        rect1.y < rect2.y + rect2.height &&
        rect1.y + rect1.height > rect2.y
    );
}

// --- CAMERA ---
const camera = {
    x: 0,
    y: 0,
    width: 960,
    height: 540,
    lerpSpeed: 5,
    deadzoneX: 100,
    deadzoneY: 100
};

// --- VFX SYSTEM ---
const particles = [];

function spawnParticles(x, y, count, color) {
    for (let i = 0; i < count; i++) {
        particles.push({
            x: x,
            y: y,
            vx: (Math.random() - 0.5) * 400,
            vy: (Math.random() - 1.0) * 400,
            life: Math.random() * 0.2 + 0.2, // 0.2s - 0.4s
            maxLife: 0.4,
            size: Math.random() * 4 + 2,
            color: color
        });
    }
}

let screenShakeTimer = 0;
function addScreenShake(duration) {
    screenShakeTimer = duration;
}

// --- ENTITIES & HAZARDS ---
const hazards = [];
const checkpoints = [];
const collectibles = [];
const breakables = [];
let vaultTrigger = null;

let currentCheckpoint = { x: 460, y: 1800 }; // Default spawn
let score = 0;

function resetPlayer() {
    player.x = currentCheckpoint.x;
    player.y = currentCheckpoint.y;
    player.vx = 0;
    player.vy = 0;
    currentState = GameState.PLAYING;
}

// --- LEVEL GEOMETRY ---
// Map matches specification:
// - Base Spawn: x: 400, y: 1800
// - Ascent Shaft: vertical climb
// - Central Catalyst: x: 400, y: 800
// - West Alcove: x: -100, y: 800
// - East Turbine: x: 1000, y: 800
// - Mezzanine: x: 400, y: 200
// - Core Vault (End): x: 900, y: -200
const levelMap = {
    walls: [
        // Conduit Base
        { x: 300, y: 1900, width: 360, height: 40 }, // Base Floor
        { x: 300, y: 1600, width: 40, height: 340 }, // Base Left Wall
        { x: 620, y: 1600, width: 40, height: 340 }, // Base Right Wall

        // Ascent Shaft
        { x: 340, y: 1800, width: 100, height: 20 }, // Step 1
        { x: 520, y: 1700, width: 100, height: 20 }, // Step 2
        { x: 340, y: 1600, width: 100, height: 20 }, // Step 3
        { x: 520, y: 1500, width: 100, height: 20 }, // Step 4
        { x: 340, y: 1400, width: 100, height: 20 }, // Step 5
        { x: 520, y: 1300, width: 100, height: 20 }, // Step 6
        { x: 340, y: 1200, width: 100, height: 20 }, // Step 7
        { x: 520, y: 1100, width: 100, height: 20 }, // Step 8
        { x: 340, y: 1000, width: 100, height: 20 }, // Step 9

        { x: 300, y: 880, width: 40, height: 720 }, // Ascent Left Wall
        { x: 620, y: 880, width: 40, height: 720 }, // Ascent Right Wall

        // Central Catalyst Ring
        { x: 300, y: 880, width: 360, height: 40 }, // Catalyst Floor (Main Hub)
        { x: 400, y: 760, width: 160, height: 20 }, // Central Floating Platform

        // West Observation
        { x: 0, y: 880, width: 300, height: 40 }, // West Floor
        { x: 0, y: 600, width: 40, height: 320 }, // West Wall (End)
        { x: 40, y: 600, width: 260, height: 40 }, // West Ceiling

        // East Turbine (Secret)
        { x: 660, y: 880, width: 500, height: 40 }, // East Floor
        { x: 1160, y: 700, width: 40, height: 220 }, // East Wall (End)
        { x: 800, y: 700, width: 360, height: 40 }, // East Ceiling

        // Path up from Central
        { x: 300, y: 680, width: 100, height: 20 },
        { x: 560, y: 580, width: 100, height: 20 },
        { x: 300, y: 480, width: 100, height: 20 },
        { x: 560, y: 380, width: 100, height: 20 },

        // Upper Mezzanine
        { x: 300, y: 280, width: 360, height: 40 },
        { x: 260, y: -40, width: 40, height: 360 }, // Left containing wall
        { x: 300, y: 160, width: 120, height: 20 },
        { x: 500, y: 80, width: 120, height: 20 },
        { x: 660, y: 0, width: 120, height: 20 },

        // Core Vault (End Goal)
        { x: 800, y: -80, width: 400, height: 40 }, // Vault Floor
        { x: 800, y: -200, width: 40, height: 120 }, // Vault Left entrance wall
        { x: 1200, y: -400, width: 40, height: 360 }, // Vault Right End wall
        { x: 800, y: -400, width: 400, height: 40 }  // Vault Ceiling
    ]
};

// Populate Entities
hazards.push({ x: 340, y: 1880, width: 100, height: 20 }); // Base spikes
hazards.push({ x: 400, y: 860, width: 160, height: 20 }); // Catalyst pit spikes
hazards.push({ x: 840, y: -60, width: 80, height: 20 }); // Vault trap

checkpoints.push({ x: 140, y: 800, width: 40, height: 80, active: false }); // West Checkpoint
checkpoints.push({ x: 460, y: 200, width: 40, height: 80, active: false }); // Mezzanine Checkpoint

collectibles.push({ x: 140, y: 700, size: 20, collected: false }); // West Cell
collectibles.push({ x: 1060, y: 800, size: 20, collected: false }); // East Cell

breakables.push({ x: 660, y: 720, width: 20, height: 160, broken: false }); // Grating blocking East Turbine

vaultTrigger = { x: 1000, y: -160, width: 80, height: 80, active: true };

// Spawn position
player.x = 460;
player.y = 1800;

// --- MAIN LOOP ---
let lastTime = 0;
function gameLoop(timestamp) {
    const dt = (timestamp - lastTime) / 1000; // Delta time in seconds
    lastTime = timestamp;

    // Cap dt to prevent massive jumps on tab switches
    const safeDt = Math.min(dt, 0.1);

    if (isAudioInitialized) {
        scheduleRhythm();
    }

    update(safeDt);
    draw(ctx);

    // Reset frame-specific inputs
    input.jumpJustPressed = false;
    input.strikeJustPressed = false;
    input.restart = false;

    requestAnimationFrame(gameLoop);
}

function update(dt) {
    if (input.restart) {
        resetPlayer();
    }

    if (currentState === GameState.PLAYING) {
        // --- Player Physics & Input ---

        // Timers
        if (player.coyoteTimer > 0) player.coyoteTimer -= dt;
        if (player.jumpBufferTimer > 0) player.jumpBufferTimer -= dt;
        if (input.jumpJustPressed) player.jumpBufferTimer = 0.1; // 100ms jump buffer

        if (player.isStriking) {
            player.strikeTimer -= dt;
            if (player.strikeTimer <= 0) {
                player.isStriking = false;
            }
        }

        // Horizontal Movement
        if (input.left) {
            player.vx -= player.accel * dt;
            player.facingRight = false;
        } else if (input.right) {
            player.vx += player.accel * dt;
            player.facingRight = true;
        } else {
            // Friction
            if (player.vx > 0) {
                player.vx -= player.friction * dt;
                if (player.vx < 0) player.vx = 0;
            } else if (player.vx < 0) {
                player.vx += player.friction * dt;
                if (player.vx > 0) player.vx = 0;
            }
        }

        // Clamp velocity
        if (player.vx > player.speed) player.vx = player.speed;
        if (player.vx < -player.speed) player.vx = -player.speed;

        // Jumping
        if (player.jumpBufferTimer > 0 && player.coyoteTimer > 0) {
            player.vy = player.jumpForce;
            player.jumpBufferTimer = 0;
            player.coyoteTimer = 0;
            spawnParticles(player.x + player.width/2, player.y + player.height, 10, '#FF1E44');
        }

        // Variable jump height / gravity multiplier
        if (player.vy < 0 && !input.jump) {
            // Let go of jump early
            player.vy += player.gravity * player.lowJumpMultiplier * dt;
        } else if (player.vy > 0) {
            // Falling
            player.vy += player.gravity * player.fallMultiplier * dt;
        } else {
            // Normal gravity
            player.vy += player.gravity * dt;
        }

        // Strike
        if (input.strikeJustPressed && !player.isStriking) {
            player.isStriking = true;
            player.strikeTimer = player.strikeDuration;
            playGuitarStab();
        }

        // Move X
        player.x += player.vx * dt;
        player.isGrounded = false; // Reset before Y check

        // Collision X (placeholder for full level collision)
        for (let wall of levelMap.walls) {
            if (AABB(player, wall)) {
                if (player.vx > 0) {
                    player.x = wall.x - player.width;
                } else if (player.vx < 0) {
                    player.x = wall.x + wall.width;
                }
                player.vx = 0;
            }
        }

        // Move Y
        player.y += player.vy * dt;

        // Collision Y (placeholder for full level collision)
        for (let wall of levelMap.walls) {
            if (AABB(player, wall)) {
                if (player.vy > 0) {
                    player.y = wall.y - player.height;
                    if (!player.isGrounded) {
                        // Just landed
                        spawnParticles(player.x + player.width/2, player.y + player.height, 8, '#FF6B00');
                    }
                    player.isGrounded = true;
                    player.coyoteTimer = 0.08; // 80ms coyote time
                } else if (player.vy < 0) {
                    player.y = wall.y + wall.height;
                }
                player.vy = 0;
            }
        }


        // Entity Interactions
        // Hazards
        for (let hazard of hazards) {
            if (AABB(player, hazard)) {
                // Death
                currentState = GameState.RESPAWN;
                setTimeout(resetPlayer, 1000);
            }
        }

        // Strike hitbox logic
        let strikeBox = null;
        if (player.isStriking) {
            if (player.facingRight) {
                strikeBox = { x: player.x + player.width, y: player.y + 10, width: 40, height: 20 };
            } else {
                strikeBox = { x: player.x - 40, y: player.y + 10, width: 40, height: 20 };
            }

            // Checkpoints
            for (let cp of checkpoints) {
                if (!cp.active && AABB(strikeBox, cp)) {
                    cp.active = true;
                    currentCheckpoint.x = cp.x + 20;
                    currentCheckpoint.y = cp.y + cp.height - player.height;
                    playBrassBlast();
                    spawnParticles(cp.x + cp.width/2, cp.y + cp.height/2, 20, '#FF1E44');
                    addScreenShake(0.1);
                }
            }

            // Breakables
            for (let b of breakables) {
                if (!b.broken && AABB(strikeBox, b)) {
                    b.broken = true;
                    playCymbal();
                    spawnParticles(b.x + b.width/2, b.y + b.height/2, 15, '#FFFFFF');
                    addScreenShake(0.08);
                }
            }

            // Vault Trigger
            if (vaultTrigger.active && AABB(strikeBox, vaultTrigger)) {
                vaultTrigger.active = false;
                currentState = GameState.VICTORY;
                playBrassBlast();
                isRhythmPlaying = false; // Stop rhythm
                spawnParticles(vaultTrigger.x + vaultTrigger.width/2, vaultTrigger.y + vaultTrigger.height/2, 50, '#FF1E44');
                addScreenShake(0.3);
            }
        }

        // Collectibles (Touch)
        for (let c of collectibles) {
            if (!c.collected) {
                const cBox = { x: c.x - c.size/2, y: c.y - c.size/2, width: c.size, height: c.size };
                if (AABB(player, cBox)) {
                    c.collected = true;
                    score += 100;
                    playCymbal();
                    spawnParticles(c.x, c.y, 10, '#FFFFFF');
                }
            }
        }

        // Particles Update
        for (let i = particles.length - 1; i >= 0; i--) {
            let p = particles[i];
            p.x += p.vx * dt;
            p.y += p.vy * dt;
            p.vy += player.gravity * dt; // Apply gravity
            p.life -= dt;
            if (p.life <= 0) {
                particles.splice(i, 1);
            }
        }

        // Screen Shake Update
        if (screenShakeTimer > 0) {
            screenShakeTimer -= dt;
        }

        // Update Camera Tracking
        const targetCamX = player.x + player.width / 2 - camera.width / 2;
        const targetCamY = player.y + player.height / 2 - camera.height / 2;

        // Smooth Lerp
        camera.x += (targetCamX - camera.x) * camera.lerpSpeed * dt;
        camera.y += (targetCamY - camera.y) * camera.lerpSpeed * dt;
    }
}

function draw(ctx) {
    // Clear background
    ctx.fillStyle = '#08080A'; // Void Black
    ctx.fillRect(0, 0, canvas.width, canvas.height);

    if (currentState === GameState.MENU) {
        ctx.fillStyle = '#FFFFFF';
        ctx.font = '32px monospace';
        ctx.textAlign = 'center';
        ctx.fillText('RESONANCE CORE', canvas.width / 2, canvas.height / 2 - 20);
        ctx.fillStyle = '#FF6B00';
        ctx.font = '16px monospace';
        ctx.fillText('Press any key or tap to start', canvas.width / 2, canvas.height / 2 + 20);
    } else if (currentState === GameState.PLAYING) {
        ctx.save();

        // Screen Shake Transform
        let shakeX = 0;
        let shakeY = 0;
        if (screenShakeTimer > 0) {
            shakeX = (Math.random() - 0.5) * 8;
            shakeY = (Math.random() - 0.5) * 8;
        }

        // Apply Camera Transform
        ctx.translate(-Math.floor(camera.x) + shakeX, -Math.floor(camera.y) + shakeY);

        // Beat-Reactive Background Pulse
        if (isAudioInitialized && isRhythmPlaying) {
            // Pulse on the beat (assuming 4/4 time, kick is on 0 and 10 usually)
            if (current16thNote === 0 || current16thNote === 8) {
                 ctx.fillStyle = 'rgba(255, 30, 68, 0.05)';
                 ctx.fillRect(camera.x, camera.y, camera.width, camera.height);
            }
        }

        // Draw Level Geometry
        ctx.fillStyle = '#16171B'; // Dark Charcoal
        for (let wall of levelMap.walls) {
            ctx.fillRect(wall.x, wall.y, wall.width, wall.height);
        }

        // Draw Breakables
        ctx.fillStyle = '#24272E'; // Grimy Steel
        for (let b of breakables) {
            if (!b.broken) {
                ctx.fillRect(b.x, b.y, b.width, b.height);
            }
        }

        // Draw Hazards
        ctx.fillStyle = '#FF6B00'; // Molten Orange
        for (let h of hazards) {
            ctx.fillRect(h.x, h.y, h.width, h.height);
        }

        // Draw Checkpoints
        for (let cp of checkpoints) {
            ctx.fillStyle = cp.active ? '#FF1E44' : '#24272E';
            ctx.fillRect(cp.x, cp.y, cp.width, cp.height);
        }

        // Draw Collectibles
        ctx.fillStyle = '#FFFFFF';
        for (let c of collectibles) {
            if (!c.collected) {
                ctx.beginPath();
                ctx.arc(c.x, c.y, c.size/2, 0, Math.PI*2);
                ctx.fill();
            }
        }

        // Draw Vault
        if (vaultTrigger.active) {
            ctx.fillStyle = '#FF1E44';
            ctx.fillRect(vaultTrigger.x, vaultTrigger.y, vaultTrigger.width, vaultTrigger.height);
        }

        // Draw Particles
        for (let p of particles) {
            ctx.fillStyle = p.color;
            ctx.globalAlpha = p.life / p.maxLife;
            ctx.fillRect(p.x, p.y, p.size, p.size);
        }
        ctx.globalAlpha = 1.0;

        // Draw Player
        // Main body (silhouette)
        ctx.fillStyle = player.color;
        ctx.fillRect(player.x, player.y, player.width, player.height);

        // Crimson Core Glow
        ctx.fillStyle = player.glowColor;
        ctx.fillRect(player.x + 10, player.y + 16, 12, 16);

        // Visor Highlight
        ctx.fillStyle = '#FFFFFF';
        if (player.facingRight) {
            ctx.fillRect(player.x + 20, player.y + 6, 8, 4);
        } else {
            ctx.fillRect(player.x + 4, player.y + 6, 8, 4);
        }

        // Draw Strike Hitbox
        if (player.isStriking) {
            ctx.fillStyle = 'rgba(255, 255, 255, 0.8)';
            if (player.facingRight) {
                // Strike Arc (simple visual)
                ctx.beginPath();
                ctx.strokeStyle = '#FF1E44';
                ctx.lineWidth = 3;
                ctx.moveTo(player.x + player.width, player.y);
                ctx.quadraticCurveTo(player.x + player.width + 50, player.y + 20, player.x + player.width, player.y + 40);
                ctx.stroke();
            } else {
                // Strike Arc
                ctx.beginPath();
                ctx.strokeStyle = '#FF1E44';
                ctx.lineWidth = 3;
                ctx.moveTo(player.x, player.y);
                ctx.quadraticCurveTo(player.x - 50, player.y + 20, player.x, player.y + 40);
                ctx.stroke();
            }
        }

        ctx.restore();
    } else if (currentState === GameState.RESPAWN) {
        ctx.fillStyle = '#FF1E44';
        ctx.font = '32px monospace';
        ctx.textAlign = 'center';
        ctx.fillText('SIGNAL LOST', canvas.width / 2, canvas.height / 2);
    } else if (currentState === GameState.VICTORY) {
        ctx.fillStyle = '#FFFFFF';
        ctx.font = '32px monospace';
        ctx.textAlign = 'center';
        ctx.fillText('CORE EXTRACTED', canvas.width / 2, canvas.height / 2 - 20);
        ctx.fillStyle = '#FF6B00';
        ctx.font = '16px monospace';
        ctx.fillText('Score: ' + score, canvas.width / 2, canvas.height / 2 + 20);
    }
}

// Start the loop
requestAnimationFrame((t) => { lastTime = t; gameLoop(t); });
