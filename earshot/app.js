import React, { useState, useEffect, useRef } from 'react';
import { createRoot } from 'react-dom/client';

// --- Web Audio API Context Initialization ---
// We initialize this lazily to comply with browser autoplay policies.
let audioCtx = null;

function initAudioContext() {
    if (!audioCtx) {
        audioCtx = new (window.AudioContext || window.webkitAudioContext)();
    }
    if (audioCtx.state === 'suspended') {
        audioCtx.resume();
    }
    return audioCtx;
}

// Global master gain to avoid blowing out speakers during prototyping
let masterGainNode = null;
function getMasterGain() {
    if (!masterGainNode && audioCtx) {
        masterGainNode = audioCtx.createGain();
        masterGainNode.gain.value = 0.8; // Default safe volume
        masterGainNode.connect(audioCtx.destination);
    }
    return masterGainNode;
}

// --- Audio Playback Engine ---
// We use a class or object to hold the currently playing source so we can stop it (zero-latency logic).
const AudioEngine = {
    currentSource: null,

    playBuffer: (buffer, offset = 0, volume = 1.0) => {
        if (!audioCtx || !buffer) return;

        // Stop any currently playing sound for instantaneous re-triggering
        if (AudioEngine.currentSource) {
            try { AudioEngine.currentSource.stop(); } catch(e) {}
        }

        const source = audioCtx.createBufferSource();
        source.buffer = buffer;

        const gainNode = audioCtx.createGain();
        gainNode.gain.value = volume;

        source.connect(gainNode);
        gainNode.connect(getMasterGain());

        source.start(0, offset);
        AudioEngine.currentSource = source;
    },

    stop: () => {
        if (AudioEngine.currentSource) {
            try { AudioEngine.currentSource.stop(); } catch(e) {}
            AudioEngine.currentSource = null;
        }
    }
};

// --- Visualisation ---
const WaveformVisualiser = ({ active }) => {
    const canvasRef = useRef(null);

    useEffect(() => {
        const canvas = canvasRef.current;
        if (!canvas) return;
        const ctx = canvas.getContext('2d');
        const width = canvas.width;
        const height = canvas.height;

        ctx.clearRect(0, 0, width, height);

        // Draw a mocked static waveform
        ctx.fillStyle = active ? '#a83232' : '#333333';
        const numBars = 60;
        const barWidth = width / numBars;

        for (let i = 0; i < numBars; i++) {
            // Generate some random-looking but deterministic heights
            const h = Math.abs(Math.sin(i * 0.5) * Math.cos(i * 3.1) * height * 0.8) + height * 0.1;
            const y = (height - h) / 2;
            // Leave a tiny gap between bars
            ctx.fillRect(i * barWidth, y, barWidth - 1, h);
        }
    }, [active]);

    return (
        <canvas
            ref={canvasRef}
            width={200}
            height={40}
            className="w-full h-10 opacity-70"
        />
    );
};

// --- Mock Data ---
const MOCK_TRACKS = [
    { id: 't1', title: 'Heavy Drum Break', type: 'SFX', tags: ['crunchy', 'lo-fi'], color: 'border-blue-500', bpm: 120, key: null },
    { id: 't2', title: 'Analog Synth Pad', type: 'Music', tags: ['warm', 'drone'], color: 'border-purple-500', bpm: 95, key: 'C min' },
    { id: 't3', title: 'Foley: Concrete Footsteps', type: 'SFX', tags: ['dry', 'close'], color: 'border-emerald-500', bpm: null, key: null }
];

// --- UI Components ---
const TagButton = ({ label, colorClass, onClick, active }) => (
    <button
        onClick={(e) => { e.stopPropagation(); onClick(); }}
        className={`px-3 py-1 text-[10px] font-bold uppercase tracking-wider rounded border ${active ? colorClass : 'border-neutral-700 text-neutral-500 hover:border-neutral-500'} transition-colors`}
    >
        {label}
    </button>
);

const TutorialOverlay = ({ onClose }) => (
    <div className="bg-dre-red/10 border border-dre-red rounded p-4 mb-8 relative">
        <button onClick={onClose} className="absolute top-2 right-2 text-dre-red hover:text-white">&times;</button>
        <h4 className="font-bold text-dre-red mb-2 uppercase tracking-wide text-sm">How to use Earshot</h4>
        <ul className="text-sm text-neutral-300 space-y-2">
            <li><strong className="text-white">Audition:</strong> Click any track or the play button for instant, zero-latency playback.</li>
            <li><strong className="text-white">Tagging:</strong> Use the LOVE, KEEP, MAYBE, DROP buttons to quickly sort audio.</li>
            <li><strong className="text-white">Visuals:</strong> The waveform highlights when playing, helping you "see" the sound.</li>
        </ul>
    </div>
);


