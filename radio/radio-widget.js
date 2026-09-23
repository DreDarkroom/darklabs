/*!
 * Darklabs Radio Widget
 * Drop this script into any web-capable game or page, then call:
 *   DarklabsRadio.mount(el, opts)
 *
 * opts (all optional):
 *   manifestUrl  - defaults to the hosted manifest.json next to this script
 *   autoplay     - true/false (default false; most browsers block audio
 *                  until a user gesture, so a Play button is shown either way)
 *   presenter    - true/false (default true) — speaks a short ident between
 *                  tracks using the browser's built-in SpeechSynthesis, no
 *                  audio files, no server, works offline once loaded
 *   compact      - true/false (default false) — smaller footprint for HUDs
 *
 * No dependencies. No build step. ~4KB.
 */
(function(global){
  const DEFAULT_MANIFEST = new URL('manifest.json', document.currentScript ? document.currentScript.src : location.href).href;

  function shuffle(arr){
    const a = arr.slice();
    for(let i=a.length-1;i>0;i--){
      const j = Math.floor(Math.random()*(i+1));
      [a[i],a[j]]=[a[j],a[i]];
    }
    return a;
  }

  function mount(el, opts){
    opts = opts || {};
    const manifestUrl = opts.manifestUrl || DEFAULT_MANIFEST;
    const presenter = opts.presenter !== false;
    const compact = !!opts.compact;

    el.innerHTML = '';
    el.style.fontFamily = "'Courier New', monospace";
    el.style.background = '#0a0a0a';
    el.style.color = '#e6e2df';
    el.style.border = '1px solid #2a2a2a';
    el.style.padding = compact ? '8px' : '14px';
    el.style.borderRadius = '2px';
    el.style.maxWidth = '360px';

    const title = document.createElement('div');
    title.textContent = 'Loading Darklabs Radio\u2026';
    title.style.fontSize = compact ? '11px' : '13px';
    el.appendChild(title);

    const artist = document.createElement('div');
    artist.style.fontSize = '11px';
    artist.style.color = '#8f8b87';
    el.appendChild(artist);

    const row = document.createElement('div');
    row.style.marginTop = '8px';
    row.style.display = 'flex';
    row.style.gap = '8px';
    const playBtn = mkBtn('Play');
    const skipBtn = mkBtn('Skip');
    row.appendChild(playBtn);
    row.appendChild(skipBtn);
    el.appendChild(row);

    function mkBtn(label){
      const b = document.createElement('button');
      b.textContent = label;
      b.style.fontFamily = 'inherit';
      b.style.background = 'transparent';
      b.style.color = '#e6e2df';
      b.style.border = '1px solid #7a1512';
      b.style.padding = '6px 10px';
      b.style.fontSize = '11px';
      b.style.cursor = 'pointer';
      b.style.borderRadius = '2px';
      return b;
    }

    const audio = new Audio();
    audio.preload = 'none';

    let tracks = [], order = [], idx = 0, playing = false;

    function speak(text, onend){
      if(!presenter || !('speechSynthesis' in window)){ if(onend) onend(); return; }
      try{
        const u = new SpeechSynthesisUtterance(text);
        u.rate = 1.0; u.pitch = 0.95;
        u.onend = onend || null;
        u.onerror = onend || null;
        speechSynthesis.speak(u);
      }catch(e){ if(onend) onend(); }
    }

    function current(){ return tracks[order[idx]]; }

    function load(autoplay){
      const t = current();
      title.textContent = t.title;
      artist.textContent = t.artist + ' \u00b7 CC0';
      audio.src = t.url;
      if(autoplay){
        speak('Coming up: ' + t.title + ', by ' + t.artist + '.', ()=> audio.play().catch(()=>{}));
      }
    }

    function next(autoplay){
      idx = (idx+1) % order.length;
      if(idx === 0) order = shuffle(tracks.map((_,i)=>i));
      load(autoplay);
    }

    let failCount = 0;
    audio.addEventListener('ended', ()=>{ failCount = 0; next(true); });
    audio.addEventListener('playing', ()=>{ failCount = 0; });
    audio.addEventListener('error', ()=>{
      failCount++;
      if(failCount >= tracks.length){
        title.textContent = 'No tracks could load';
        playing = false; playBtn.textContent = 'Play';
        return;
      }
      next(true);
    });

    playBtn.addEventListener('click', ()=>{
      if(!playing){
        playing = true; playBtn.textContent = 'Pause';
        if(!audio.src) load(true);
        else if(audio.paused) audio.play().catch(()=>{});
      }else{
        playing = false; playBtn.textContent = 'Play';
        audio.pause();
        speechSynthesis && speechSynthesis.cancel();
      }
    });
    skipBtn.addEventListener('click', ()=>{
      speechSynthesis && speechSynthesis.cancel();
      next(playing);
    });

    fetch(manifestUrl).then(r=>r.json()).then(data=>{
      tracks = data.tracks || [];
      if(!tracks.length){ title.textContent = 'No tracks available'; return; }
      order = shuffle(tracks.map((_,i)=>i));
      title.textContent = 'Darklabs Radio';
      artist.textContent = 'ready \u2014 press play';
    }).catch(err=>{
      title.textContent = 'Darklabs Radio unavailable';
      artist.textContent = String(err && err.message || err);
    });

    return {
      stop(){ audio.pause(); speechSynthesis && speechSynthesis.cancel(); },
      destroy(){ audio.pause(); speechSynthesis && speechSynthesis.cancel(); el.innerHTML=''; }
    };
  }

  global.DarklabsRadio = { mount };
})(window);
