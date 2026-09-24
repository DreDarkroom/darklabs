import React, { useState, useEffect, useRef } from 'react';
import { Film, PenTool, Activity, Camera, Play, Pause, SkipForward, SkipBack, Maximize, Volume2, Download, Video, Repeat } from 'lucide-react';

// --- Views ---

// Dre Darkroom Playlist Config
const PLAYLIST = [
  {
    id: 'NcXeq5Uxqlg',
    title: 'Late Nite',
    channel: 'Dre Darkroom',
    description: 'Ableton Visualiser',
    type: 'youtube',
    source: 'NcXeq5Uxqlg',
    duration: '04:20', // approximated duration
    thumbnail: 'https://img.youtube.com/vi/NcXeq5Uxqlg/hqdefault.jpg' // Standard youtube thumbnail
  }
];

const CinemaHub = () => {
  const [activeVideo, setActiveVideo] = useState(null);
  const [isPlaying, setIsPlaying] = useState(false);
  const videoRef = useRef(null);

  useEffect(() => {
    if (PLAYLIST && PLAYLIST.length > 0) {
      setActiveVideo(PLAYLIST[0]);
    }
  }, []);

  const togglePlay = () => {
    if (activeVideo && activeVideo.type === 'mp4' && videoRef.current) {
      if (isPlaying) {
        videoRef.current.pause();
      } else {
        videoRef.current.play();
      }
    }
    setIsPlaying(!isPlaying);
  };

  // Reset playing state when video changes
  useEffect(() => {
    if (activeVideo) {
      setIsPlaying(activeVideo.type === 'mp4'); // Auto-play mp4 on switch if desired, or set to true for default
    }
  }, [activeVideo]);

  if (!activeVideo) {
    return <div className="h-full flex flex-col bg-neutral-950 items-center justify-center"><p className="text-white">Loading...</p></div>;
  }

  return (
    <div className="h-full flex flex-col bg-neutral-950">
      {/* Cinematic Player Area */}
      <div className="w-full bg-black aspect-video relative shadow-2xl shadow-black group">
        {activeVideo.type === 'youtube' ? (
          <iframe
            className="w-full h-full absolute top-0 left-0"
            src={`https://www.youtube-nocookie.com/embed/${activeVideo.source}?autoplay=0&modestbranding=1&rel=0&controls=0`}
            title={activeVideo.title}
            frameBorder="0"
            allow="accelerometer; autoplay; clipboard-write; encrypted-media; gyroscope; picture-in-picture"
            allowFullScreen
          ></iframe>
        ) : (
          <video
            ref={videoRef}
            className="w-full h-full absolute top-0 left-0 object-contain"
            src={activeVideo.source}
            title={activeVideo.title}
            playsInline
            loop
            autoPlay
          ></video>
        )}

        {/* Mock Custom Controls Overlay */}
        <div className="absolute bottom-0 left-0 w-full bg-gradient-to-t from-black/90 to-transparent p-4 opacity-0 group-hover:opacity-100 transition-opacity flex flex-col justify-end pointer-events-none">
           {/* Timeline */}
           <div className="w-full h-1 bg-neutral-700 rounded-full mb-3 overflow-hidden pointer-events-auto cursor-pointer">
              <div className="w-1/3 h-full bg-[#690000]"></div>
           </div>

           <div className="flex justify-between items-center pointer-events-auto">
              <div className="flex items-center space-x-4">
                 <button className="text-white hover:text-neutral-300 transition" onClick={togglePlay}>
                    {isPlaying ? <Pause size={20} fill="currentColor" /> : <Play size={20} fill="currentColor" />}
                 </button>
                 <button className="text-white hover:text-neutral-300 transition">
                    <SkipForward size={20} />
                 </button>
                 <button className="text-white hover:text-neutral-300 transition">
                    <Volume2 size={20} />
                 </button>
                 <span className="text-xs text-neutral-300 font-mono">00:05 / {activeVideo.duration}</span>
              </div>
              <button className="text-white hover:text-neutral-300 transition">
                 <Maximize size={20} />
              </button>
           </div>
        </div>
      </div>

      {/* Video Details */}
      <div className="p-4 border-b border-neutral-800 bg-neutral-900/50 flex justify-between items-start">
        <div>
           <h2 className="text-xl font-bold text-white mb-1">{activeVideo.title}</h2>
           <div className="flex items-center text-sm text-neutral-400 space-x-4">
             <span className="flex items-center"><Film size={14} className="mr-1" /> Dre Darkroom</span>
             <span>{activeVideo.duration}</span>
           </div>
        </div>
        <button className="p-2 rounded-full bg-neutral-800 text-white hover:bg-neutral-700">
           <SkipBack size={18} />
        </button>
      </div>

      {/* Scrollable Gallery (Bento Grid Style) */}
      <div className="flex-1 overflow-y-auto p-4">
        <h3 className="text-sm font-semibold tracking-wider text-neutral-500 uppercase mb-4">Up Next</h3>
        <div className="grid grid-cols-1 sm:grid-cols-2 gap-4">
          {PLAYLIST.map((video) => (
            <div
              key={video.id}
              onClick={() => setActiveVideo(video)}
              className={`group flex items-center bg-neutral-900 rounded-xl overflow-hidden cursor-pointer border transition-colors ${activeVideo.id === video.id ? 'border-neutral-500' : 'border-neutral-800 hover:border-neutral-600'}`}
            >
              <div className="w-1/3 aspect-video relative bg-neutral-800">
                 <img
                    src={video.thumbnail}
                    alt={video.title}
                    className="w-full h-full object-cover opacity-80 group-hover:opacity-100 transition-opacity"
                    onError={(e) => { e.target.src = 'data:image/svg+xml;utf8,<svg xmlns="http://www.w3.org/2000/svg" width="400" height="300"><defs><linearGradient id="g" x1="0%" y1="0%" x2="100%" y2="100%"><stop offset="0%" stop-color="%23171717" /><stop offset="100%" stop-color="%230a0a0a" /></linearGradient></defs><rect width="100%" height="100%" fill="url(%23g)"/></svg>'; }}
                 />
              </div>
              <div className="w-2/3 p-3">
                <h4 className="text-sm font-medium text-neutral-200 line-clamp-2">{video.title}</h4>
                <p className="text-xs text-neutral-500 mt-1">{video.duration}</p>
              </div>
            </div>
          ))}
        </div>
      </div>
    </div>
  );
};