// --- Main App Component ---
function EarshotApp() {
    const [isAudioReady, setIsAudioReady] = useState(false);
    const [tracks, setTracks] = useState(MOCK_TRACKS.map(t => ({...t, rating: null})));
    const [activeTrack, setActiveTrack] = useState(null);
    const [showTutorial, setShowTutorial] = useState(true);

    const handleStart = () => {
        initAudioContext();
        getMasterGain();
        setIsAudioReady(true);
    };

    const rateTrack = (id, rating) => {
        setTracks(tracks.map(t => t.id === id ? { ...t, rating } : t));
    };

    // Note: Since we are not hosting actual large audio files in this repo yet,
    // we use a mocked silent/synthetic buffer just to demonstrate the logic works
    // without throwing errors when 'Play' is clicked.
    const handlePlayMock = (track) => {
        setActiveTrack(track.id);
        if (!audioCtx) return;

        // Generate a synthetic beep (1 second) to simulate playback without external assets
        const buffer = audioCtx.createBuffer(1, audioCtx.sampleRate * 1, audioCtx.sampleRate);
        const data = buffer.getChannelData(0);
        for (let i = 0; i < buffer.length; i++) {
             // Simple sine wave fade out
             const t = i / audioCtx.sampleRate;
             data[i] = Math.sin(t * 440 * Math.PI * 2) * Math.max(0, 1 - t) * 0.2;
        }

        AudioEngine.playBuffer(buffer);
    };

    const handleStop = () => {
        setActiveTrack(null);
        AudioEngine.stop();
    };

    if (!isAudioReady) {
        return (
            <div className="flex items-center justify-center min-h-screen">
                <div className="text-center">
                    <h1 className="text-4xl font-bold mb-4 tracking-wider text-dre-red-soft">Earshot</h1>
                    <p className="text-neutral-400 mb-8 tracking-widest text-sm">COMMUNITY EDITION</p>
                    <button
                        onClick={handleStart}
                        className="px-6 py-3 bg-dre-red hover:bg-dre-red-soft text-white font-bold rounded shadow-[0_0_15px_rgba(105,0,0,0.5)] transition-all"
                    >
                        Initialize Audio Engine
                    </button>
                </div>
            </div>
        );
    }

    return (
        <div className="max-w-4xl mx-auto p-4 md:p-8">
            <header className="flex justify-between items-end mb-8 border-b border-neutral-800 pb-4">
                <div>
                    <h1 className="text-3xl font-bold text-dre-red tracking-tight">Earshot</h1>
                    <p className="text-neutral-500 text-sm tracking-widest uppercase">Community Audition Tool</p>
                </div>
                <button onClick={handleStop} className="px-4 py-2 bg-neutral-800 hover:bg-neutral-700 text-xs rounded font-bold uppercase tracking-wider text-neutral-300 transition-colors">
                    Stop All Audio
                </button>
            </header>

            <div className="grid gap-4">
                {tracks.map(track => (
                    <div
                        key={track.id}
                        className={`flex items-center justify-between p-4 bg-neutral-900 border-l-4 rounded shadow-sm hover:bg-neutral-800 transition-colors ${track.color} ${activeTrack === track.id ? 'ring-1 ring-dre-red-soft bg-neutral-800' : ''}`}
                    >
                        <div className="flex-1 cursor-pointer" onClick={() => handlePlayMock(track)}>
                            <div className="flex items-center gap-3 mb-1">
                                <span className="text-xs font-bold px-2 py-0.5 bg-neutral-800 rounded text-neutral-400 uppercase tracking-wide">{track.type}</span>
                                <h3 className="font-bold text-lg text-neutral-100">{track.title}</h3>
                            </div>
                            <div className="flex gap-4 items-center">
                                <div className="flex gap-2">
                                    {track.tags.map(tag => (
                                        <span key={tag} className="text-[10px] text-neutral-500 uppercase tracking-wider before:content-['#']">{tag}</span>
                                    ))}
                                </div>
                                {(track.bpm || track.key) && (
                                    <div className="flex gap-2 text-[10px] font-mono text-neutral-400 uppercase tracking-wider border-l border-neutral-700 pl-4">
                                        {track.bpm && <span>{track.bpm} BPM</span>}
                                        {track.key && <span>KEY: {track.key}</span>}
                                    </div>
                                )}
                            </div>
                        </div>

                        <div className="flex items-center gap-2 px-4 border-l border-neutral-800">
                            <TagButton label="Love" colorClass="bg-pink-900/50 border-pink-500 text-pink-300" active={track.rating === 'love'} onClick={() => rateTrack(track.id, 'love')} />
                            <TagButton label="Keep" colorClass="bg-emerald-900/50 border-emerald-500 text-emerald-300" active={track.rating === 'keep'} onClick={() => rateTrack(track.id, 'keep')} />
                            <TagButton label="Maybe" colorClass="bg-amber-900/50 border-amber-500 text-amber-300" active={track.rating === 'maybe'} onClick={() => rateTrack(track.id, 'maybe')} />
                            <TagButton label="Drop" colorClass="bg-neutral-800 border-neutral-600 text-neutral-400 opacity-50" active={track.rating === 'drop'} onClick={() => rateTrack(track.id, 'drop')} />
                        </div>

                        <div className="w-32 hidden md:block px-4">
                            <WaveformVisualiser active={activeTrack === track.id} />
                        </div>
                        <button
                            onClick={() => handlePlayMock(track)}
                            className="ml-4 w-12 h-12 flex items-center justify-center rounded-full bg-dre-red hover:bg-dre-red-soft text-white transition-transform active:scale-95"
                            aria-label="Play Track"
                        >
                            <svg className="w-5 h-5 ml-1" fill="currentColor" viewBox="0 0 20 20"><path d="M4 4l12 6-12 6z" /></svg>
                        </button>
                    </div>
                ))}
            </div>
        </div>
    );
}

const rootElement = document.getElementById('root');
const root = createRoot(rootElement);
root.render(<EarshotApp />);
