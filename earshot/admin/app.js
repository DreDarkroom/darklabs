import React, { useState, useEffect, useRef } from 'react';
import { createRoot } from 'react-dom/client';

// --- Global Audio ---
let audioCtx = null;
let masterGainNode = null;

function initAudioContext() {
    if (!audioCtx) {
        audioCtx = new (window.AudioContext || window.webkitAudioContext)();
    }
    if (audioCtx.state === 'suspended') {
        audioCtx.resume();
    }
    return audioCtx;
}

function getMasterGain() {
    if (!masterGainNode && audioCtx) {
        masterGainNode = audioCtx.createGain();
        masterGainNode.gain.value = 1.0;
        masterGainNode.connect(audioCtx.destination);
    }
    return masterGainNode;
}

// --- S-Pen Workstation Component ---
const StylusWaveformWorkspace = ({ penPos, slices }) => {
    const canvasRef = useRef(null);

    useEffect(() => {
        const canvas = canvasRef.current;
        if (!canvas) return;
        const ctx = canvas.getContext('2d');
        const { width, height } = canvas.getBoundingClientRect();

        // Ensure high DPI canvas for sharp rendering on S24 Ultra
        canvas.width = width * window.devicePixelRatio;
        canvas.height = height * window.devicePixelRatio;
        ctx.scale(window.devicePixelRatio, window.devicePixelRatio);

        ctx.clearRect(0, 0, width, height);

        // Draw Mock Slicing Waveform
        ctx.fillStyle = '#1a1a1a';
        ctx.fillRect(0, 0, width, height);

        // Draw established slices
        ctx.fillStyle = 'rgba(105, 0, 0, 0.15)'; // faint red background for slices
        slices.forEach(sliceX => {
            // Fill from 0 to slice, or slice to next slice (simplified for visual mock)
            ctx.fillRect(0, 0, sliceX, height);

            ctx.beginPath();
            ctx.moveTo(sliceX, 0);
            ctx.lineTo(sliceX, height);
            ctx.strokeStyle = '#ffffff';
            ctx.lineWidth = 1;
            ctx.setLineDash([]);
            ctx.stroke();

            // Label
            ctx.fillStyle = '#ffffff';
            ctx.font = '10px monospace';
            ctx.fillText('SLICE', sliceX + 4, height - 10);
        });

        // The waveform
        ctx.fillStyle = '#a83232';
        for (let i = 0; i < width; i += 4) {
            const h = Math.abs(Math.sin(i * 0.05) * Math.cos(i * 0.01) * height * 0.6) + 10;
            ctx.fillRect(i, (height - h) / 2, 2, h);
        }

        // Draw S-Pen Hover State (Precision Slicer line)
        if (penPos.isHovering || penPos.pressure > 0) {
            // Adjust the absolute screen X to relative Canvas X
            const rect = canvas.getBoundingClientRect();
            const relativeX = penPos.x - rect.left;

            if (relativeX >= 0 && relativeX <= width) {
                // Slicing Line
                ctx.beginPath();
                ctx.moveTo(relativeX, 0);
                ctx.lineTo(relativeX, height);
                ctx.strokeStyle = penPos.pressure > 0 ? '#ffffff' : '#690000';
                ctx.lineWidth = penPos.pressure > 0 ? 2 : 1;
                ctx.setLineDash(penPos.pressure > 0 ? [] : [4, 4]);
                ctx.stroke();

                // Hover precise timestamp mock
                ctx.fillStyle = penPos.pressure > 0 ? '#ffffff' : '#690000';
                ctx.font = '10px monospace';
                ctx.fillText(`+${(relativeX * 0.01).toFixed(3)}s`, relativeX + 5, 20);
            }
        }
    }, [penPos, slices]);

    return (
        <canvas
            ref={canvasRef}
            className="absolute inset-0 w-full h-full"
        />
    );
};