const StylusLab = () => {
  const [pressure, setPressure] = useState(0);
  const [pointerType, setPointerType] = useState('none');
  const [score, setScore] = useState(0);
  const [targetSize, setTargetSize] = useState(100);
  const [isHit, setIsHit] = useState(false);

  const handlePointerDown = (e) => {
    setPointerType(e.pointerType);
    updatePressure(e);
  };

  const handlePointerMove = (e) => {
    // Only update if pointer is down
    if (e.buttons > 0) {
      setPointerType(e.pointerType);
      updatePressure(e);
    }
  };

  const handlePointerUp = (e) => {
    setPressure(0);
  };

  const updatePressure = (e) => {
    // W3C Pointer Events standardizes pressure between 0 and 1
    const p = e.pressure || (e.pointerType === 'pen' ? 0.5 : 1); // fallback for pens without pressure
    setPressure(p);

    if (e.pointerType === 'pen') {
       if (p > 0.5 && !isHit) {
          setIsHit(true);
          setScore(s => s + 10);
          setTargetSize(Math.max(30, targetSize - 10)); // shrink target
          setTimeout(() => setIsHit(false), 500);
       }
    }
  };

  return (
    <div className="flex-1 p-4 flex flex-col items-center justify-start h-full bg-neutral-950">
      <div className="text-center mb-6 w-full max-w-md">
        <h2 className="text-2xl font-black uppercase tracking-widest text-white mb-2">Precision Lab</h2>
        <p className="text-sm text-neutral-400">
          Status: <span className={pointerType === 'pen' ? 'text-green-400' : 'text-yellow-400'}>{pointerType === 'pen' ? 'Stylus Detected' : 'Awaiting Stylus...'}</span>
        </p>
        <div className="flex justify-between mt-4 px-4">
           <div className="text-left">
              <div className="text-xs text-neutral-500 uppercase tracking-wider">Pressure</div>
              <div className="text-xl font-mono text-white">{(pressure * 100).toFixed(0)}%</div>
           </div>
           <div className="text-right">
              <div className="text-xs text-neutral-500 uppercase tracking-wider">Score</div>
              <div className="text-xl font-mono text-white">{score}</div>
           </div>
        </div>
      </div>

      {/* Interaction Zone */}
      <div
        className="flex-1 w-full max-w-md relative border border-neutral-800 rounded-3xl bg-neutral-900/30 overflow-hidden flex items-center justify-center"
        style={{ touchAction: 'none' }} // Crucial for preventing scrolling while using stylus
        onPointerDown={handlePointerDown}
        onPointerMove={handlePointerMove}
        onPointerUp={handlePointerUp}
        onPointerLeave={handlePointerUp}
      >
         <div className="absolute inset-0 flex items-center justify-center opacity-10 pointer-events-none">
            <PenTool size={120} />
         </div>

         {/* The Target */}
         <div
            className={`rounded-full transition-all duration-200 flex items-center justify-center border-2 shadow-[0_0_30px_rgba(255,255,255,0.1)] ${isHit ? 'bg-green-500/20 border-green-400 scale-110' : 'bg-neutral-800 border-neutral-600'}`}
            style={{
               width: `${targetSize}px`,
               height: `${targetSize}px`,
               transform: `scale(${1 + (pressure * 0.5)})` // visual feedback for pressure
            }}
         >
            <div className={`w-2 h-2 rounded-full ${isHit ? 'bg-green-400' : 'bg-neutral-500'}`}></div>
         </div>

         {pointerType !== 'pen' && pointerType !== 'none' && (
            <div className="absolute bottom-4 left-0 w-full text-center text-xs text-[#690000] animate-pulse">
               Requires W3C Stylus Input for Precision Mode
            </div>
         )}
      </div>
    </div>
  );
};

