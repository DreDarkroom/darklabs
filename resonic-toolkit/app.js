const { useState, useEffect } = React;

const ResonicToolkit = () => {
    const [filePath, setFilePath] = useState('');
    const [playbackState, setPlaybackState] = useState('default');
    const [windowActivation, setWindowActivation] = useState('default');
    const [trackAdvance, setTrackAdvance] = useState('default');
    const [startPosition, setStartPosition] = useState('');
    const [fadeDuration, setFadeDuration] = useState('');

    // Pro features
    const [loopStart, setLoopStart] = useState('');
    const [loopEnd, setLoopEnd] = useState('');
    const [loopLength, setLoopLength] = useState('');
    const [loopAll, setLoopAll] = useState(false);

    const [generatedCommand, setGeneratedCommand] = useState('Resonic.exe');
    const [copySuccess, setCopySuccess] = useState(false);

    // Some CC0 demo tracks for the musicians
    const demoTracks = [
        {
            title: "Ghost Dance - Kevin MacLeod (CC0)",
            path: "C:\\Music\\CC0\\Ghost_Dance.ogg",
            desc: "A spooky, rhythmic public domain track."
        },
        {
            title: "Amen Break (Classic CC0 Sample)",
            path: "C:\\Samples\\Breaks\\AmenBreak_165bpm.wav",
            desc: "The classic breakbeat, perfect for testing looping."
        }
    ];

    useEffect(() => {
        let cmd = 'Resonic.exe';

        if (filePath.trim() !== '') {
            cmd += ` "${filePath.trim()}"`;
        }

        if (playbackState === 'stopped') cmd += ' --stopped';
        if (playbackState === 'paused') cmd += ' --paused';
        if (playbackState === 'browse') cmd += ' --browse';

        if (windowActivation === 'no-activate') cmd += ' --no-activate';
        if (windowActivation === 'activate') cmd += ' --activate';

        if (trackAdvance === 'no-advance') cmd += ' --no-advance';
        if (trackAdvance === 'advance') cmd += ' --advance';

        if (startPosition) cmd += ` --start-fract=${startPosition}`;
        if (fadeDuration) cmd += ` --start-ramp-duration=${fadeDuration}`;

        if (loopAll) {
            cmd += ' --loop-all';
        } else {
            if (loopStart) cmd += ` --loop-start=${loopStart}`;
            if (loopEnd) cmd += ` --loop-end=${loopEnd}`;
            if (loopLength && !loopEnd) cmd += ` --loop-length=${loopLength}`; // loop-length overrides loop-end if both are used, but good to keep UI clean
        }

        setGeneratedCommand(cmd);
        setCopySuccess(false);
    }, [
        filePath, playbackState, windowActivation, trackAdvance,
        startPosition, fadeDuration, loopStart, loopEnd, loopLength, loopAll
    ]);

    const handleCopy = async () => {
        try {
            await navigator.clipboard.writeText(generatedCommand);
            setCopySuccess(true);
            setTimeout(() => setCopySuccess(false), 2000);
        } catch (err) {
            console.error('Failed to copy text: ', err);
        }
    };

    const loadDemo = (track) => {
        setFilePath(track.path);
        // Reset some states for a clean slate
        setPlaybackState('default');
        setLoopAll(false);
        setLoopStart('');
        setLoopEnd('');
        setLoopLength('');
    };

    return (
        <div className="max-w-4xl mx-auto p-4 sm:p-6 lg:p-8">
            <div className="mb-8 border-b border-darkred/30 pb-4">
                <a href="/" className="text-darkred hover:text-red-400 text-sm font-semibold mb-4 inline-block transition-colors">&larr; Back to DarkLabs</a>
                <h1 className="text-3xl font-bold text-red-500 mb-2">Resonic CLI Toolkit</h1>
                <p className="text-gray-400">Generate command-line arguments for Resonic Player.</p>
            </div>

            <div className="grid grid-cols-1 lg:grid-cols-3 gap-8">
                <div className="lg:col-span-2 space-y-6">
                    {/* Basic Settings */}
                    <section className="bg-neutral-900 border border-darkred/40 rounded-lg p-5 shadow-lg">
                        <h2 className="text-xl text-red-400 font-semibold mb-4 border-b border-neutral-800 pb-2">Target File / Folder</h2>
                        <div className="mb-4">
                            <label className="block text-sm text-gray-300 mb-1">Full Path</label>
                            <input
                                type="text"
                                value={filePath}
                                onChange={(e) => setFilePath(e.target.value)}
                                placeholder="C:\Music\Track.wav"
                                className="w-full bg-black border border-neutral-700 rounded p-2 text-white focus:border-darkred focus:outline-none transition-colors"
                            />
                        </div>

                        <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
                            <div>
                                <label className="block text-sm text-gray-300 mb-1">Playback State</label>
                                <select
                                    value={playbackState}
                                    onChange={(e) => setPlaybackState(e.target.value)}
                                    className="w-full bg-black border border-neutral-700 rounded p-2 text-white focus:border-darkred focus:outline-none"
                                >
                                    <option value="default">Play Immediately (Default)</option>
                                    <option value="stopped">Stopped (--stopped)</option>
                                    <option value="paused">Paused (--paused)</option>
                                    <option value="browse">Browse Only (--browse)</option>
                                </select>
                            </div>
                            <div>
                                <label className="block text-sm text-gray-300 mb-1">Window Activation</label>
                                <select
                                    value={windowActivation}
                                    onChange={(e) => setWindowActivation(e.target.value)}
                                    className="w-full bg-black border border-neutral-700 rounded p-2 text-white focus:border-darkred focus:outline-none"
                                >
                                    <option value="default">Default Behavior</option>
                                    <option value="activate">Force Activate (--activate)</option>
                                    <option value="no-activate">Background (--no-activate)</option>
                                </select>
                            </div>
                            <div>
                                <label className="block text-sm text-gray-300 mb-1">Track Advance</label>
                                <select
                                    value={trackAdvance}
                                    onChange={(e) => setTrackAdvance(e.target.value)}
                                    className="w-full bg-black border border-neutral-700 rounded p-2 text-white focus:border-darkred focus:outline-none"
                                >
                                    <option value="default">Global Setting (Default)</option>
                                    <option value="advance">Force Advance (--advance)</option>
                                    <option value="no-advance">Do Not Advance (--no-advance)</option>
                                </select>
                            </div>
                        </div>
                    </section>

                    {/* Playback Tweaks */}
                    <section className="bg-neutral-900 border border-darkred/40 rounded-lg p-5 shadow-lg">
                        <h2 className="text-xl text-red-400 font-semibold mb-4 border-b border-neutral-800 pb-2">Playback Tweaks</h2>
                        <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
                            <div>
                                <label className="block text-sm text-gray-300 mb-1">Start Position (0.0 to 1.0)</label>
                                <input
                                    type="number"
                                    step="0.1"
                                    min="0"
                                    max="1"
                                    value={startPosition}
                                    onChange={(e) => setStartPosition(e.target.value)}
                                    placeholder="e.g. 0.5 for 50%"
                                    className="w-full bg-black border border-neutral-700 rounded p-2 text-white focus:border-darkred focus:outline-none"
                                />
                            </div>
                            <div>
                                <label className="block text-sm text-gray-300 mb-1">Fade In Duration (ms)</label>
                                <input
                                    type="number"
                                    step="100"
                                    min="0"
                                    value={fadeDuration}
                                    onChange={(e) => setFadeDuration(e.target.value)}
                                    placeholder="e.g. 5000 for 5s"
                                    className="w-full bg-black border border-neutral-700 rounded p-2 text-white focus:border-darkred focus:outline-none"
                                />
                            </div>
                        </div>
                    </section>

                    {/* Pro Features */}
                    <section className="bg-[#1a0f0f] border border-red-900 rounded-lg p-5 shadow-lg relative overflow-hidden">
                        <div className="absolute top-0 right-0 bg-darkred text-white text-xs font-bold px-2 py-1 rounded-bl">PRO ONLY</div>
                        <h2 className="text-xl text-red-500 font-semibold mb-2">Loop Selection</h2>
                        <p className="text-sm text-gray-400 mb-4">Warning: These parameters require Resonic Pro v0.9+. They will be ignored in the free Player version.</p>

                        <div className="mb-4">
                            <label className="flex items-center space-x-2 text-sm text-gray-300 cursor-pointer">
                                <input
                                    type="checkbox"
                                    checked={loopAll}
                                    onChange={(e) => {
                                        setLoopAll(e.target.checked);
                                        if (e.target.checked) {
                                            setLoopStart('');
                                            setLoopEnd('');
                                            setLoopLength('');
                                        }
                                    }}
                                    className="accent-darkred bg-black w-4 h-4"
                                />
                                <span>Loop Entire Track (--loop-all)</span>
                            </label>
                        </div>

                        {!loopAll && (
                            <div className="grid grid-cols-1 md:grid-cols-3 gap-4">
                                <div>
                                    <label className="block text-sm text-gray-300 mb-1">Loop Start</label>
                                    <input
                                        type="text"
                                        value={loopStart}
                                        onChange={(e) => setLoopStart(e.target.value)}
                                        placeholder="e.g. 0.1 or 5.25s"
                                        className="w-full bg-black border border-red-900/50 rounded p-2 text-white focus:border-red-500 focus:outline-none placeholder-gray-600"
                                    />
                                </div>
                                <div>
                                    <label className="block text-sm text-gray-300 mb-1">Loop End</label>
                                    <input
                                        type="text"
                                        value={loopEnd}
                                        onChange={(e) => setLoopEnd(e.target.value)}
                                        placeholder="e.g. 0.9 or 12.5s"
                                        disabled={!!loopLength}
                                        className="w-full bg-black border border-red-900/50 rounded p-2 text-white focus:border-red-500 focus:outline-none disabled:opacity-50 placeholder-gray-600"
                                    />
                                </div>
                                <div>
                                    <label className="block text-sm text-gray-300 mb-1">Loop Length</label>
                                    <input
                                        type="text"
                                        value={loopLength}
                                        onChange={(e) => setLoopLength(e.target.value)}
                                        placeholder="e.g. 10s"
                                        disabled={!!loopEnd}
                                        className="w-full bg-black border border-red-900/50 rounded p-2 text-white focus:border-red-500 focus:outline-none disabled:opacity-50 placeholder-gray-600"
                                    />
                                </div>
                            </div>
                        )}
                    </section>
                </div>

                <div className="space-y-6">
                    {/* Output Console */}
                    <div className="sticky top-6">
                        <div className="bg-black border border-darkred rounded-lg shadow-[0_0_15px_rgba(105,0,0,0.3)] overflow-hidden">
                            <div className="bg-neutral-900 border-b border-darkred/50 px-4 py-2 flex justify-between items-center">
                                <span className="text-xs font-mono text-gray-400 uppercase tracking-wider">Command Output</span>
                                <button
                                    onClick={handleCopy}
                                    className="text-xs bg-darkred hover:bg-red-700 text-white px-3 py-1 rounded transition-colors"
                                >
                                    {copySuccess ? 'Copied!' : 'Copy'}
                                </button>
                            </div>
                            <div className="p-4 bg-[#050505] min-h-[120px] flex items-start">
                                <code className="text-green-400 font-mono text-sm break-all">
                                    {generatedCommand}
                                </code>
                            </div>
                        </div>

                        {/* CC0 Demo Tracks */}
                        <div className="mt-6 bg-neutral-900 border border-neutral-800 rounded-lg p-5">
                            <h3 className="text-sm font-bold text-gray-300 uppercase tracking-wider mb-3">Test Material (CC0)</h3>
                            <p className="text-xs text-gray-400 mb-4 leading-relaxed">
                                Need audio to test with? Click a preset below to populate the command builder with a path to standard public domain audio.
                                Note: You need to have these files downloaded to these paths locally.
                            </p>
                            <div className="space-y-3">
                                {demoTracks.map((track, i) => (
                                    <div key={i} className="bg-black p-3 rounded border border-neutral-800 hover:border-darkred/50 transition-colors group cursor-pointer" onClick={() => loadDemo(track)}>
                                        <div className="font-semibold text-sm text-gray-200 group-hover:text-red-400 transition-colors">{track.title}</div>
                                        <div className="text-xs text-gray-500 mt-1 font-mono truncate">{track.path}</div>
                                    </div>
                                ))}
                            </div>
                        </div>
                    </div>
                </div>
            </div>
        </div>
    );
};

const root = ReactDOM.createRoot(document.getElementById('root'));
root.render(<ResonicToolkit />);