// --- App Component ---
function EarshotAdminApp() {
    const [isAudioReady, setIsAudioReady] = useState(false);

    // Stylus tracking state
    const [penPos, setPenPos] = useState({ x: 0, y: 0, isHovering: false, pressure: 0 });
    const [slices, setSlices] = useState([]);
    const [interactionLog, setInteractionLog] = useState("Waiting for stylus...");

    const handleStart = () => {
        initAudioContext();
        getMasterGain();
        setIsAudioReady(true);
    };

    // Global Pointer Events Listener
    useEffect(() => {
        if (!isAudioReady) return;

        const handlePointerEvent = (e) => {
            // Prevent default touch behaviors like scrolling
            e.preventDefault();

            // In the admin tier, we care specifically about the stylus
            if (e.pointerType === 'pen') {
                setPenPos({
                    x: e.clientX,
                    y: e.clientY,
                    isHovering: e.type === 'pointermove' && e.buttons === 0, // Hovering without pressing
                    pressure: e.pressure
                });

                if (e.type === 'pointerdown') {
                    setInteractionLog(`Stylus Down (Pressure: ${e.pressure.toFixed(2)})`);

                    // Logic to add a slice if pressure is applied
                    // In a real app we'd map clientX to canvas relative X here, but for mock purposes we map it in render
                    const canvasEl = document.querySelector('canvas');
                    if (canvasEl) {
                        const rect = canvasEl.getBoundingClientRect();
                        const relativeX = e.clientX - rect.left;
                        if (relativeX >= 0 && relativeX <= rect.width) {
                            setSlices(prev => [...prev, relativeX]);
                            setInteractionLog(`Slice added at +${(relativeX * 0.01).toFixed(3)}s`);
                        }
                    }

                } else if (e.type === 'pointerup') {
                    setInteractionLog(`Stylus Up`);
                }
            } else if (e.pointerType === 'touch') {
                // Ignore general touch events or map them to basic transport controls
                // We keep the main workspace clear for the pen.
            }
        };

        const eventOptions = { passive: false };
        window.addEventListener('pointerdown', handlePointerEvent, eventOptions);
        window.addEventListener('pointermove', handlePointerEvent, eventOptions);
        window.addEventListener('pointerup', handlePointerEvent, eventOptions);

        return () => {
            window.removeEventListener('pointerdown', handlePointerEvent);
            window.removeEventListener('pointermove', handlePointerEvent);
            window.removeEventListener('pointerup', handlePointerEvent);
        };
    }, [isAudioReady]);

    if (!isAudioReady) {
        return (
            <div className="flex items-center justify-center h-full w-full bg-black">
                <div className="text-center">
                    <h1 className="text-3xl font-bold mb-4 tracking-wider text-dre-red">Earshot S-Pen</h1>
                    <button
                        onClick={handleStart}
                        className="px-8 py-4 bg-neutral-900 border border-neutral-800 text-white font-bold rounded-full text-xl"
                    >
                        Tap to Start
                    </button>
                </div>
            </div>
        );
    }

    return (
        <div className="h-full w-full bg-black text-white p-4 flex flex-col cursor-crosshair relative">
            <header className="flex justify-between items-center border-b border-neutral-800 pb-2 mb-4">
                <h1 className="text-xl font-bold text-dre-red tracking-widest">Earshot<span className="text-neutral-600 text-sm ml-2">ADMIN</span></h1>
                <div className="text-[10px] font-mono bg-neutral-900 px-2 py-1 text-neutral-400">
                    {interactionLog}
                </div>
            </header>

            <div className="flex-1 border border-neutral-800 rounded relative overflow-hidden bg-neutral-950 flex items-center justify-center">

                {!penPos.isHovering && penPos.pressure === 0 && slices.length === 0 && (
                    <p className="text-neutral-600 uppercase tracking-widest text-sm text-center px-8 absolute z-10 pointer-events-none">
                        Bring S-Pen close to screen.<br/>Press to Slice.
                    </p>
                )}

                <StylusWaveformWorkspace penPos={penPos} slices={slices} />

                {/* Stylus Debug Cursor */}
                <div
                    className={`fixed w-4 h-4 rounded-full border border-dre-red pointer-events-none transform -translate-x-1/2 -translate-y-1/2 transition-opacity duration-75 z-50 ${penPos.isHovering || penPos.pressure > 0 ? 'opacity-100' : 'opacity-0'}`}
                    style={{
                        left: penPos.x,
                        top: penPos.y,
                        backgroundColor: penPos.pressure > 0 ? 'rgba(105,0,0,0.5)' : 'transparent',
                        transform: `translate(-50%, -50%) scale(${1 + penPos.pressure * 2})`
                    }}
                />
            </div>
        </div>
    );
}

const rootElement = document.getElementById('root');
const root = createRoot(rootElement);
root.render(<EarshotAdminApp />);