const Visualiser = () => {
  const canvasRef = useRef(null);
  const pointerState = useRef({ x: 0, y: 0, isDown: false, pressure: 0, tiltX: 0, tiltY: 0, isPen: false });
  const [isRecording, setIsRecording] = useState(false);
  const [autoLoop, setAutoLoop] = useState(false);
  const mediaRecorderRef = useRef(null);
  const chunksRef = useRef([]);

  useEffect(() => {
    const canvas = canvasRef.current;
    const ctx = canvas.getContext('2d');
    let animationFrameId;
    let particles = [];
    let loopAngle = 0;

    // Resize handler
    const resize = () => {
      canvas.width = canvas.parentElement.clientWidth;
      canvas.height = canvas.parentElement.clientHeight;
    };
    window.addEventListener('resize', resize);
    resize();

    class HalideParticle {
      constructor(x, y, pressure, tiltX, tiltY) {
        this.x = x;
        this.y = y;
        // Density and size based on pressure
        this.size = Math.random() * 2 + (pressure * 6);

        // Dispersion based on tilt
        const dispersionX = tiltX !== 0 ? tiltX / 30 : (Math.random() * 2 - 1);
        const dispersionY = tiltY !== 0 ? tiltY / 30 : (Math.random() * 2 - 1);

        this.speedX = dispersionX + (Math.random() * 1 - 0.5);
        this.speedY = dispersionY + (Math.random() * 1 - 0.5);

        // Organic film grain / silver halide colors
        const luma = Math.random() * 40 + 60; // 60-100% lightness for bright silver
        this.colour = `hsla(0, 0%, ${luma}%, ${pressure * 0.8 + 0.2})`;

        this.life = 1.0;
        this.decay = 0.01 + Math.random() * 0.02; // Fade out
      }
      update() {
        this.x += this.speedX;
        this.y += this.speedY;
        this.life -= this.decay;
        this.size *= 0.95; // Shrink
      }
      draw() {
        ctx.fillStyle = this.colour;
        ctx.globalAlpha = this.life;
        ctx.beginPath();
        ctx.arc(this.x, this.y, this.size, 0, Math.PI * 2);
        ctx.fill();
        ctx.globalAlpha = 1.0;
      }
    }

    const renderLoop = () => {
      // Fluid, slow-fade chemical developer bath effect
      ctx.fillStyle = 'rgba(10, 10, 10, 0.15)';
      ctx.fillRect(0, 0, canvas.width, canvas.height);

      let pState = pointerState.current;

      if (pState.isDown) {
        // Active stylus input
        const pressure = pState.isPen ? pState.pressure : 0.5;
        const count = Math.floor(pressure * 10) + 2;
        for (let i = 0; i < count; i++) {
            const offsetX = pState.tiltX ? pState.tiltX / 2 : (Math.random() * 10 - 5);
            const offsetY = pState.tiltY ? pState.tiltY / 2 : (Math.random() * 10 - 5);

            particles.push(new HalideParticle(
                pState.x + offsetX,
                pState.y + offsetY,
                pressure,
                pState.tiltX,
                pState.tiltY
            ));
        }
      } else if (autoLoop) {
        // Autonomous generative loop
        loopAngle += 0.05;
        const centerX = canvas.width / 2;
        const centerY = canvas.height / 2;
        const radius = Math.min(canvas.width, canvas.height) * 0.3;

        // Complex lissajous figure for autonomous movement
        const genX = centerX + Math.sin(loopAngle) * radius + Math.cos(loopAngle * 2.1) * radius * 0.5;
        const genY = centerY + Math.cos(loopAngle * 1.3) * radius + Math.sin(loopAngle * 1.7) * radius * 0.5;

        const count = 5;
        for (let i = 0; i < count; i++) {
            particles.push(new HalideParticle(
                genX + (Math.random() * 20 - 10),
                genY + (Math.random() * 20 - 10),
                0.6 + Math.sin(loopAngle)*0.3, // pulsing pressure
                Math.sin(loopAngle) * 30, // simulated tilt
                Math.cos(loopAngle) * 30
            ));
        }
      }

      particles.forEach((p, index) => {
        p.update();
        p.draw();
        if (p.life <= 0 || p.size <= 0.1) {
          particles.splice(index, 1);
        }
      });

      animationFrameId = requestAnimationFrame(renderLoop);
    };

    renderLoop();

    return () => {
      window.removeEventListener('resize', resize);
      cancelAnimationFrame(animationFrameId);
    };
  }, [autoLoop]);

  const updatePointer = (e) => {
    if (!canvasRef.current) return;
    const rect = canvasRef.current.getBoundingClientRect();
    pointerState.current = {
      ...pointerState.current,
      x: e.clientX - rect.left,
      y: e.clientY - rect.top,
      pressure: e.pressure || 0.5,
      tiltX: e.tiltX || 0,
      tiltY: e.tiltY || 0,
      isPen: e.pointerType === 'pen'
    };
  };

  const handlePointerDown = (e) => {
    pointerState.current.isDown = true;
    updatePointer(e);
  };

  const handlePointerMove = (e) => {
    updatePointer(e);
  };

  const handlePointerUp = () => {
    pointerState.current.isDown = false;
  };

  const toggleRecording = () => {
    if (isRecording) {
      if (mediaRecorderRef.current && mediaRecorderRef.current.state !== 'inactive') {
        mediaRecorderRef.current.stop();
      }
      setIsRecording(false);
    } else {
      if (!canvasRef.current) return;

      const stream = canvasRef.current.captureStream(60); // 60fps
      let options = { mimeType: 'video/webm; codecs=vp9' };
      if (!MediaRecorder.isTypeSupported(options.mimeType)) {
        options = { mimeType: 'video/webm' };
      }

      try {
        const mediaRecorder = new MediaRecorder(stream, options);
        mediaRecorderRef.current = mediaRecorder;
        chunksRef.current = [];

        mediaRecorder.ondataavailable = (e) => {
          if (e.data.size > 0) {
            chunksRef.current.push(e.data);
          }
        };

        mediaRecorder.onstop = () => {
          const blob = new Blob(chunksRef.current, { type: 'video/webm' });
          const url = URL.createObjectURL(blob);
          const a = document.createElement('a');
          a.style.display = 'none';
          a.href = url;
          a.download = 'analogue_silver_halide.webm';
          document.body.appendChild(a);
          a.click();
          window.URL.revokeObjectURL(url);
        };

        mediaRecorder.start();
        setIsRecording(true);
      } catch (err) {
        console.error("Error starting MediaRecorder:", err);
      }
    }
  };

  return (
    <div className="h-full w-full bg-neutral-950 relative overflow-hidden flex flex-col">
       <div className="absolute top-4 left-4 z-10 pointer-events-none w-full pr-8 flex justify-between items-start">
          <div>
            <h2 className="text-xl font-bold text-white tracking-widest uppercase">Analogue Silver Halide Simulator</h2>
            <p className="text-xs text-neutral-500">W3C Pointer Events Stylus Support Enabled</p>
          </div>
       </div>

       {/* Controls Overlay */}
       <div className="absolute bottom-6 right-6 z-20 flex space-x-4">
          <button
            onClick={() => setAutoLoop(!autoLoop)}
            className={`p-3 rounded-full flex items-center justify-center transition-all ${autoLoop ? 'bg-[#690000] text-white shadow-[0_0_15px_#690000]' : 'bg-neutral-800 text-neutral-400 hover:bg-neutral-700'}`}
            title="Toggle Autonomous Generative Loop"
          >
            <Repeat size={20} />
          </button>
          <button
            onClick={toggleRecording}
            className={`p-3 rounded-full flex items-center justify-center transition-all ${isRecording ? 'bg-[#690000] text-white animate-pulse shadow-[0_0_15px_rgba(105,0,0,0.5)]' : 'bg-neutral-800 text-neutral-400 hover:bg-neutral-700'}`}
            title={isRecording ? "Stop Recording & Download" : "Start Recording"}
          >
            {isRecording ? <Download size={20} /> : <Video size={20} />}
          </button>
       </div>

       <div className="flex-1 w-full h-full" style={{ touchAction: 'none' }}>
           <canvas
              ref={canvasRef}
              className="w-full h-full cursor-crosshair block"
              onPointerDown={handlePointerDown}
              onPointerMove={handlePointerMove}
              onPointerUp={handlePointerUp}
              onPointerLeave={handlePointerUp}
           />
       </div>
    </div>
  );
};

