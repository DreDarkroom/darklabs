import React, { useState, useEffect, useRef } from 'react';
import { Film, PenTool, Activity, Camera, Play, Pause, SkipForward, SkipBack, Maximize, Volume2 } from 'lucide-react';

// --- Views ---

const MOCK_VIDEOS = [
  {
    id: 'jNQXAC9IVRw', // Valid YouTube ID (Me at the zoo - first youtube video)
    title: 'Dre Darkroom: The Process',
    duration: '00:19',
    thumbnail: 'https://images.unsplash.com/photo-1534447677768-be436bb09401?auto=format&fit=crop&w=400&q=80'
  },
  {
    id: 'dQw4w9WgXcQ',
    title: 'Cinematography in the Dark',
    duration: '03:32',
    thumbnail: 'https://images.unsplash.com/photo-1531366936337-77b12f71050c?auto=format&fit=crop&w=400&q=80'
  },
  {
    id: 'tgbNymZ7vqY',
    title: 'Analog Soundscapes',
    duration: '05:42',
    thumbnail: 'https://images.unsplash.com/photo-1555448248-2571daf6344b?auto=format&fit=crop&w=400&q=80'
  }
];

const CinemaHub = () => {
  const [activeVideo, setActiveVideo] = useState(MOCK_VIDEOS[0]);
  const [isPlaying, setIsPlaying] = useState(false);

  return (
    <div className="h-full flex flex-col bg-neutral-950">
      {/* Cinematic Player Area */}
      <div className="w-full bg-black aspect-video relative shadow-2xl shadow-black group">
        <iframe
          className="w-full h-full absolute top-0 left-0"
          src={`https://www.youtube-nocookie.com/embed/${activeVideo.id}?autoplay=0&modestbranding=1&rel=0&controls=0`}
          title={activeVideo.title}
          frameBorder="0"
          allow="accelerometer; autoplay; clipboard-write; encrypted-media; gyroscope; picture-in-picture"
          allowFullScreen
        ></iframe>

        {/* Mock Custom Controls Overlay */}
        <div className="absolute bottom-0 left-0 w-full bg-gradient-to-t from-black/90 to-transparent p-4 opacity-0 group-hover:opacity-100 transition-opacity flex flex-col justify-end pointer-events-none">
           {/* Timeline */}
           <div className="w-full h-1 bg-neutral-700 rounded-full mb-3 overflow-hidden pointer-events-auto cursor-pointer">
              <div className="w-1/3 h-full bg-red-600"></div>
           </div>

           <div className="flex justify-between items-center pointer-events-auto">
              <div className="flex items-center space-x-4">
                 <button className="text-white hover:text-neutral-300 transition" onClick={() => setIsPlaying(!isPlaying)}>
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
          {MOCK_VIDEOS.map((video) => (
            <div
              key={video.id}
              onClick={() => setActiveVideo(video)}
              className={`group flex items-center bg-neutral-900 rounded-xl overflow-hidden cursor-pointer border transition-colors ${activeVideo.id === video.id ? 'border-neutral-500' : 'border-neutral-800 hover:border-neutral-600'}`}
            >
              <div className="w-1/3 aspect-video relative bg-neutral-800">
                 <img src={video.thumbnail} alt={video.title} className="w-full h-full object-cover opacity-80 group-hover:opacity-100 transition-opacity" />
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
            <div className="absolute bottom-4 left-0 w-full text-center text-xs text-red-400 animate-pulse">
               Requires W3C Stylus Input for Precision Mode
            </div>
         )}
      </div>
    </div>
  );
};

const Visualizer = () => {
  const canvasRef = useRef(null);
  const pointerState = useRef({ x: 0, y: 0, isDown: false, pressure: 0, tiltX: 0, tiltY: 0 });

  useEffect(() => {
    const canvas = canvasRef.current;
    const ctx = canvas.getContext('2d');
    let animationFrameId;
    let particles = [];

    // Resize handler
    const resize = () => {
      canvas.width = canvas.parentElement.clientWidth;
      canvas.height = canvas.parentElement.clientHeight;
    };
    window.addEventListener('resize', resize);
    resize();

    class Particle {
      constructor(x, y, pressure) {
        this.x = x;
        this.y = y;
        this.size = Math.random() * 5 + (pressure * 10);
        this.speedX = Math.random() * 3 - 1.5;
        this.speedY = Math.random() * 3 - 1.5;
        this.color = `hsl(${Math.random() * 60 + 200}, 100%, 50%)`; // Blue/Cyan range
        this.life = 1.0; // Fade out
      }
      update() {
        this.x += this.speedX;
        this.y += this.speedY;
        if (this.size > 0.2) this.size -= 0.1;
        this.life -= 0.02;
      }
      draw() {
        ctx.fillStyle = this.color;
        ctx.globalAlpha = this.life;
        ctx.beginPath();
        ctx.arc(this.x, this.y, this.size, 0, Math.PI * 2);
        ctx.fill();
        ctx.globalAlpha = 1.0;
      }
    }

    const renderLoop = () => {
      // Fade trail effect
      ctx.fillStyle = 'rgba(10, 10, 10, 0.2)'; // match bg-neutral-950 roughly
      ctx.fillRect(0, 0, canvas.width, canvas.height);

      if (pointerState.current.isDown) {
        // Generate particles based on pressure and tilt
        const count = Math.floor(pointerState.current.pressure * 5) + 1;
        for (let i = 0; i < count; i++) {
            // Apply slight offset based on tilt if available
            const offsetX = pointerState.current.tiltX ? pointerState.current.tiltX / 2 : 0;
            const offsetY = pointerState.current.tiltY ? pointerState.current.tiltY / 2 : 0;

            particles.push(new Particle(
                pointerState.current.x + offsetX,
                pointerState.current.y + offsetY,
                pointerState.current.pressure
            ));
        }
      }

      particles.forEach((p, index) => {
        p.update();
        p.draw();
        if (p.life <= 0 || p.size <= 0.2) {
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
  }, []);

  const updatePointer = (e) => {
    if (!canvasRef.current) return;
    const rect = canvasRef.current.getBoundingClientRect();
    pointerState.current = {
      ...pointerState.current,
      x: e.clientX - rect.left,
      y: e.clientY - rect.top,
      pressure: e.pressure || 0.5,
      tiltX: e.tiltX || 0,
      tiltY: e.tiltY || 0
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

  return (
    <div className="h-full w-full bg-neutral-950 relative overflow-hidden flex flex-col">
       <div className="absolute top-4 left-4 z-10 pointer-events-none">
          <h2 className="text-xl font-bold text-white tracking-widest uppercase">Generative Engine</h2>
          <p className="text-xs text-neutral-500">Touch or use stylus to interact</p>
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
  { id: 1, title: 'Night City', type: 'landscape', img: 'https://images.unsplash.com/photo-1517594422361-5e18aece0158?auto=format&fit=crop&w=800&q=80' },
  { id: 2, title: 'Star Trails', type: 'portrait', img: 'https://images.unsplash.com/photo-1534447677768-be436bb09401?auto=format&fit=crop&w=800&q=80' },
  { id: 3, title: 'Neon Pulse', type: 'square', img: 'https://images.unsplash.com/photo-1555448248-2571daf6344b?auto=format&fit=crop&w=800&q=80' },
  { id: 4, title: 'Dawn Chorus', type: 'landscape', img: 'https://images.unsplash.com/photo-1478760329108-5c3ed9d495a0?auto=format&fit=crop&w=800&q=80' },
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
  const [currentView, setCurrentView] = useState('cinema');

  const navItems = [
    { id: 'cinema', label: 'Cinema', icon: Film },
    { id: 'stylus', label: 'Stylus Lab', icon: PenTool },
    { id: 'visualizer', label: 'Visualizer', icon: Activity },
    { id: 'timelapse', label: 'Time-Lapse', icon: Camera },
  ];

  const renderView = () => {
    switch (currentView) {
      case 'cinema':
        return <CinemaHub />;
      case 'stylus':
        return <StylusLab />;
      case 'visualizer':
        return <Visualizer />;
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