const MOCK_TIMELAPSE = [
  { id: 1, title: 'Night City', type: 'landscape', img: 'https://images.unsplash.com/photo-1478760329108-5c3ed9d495a0?auto=format&fit=crop&w=800&q=80' },
  { id: 2, title: 'Star Trails', type: 'portrait', img: 'https://images.unsplash.com/photo-1534447677768-be436bb09401?auto=format&fit=crop&w=800&q=80' },
  { id: 3, title: 'Neon Pulse', type: 'square', img: 'https://images.unsplash.com/photo-1555448248-2571daf6344b?auto=format&fit=crop&w=800&q=80' },
  { id: 4, title: 'Dawn Chorus', type: 'landscape', img: 'https://images.unsplash.com/photo-1498804103079-a6351b050096?auto=format&fit=crop&w=800&q=80' },
  { id: 5, title: 'Aurora', type: 'portrait', img: 'https://images.unsplash.com/photo-1531366936337-77b12f71050c?auto=format&fit=crop&w=800&q=80' },
];

const TimeLapse = () => {
  return (
    <div className="h-full flex flex-col bg-neutral-950 overflow-y-auto p-4 @container">
      <div className="mb-8 mt-4 px-2">
         <h2 className="text-3xl font-black uppercase tracking-tight text-white mb-2">Cinematography</h2>
         <p className="text-neutral-400 text-sm">Time-lapse & Long Exposure Archives</p>
      </div>

      {/* Asymmetrical Masonry Bento Grid via Container Queries */}
      <div className="grid grid-cols-1 @md:grid-cols-2 @2xl:grid-cols-3 gap-4 pb-20">
         {MOCK_TIMELAPSE.map((item, index) => {
            // Determine span based on type and index to create asymmetrical look
            let spanClass = 'col-span-1 row-span-1 aspect-square';
            if (item.type === 'landscape') {
                spanClass = 'col-span-1 @md:col-span-2 row-span-1 aspect-video @md:aspect-[21/9]';
            } else if (item.type === 'portrait') {
                spanClass = 'col-span-1 row-span-2 aspect-[3/4] @md:aspect-auto';
            }

            return (
              <div
                key={item.id}
                className={`group relative overflow-hidden rounded-2xl bg-neutral-900 border border-neutral-800 ${spanClass}`}
              >
                 <img
                    src={item.img}
                    alt={item.title}
                    className="w-full h-full object-cover transition-transform duration-700 group-hover:scale-105"
                    loading="lazy"
                    onError={(e) => { e.target.src = 'data:image/svg+xml;utf8,<svg xmlns="http://www.w3.org/2000/svg" width="400" height="300"><defs><linearGradient id="g" x1="0%" y1="0%" x2="100%" y2="100%"><stop offset="0%" stop-color="%23171717" /><stop offset="100%" stop-color="%230a0a0a" /></linearGradient></defs><rect width="100%" height="100%" fill="url(%23g)"/></svg>'; }}
                 />
                 <div className="absolute inset-0 bg-gradient-to-t from-black/80 via-black/20 to-transparent opacity-60 group-hover:opacity-80 transition-opacity"></div>
                 <div className="absolute bottom-0 left-0 w-full p-4 transform translate-y-2 group-hover:translate-y-0 transition-transform">
                    <h3 className="text-white font-bold text-lg">{item.title}</h3>
                    <p className="text-neutral-300 text-xs uppercase tracking-widest mt-1">Archive {item.id}</p>
                 </div>
              </div>
            );
         })}
      </div>
    </div>
  );
};

// --- App Shell ---

const App = () => {
  const [currentView, setCurrentView] = useState(() => {
    // Try to restore from localStorage, fallback to hash, then default to 'cinema'
    const stored = localStorage.getItem('dcl-active-view');
    if (stored) return stored;

    const hash = window.location.hash.replace('#', '');
    if (['cinema', 'stylus', 'visualiser', 'timelapse'].includes(hash)) return hash;

    return 'cinema';
  });

  useEffect(() => {
    localStorage.setItem('dcl-active-view', currentView);
    window.location.hash = currentView;
  }, [currentView]);

  const navItems = [
    { id: 'cinema', label: 'Cinema', icon: Film },
    { id: 'stylus', label: 'Stylus Lab', icon: PenTool },
    { id: 'visualiser', label: 'Visualiser', icon: Activity },
    { id: 'timelapse', label: 'Time-Lapse', icon: Camera },
  ];

  const renderView = () => {
    switch (currentView) {
      case 'cinema':
        return <CinemaHub />;
      case 'stylus':
        return <StylusLab />;
      case 'visualiser':
        return <Visualiser />;
      case 'timelapse':
        return <TimeLapse />;
      default:
        return <CinemaHub />;
    }
  };

  return (
    <div className="flex flex-col h-full bg-neutral-950 text-white font-sans">
      {/* Header */}
      <header className="p-4 border-b border-neutral-800 bg-neutral-900/50 backdrop-blur-md sticky top-0 z-10 flex justify-center items-center">
        <h1 className="text-xl font-black tracking-widest uppercase text-transparent bg-clip-text bg-gradient-to-r from-neutral-200 to-neutral-500">
          Dark Cinema Lab
        </h1>
      </header>

      {/* Main Content Area */}
      <main className="flex-1 overflow-hidden relative">
        {renderView()}
      </main>

      {/* Bottom Navigation */}
      <nav className="border-t border-neutral-800 bg-neutral-900/90 backdrop-blur-md safe-area-pb">
        <ul className="flex justify-around p-2">
          {navItems.map((item) => {
            const Icon = item.icon;
            const isActive = currentView === item.id;
            return (
              <li key={item.id} className="flex-1">
                <button
                  onClick={() => setCurrentView(item.id)}
                  className={`w-full flex flex-col items-center justify-center p-2 rounded-xl transition-all duration-200 ${
                    isActive
                      ? 'text-white bg-neutral-800/50 scale-105'
                      : 'text-neutral-500 hover:text-neutral-300 hover:bg-neutral-800/30'
                  }`}
                >
                  <Icon size={24} strokeWidth={isActive ? 2.5 : 2} className="mb-1" />
                  <span className="text-[10px] font-medium tracking-wide">
                    {item.label}
                  </span>
                </button>
              </li>
            );
          })}
        </ul>
      </nav>
    </div>
  );
};

// Initialize App
import { createRoot } from 'react-dom/client';

const root = createRoot(document.getElementById('root'));
root.render(<App />);
