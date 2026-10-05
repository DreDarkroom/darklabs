import io, sys, random
import os
HERE = os.path.dirname(os.path.abspath(__file__))
sys.path.insert(0, HERE)
from hub_data import HERO, MAIN, WIP, SOON

rnd = random.Random(1313)

MODEL = {"penrosepulse": "stairs", "chunguscello": "cello", "meowsynth": "cat", "monkeybeat": "monkey", "both": "keys", "drumdj": "deck",
         "circuitstomp": "robot", "glowgrain": "sun", "blueheronbass": "bass", "radio": "radio", "cratecall": "headphones", "sonicsmithy": "anvil",
         "dark-cinema-lab": "clapper", "promptlab": "flask", "resonance-core": "core", "resonic-toolkit": "gear", "brokebots": "robot",
         "darkography": "camera", "throattapper": "mic", "pipeline-test": "pipe", "contact-sheet": "film", "safelight": "vinyl", "obscura": "eye",
         "earshot": "spiral", "crate-capture": "crate", "darklabsfm": "radio", "idea": "robot", "vrlab": "eye", "wordlab": "core", "wordlab-more": "core", "wipelight": "core", "mobile-wip": "gear", "perf-lab": "core", "ask-dre": "mic", "lobby": "crate", "penrose-visuals": "spiral", "fm-replies": "radio", "shared-kit": "gear", "darklabs-caps": "core"}

def hang(c, kind="print"):
    d = round(rnd.uniform(5.5, 9.5), 2); s = round(-rnd.uniform(0, 6), 2); dl = round(rnd.uniform(0.1, 1.4), 2)
    cls = "print"
    if c.get("big"): cls += " print--big"
    if c.get("dim"): cls += " print--dim"
    if c.get("badge") == "NEW": cls += " print--new"
    if c.get("kind"): cls += " print--" + c["kind"]
    badge = f'<span class="badge">{c["badge"]}</span>' if c.get("badge") else ""
    sub = f'<span class="sub">{c["sub"]}</span>' if c.get("sub") else ""
    note = f'<p class="note">{c["note"]}</p>' if c.get("note") else ""
    apk = ""
    if c.get("apk"):
        apk = ('<div class="apk"><div class="apk-badge">&#x1F4F1; Mobile App Available</div><div class="apk-box"><p><strong>Testing APK for Android:</strong></p><ol>'
               '<li>Download the .apk file from the <a href="https://github.com/DreDarkroom/darklabs/releases">releases</a></li>'
               '<li>Enable "Install from Unknown Sources" in your Android settings</li><li>Tap the downloaded file to install</li><li>Open MeowSynth app and enjoy</li></ol></div></div>')
    ext = ' rel="noopener"' if c.get("href", "").startswith("http") else ""
    btn = "" if c.get("teaser") else f'<a class="btn" href="{c.get("href", "")}"{ext}>{c["btn"]}</a>'
    teaser = ' aria-disabled="true"' if c.get("teaser") else ""
    return (f'<div class="hang" style="--d:{d}s;--s:{s}s;--dl:{dl}s">'
            f'<article class="{cls}" id="{c["id"]}"{teaser}>{badge}<div class="icon" aria-hidden="true" data-model="{MODEL.get(c["id"], "vinyl")}"><span class="emoji">{c["icon"]}</span></div>'
            f'<h3>{c["title"]}{sub}</h3><p>{c["desc"]}</p>{note}{btn}{apk}</article></div>')

hero = (f'<section class="hero" aria-labelledby="hero-title"><div class="hero-print" id="{HERO["id"]}">'
        f'<span class="badge badge--hero">{HERO["badge"]}</span>'
        '<div class="kaleido" aria-hidden="true"><i></i><i></i><i></i><b></b></div>'
        f'<div class="hero-text"><p class="eyebrow">{HERO["note"]}</p><h2 id="hero-title">{HERO["title"]}</h2><p class="hero-desc">{HERO["desc"]}</p>'
        f'<a class="btn btn--hero" href="{HERO["href"]}" rel="noopener">{HERO["btn"]}</a></div></div></section>')

main = '<div class="line">' + "".join(hang(c) for c in MAIN) + "</div>"
wip = '<div class="trays">' + "".join(hang(c) for c in WIP) + "</div>"
soon = '<div class="sheet">' + "".join(hang(c) for c in SOON) + "</div>"

letters = "".join(f'<span class="L{i}">{ch}</span>' for i, ch in enumerate("DARKLABS"))

CSS = r'''
*{margin:0;padding:0;box-sizing:border-box}
:root{--red:#d1122b;--red-soft:#e8434f;--deep:#4a050f;--ink:#040203;--text:#eadede;--dim:#b09c9c;--mx:50vw;--my:30vh;--beam:330px}
html{background:var(--ink);scroll-behavior:smooth}
body{position:relative;min-height:100vh;color:var(--text);font:16px/1.6 system-ui,-apple-system,"Segoe UI",Roboto,Helvetica,Arial,sans-serif;overflow-x:hidden;
  background:radial-gradient(ellipse at 50% -12%,#220609 0,#0a0405 52%,#030203 100%)}
a{color:var(--red-soft)}
.skip{position:absolute;left:-999px;top:0;background:#000;color:#fff;padding:.6rem 1rem;z-index:99}.skip:focus{left:8px;top:8px}
/* ── the room (fixed, behind everything) ─────────────────────────────── */
#bg{position:fixed;inset:0;z-index:0;pointer-events:none;overflow:hidden}
#bg .layer{position:absolute;inset:-4%;will-change:transform}
.wall{background:repeating-linear-gradient(0deg,rgba(255,255,255,.018) 0 1px,transparent 1px 74px),repeating-linear-gradient(90deg,rgba(255,255,255,.012) 0 1px,transparent 1px 74px)}
.shelf{background:
  linear-gradient(180deg,transparent 0,transparent 8%,rgba(60,22,24,.0) 8%),
  radial-gradient(ellipse 60px 120px at 9% 14%,rgba(110,18,28,.28),transparent 70%),
  radial-gradient(ellipse 40px 100px at 14% 15%,rgba(90,14,24,.22),transparent 70%),
  radial-gradient(ellipse 48px 130px at 88% 22%,rgba(110,18,28,.24),transparent 70%)}
.pipes{background:
  linear-gradient(90deg,transparent 0 6%,rgba(40,16,18,.55) 6% 6.8%,transparent 6.8% 93%,rgba(40,16,18,.55) 93% 93.8%,transparent 93.8%),
  linear-gradient(180deg,transparent 0 70%,rgba(0,0,0,.5) 100%)}
.strips{background:
  repeating-linear-gradient(90deg,transparent 0 160px,rgba(80,20,28,.26) 160px 162px,transparent 162px 330px)}
#vignette{position:fixed;inset:0;z-index:2;pointer-events:none;background:radial-gradient(ellipse at 50% 40%,transparent 38%,rgba(0,0,0,.82) 100%)}
#dust{position:fixed;inset:0;z-index:3;pointer-events:none}
/* ── the safelight beam: darkness with a hole in it that follows you ──── */
#dark{position:fixed;inset:0;z-index:50;pointer-events:none;background:radial-gradient(circle var(--beam) at var(--mx) var(--my),rgba(2,0,0,0) 0%,rgba(2,0,0,.04) 34%,rgba(2,0,0,.66) 100%)}
#glow{position:fixed;inset:0;z-index:51;pointer-events:none;mix-blend-mode:screen;background:radial-gradient(circle calc(var(--beam)*.85) at var(--mx) var(--my),rgba(209,18,43,.34),rgba(209,18,43,.1) 46%,transparent 74%)}
/* ── lamps ─────────────────────────────────────────────────────────────── */
.lamp{position:fixed;top:-6px;z-index:60;width:54px;height:92px;border:0;background:none;cursor:pointer;padding:0}
.lamp-l{left:3vw}.lamp-r{right:3vw}
.lamp::before{content:"";position:absolute;left:50%;top:0;width:2px;height:34px;margin-left:-1px;background:#2a1a1a}
.lamp i{position:absolute;left:50%;top:30px;width:26px;height:34px;margin-left:-13px;border-radius:50% 50% 46% 46%;background:radial-gradient(circle at 50% 40%,#ff9aa5,#d1122b 55%,#5a0610);
  box-shadow:0 0 28px 10px rgba(209,18,43,.7),0 0 120px 56px rgba(209,18,43,.28);animation:flick 5.5s infinite}
.lamp:focus-visible{outline:2px solid #fff;outline-offset:6px;border-radius:8px}
.lamp-r i{animation-delay:-2.3s}
@keyframes flick{0%,100%{opacity:1}7%{opacity:.86}9%{opacity:1}41%{opacity:.93}43%{opacity:.78}45%{opacity:1}78%{opacity:.9}}
/* ── page ──────────────────────────────────────────────────────────────── */
.wrap{position:relative;z-index:10;max-width:1120px;margin:0 auto;padding:1.2rem 1.1rem 3rem}
.topbar a{font-size:.9rem;font-weight:600;text-decoration:none}.topbar a:hover{text-decoration:underline}
header{text-align:center;margin:2.6rem 0 2.2rem}
.sign{font-weight:800;letter-spacing:.34em;text-indent:.34em;font-size:clamp(2rem,7.4vw,4.2rem);color:#ffd8dc;text-shadow:0 0 12px rgba(209,18,43,.95),0 0 34px rgba(209,18,43,.7),0 0 80px rgba(209,18,43,.45)}
.sign .L3{animation:neon 6s infinite}.sign .L6{animation:neon 9s infinite 1.4s}
@keyframes neon{0%,100%{opacity:1}4%{opacity:.25}6%{opacity:1}8%{opacity:.4}10%{opacity:1}}
.tagline{margin-top:.6rem;color:var(--dim);letter-spacing:.32em;font-size:.82rem;text-transform:uppercase}
.worklight{position:fixed;right:12px;bottom:12px;z-index:70;font:inherit;font-size:.78rem;color:#cdb8b8;background:rgba(10,4,5,.85);border:1px solid rgba(209,18,43,.5);border-radius:999px;padding:.45rem .9rem;cursor:pointer}
.worklight:hover,.worklight:focus-visible{color:#fff;border-color:#fff;outline:none}
h2.sect{margin:3.2rem 0 .3rem;text-align:center;font-size:1.5rem;letter-spacing:.2em;text-transform:uppercase;color:var(--red-soft);text-shadow:0 0 16px rgba(209,18,43,.6)}
p.sect-sub{text-align:center;color:var(--dim);font-size:.82rem;letter-spacing:.14em;text-transform:uppercase;margin-bottom:1.6rem}
/* ── the hero ──────────────────────────────────────────────────────────── */
.hero-print{position:relative;display:grid;grid-template-columns:minmax(200px,340px) 1fr;gap:2rem;align-items:center;padding:2.2rem;border:1px solid rgba(209,18,43,.6);border-radius:4px;
  background:radial-gradient(ellipse at 15% 20%,rgba(209,18,43,.18),transparent 55%),linear-gradient(180deg,#1e0a0e,#0d0507);box-shadow:0 0 0 6px rgba(255,255,255,.012) inset,0 20px 60px rgba(0,0,0,.8),0 0 60px rgba(209,18,43,.22)}
.kaleido{position:relative;aspect-ratio:1;border-radius:50%;overflow:hidden;box-shadow:0 0 50px rgba(209,18,43,.5),inset 0 0 40px #000}
.kaleido i,.kaleido b{position:absolute;inset:0}
.kaleido i:nth-child(1){background:conic-gradient(from 0deg,#d1122b,#2a0710,#ff6a3d,#1b0610,#d1122b,#7a0b2a,#d1122b);animation:spin 16s linear infinite}
.kaleido i:nth-child(2){background:conic-gradient(from 40deg,transparent,rgba(255,200,200,.35),transparent 20%,rgba(255,120,120,.25) 40%,transparent 60%,rgba(255,220,200,.3) 80%,transparent);mix-blend-mode:screen;animation:spin 9s linear infinite reverse}
.kaleido i:nth-child(3){background:repeating-conic-gradient(from 0deg,rgba(0,0,0,.55) 0 15deg,transparent 15deg 30deg);animation:spin 40s linear infinite}
.kaleido b{background:radial-gradient(circle,transparent 30%,rgba(0,0,0,.65) 100%);animation:breathe 5s ease-in-out infinite}
@keyframes spin{to{transform:rotate(360deg)}}@keyframes breathe{50%{transform:scale(1.08);opacity:.7}}
.eyebrow{font-size:.78rem;letter-spacing:.3em;text-transform:uppercase;color:var(--red-soft);margin-bottom:.5rem}
.hero-text h2{font-size:clamp(2rem,5vw,3.2rem);line-height:1.05;color:#fff;text-shadow:0 0 24px rgba(209,18,43,.7);margin-bottom:.8rem}
.hero-desc{font-size:1.08rem;color:#d9c8c8;margin-bottom:1.4rem;max-width:44ch}
.badge{position:absolute;top:.8rem;right:.8rem;font-size:.62rem;font-weight:800;letter-spacing:.14em;padding:.22rem .55rem;border-radius:3px;background:var(--red);color:#fff}
.badge--hero{background:#fff;color:#4a050f}
.btn{display:inline-block;align-self:flex-start;margin-top:auto;font-weight:700;text-decoration:none;color:#fff;background:linear-gradient(180deg,#e0243a,#a50d20);padding:.7rem 1.3rem;border-radius:3px;border:1px solid #ff6a78;box-shadow:0 0 18px rgba(209,18,43,.45);transition:transform .2s,box-shadow .2s,filter .2s}
.btn:hover,.btn:focus-visible{transform:translateY(-2px);filter:brightness(1.15);box-shadow:0 0 30px rgba(209,18,43,.8);outline:none}
.btn--hero{padding:.9rem 1.8rem;font-size:1.05rem}
/* ── prints on the line ────────────────────────────────────────────────── */
.line,.trays,.sheet{position:relative;display:grid;grid-template-columns:repeat(auto-fit,minmax(290px,1fr));gap:2.4rem 1.6rem;align-items:stretch}
.line{padding-top:2.4rem}
.line::before{content:"";position:absolute;top:12px;left:-3vw;right:-3vw;height:3px;background:linear-gradient(90deg,#241616,#6a4a4a,#241616);box-shadow:0 5px 8px rgba(0,0,0,.8);border-radius:3px}
.hang{position:relative;display:flex;flex-direction:column;transform-origin:50% 0;opacity:0;animation:develop 1.2s ease var(--dl,0s) forwards,sway var(--d,7s) ease-in-out var(--s,0s) infinite alternate}
.hang:hover{animation-play-state:running,paused;z-index:5}
.line .hang::before{content:"";position:absolute;top:-16px;left:50%;width:16px;height:34px;margin-left:-8px;border-radius:3px;background:linear-gradient(#8a6a44,#4d3823);box-shadow:0 3px 6px #000;z-index:4}
@keyframes sway{from{transform:rotate(-.8deg)}to{transform:rotate(.8deg)}}
@keyframes develop{0%{opacity:0;filter:brightness(.15) contrast(2.2) sepia(1) hue-rotate(-30deg)}60%{opacity:1;filter:brightness(.7) sepia(.7)}100%{opacity:1;filter:none}}
.print{position:relative;display:flex;flex-direction:column;flex:1;padding:1.7rem 1.5rem 1.5rem;border:1px solid rgba(209,18,43,.38);border-radius:3px;
  background:linear-gradient(180deg,#1b0c0f,#0e0709);box-shadow:0 16px 34px rgba(0,0,0,.75),inset 0 0 0 6px rgba(255,255,255,.014);
  transform:perspective(900px) rotateX(var(--rx,0deg)) rotateY(var(--ry,0deg)) translateZ(var(--z,0px));transition:transform .16s ease,box-shadow .25s,border-color .25s}
.print:hover{--z:34px;border-color:var(--red-soft);box-shadow:0 26px 50px rgba(0,0,0,.85),0 0 34px rgba(209,18,43,.38),inset 0 0 0 6px rgba(255,255,255,.02)}
.print .icon{display:flex;align-items:center;justify-content:center;width:112px;height:112px;margin:-.5rem 0 .1rem -.6rem;font-size:2.6rem;filter:drop-shadow(0 0 10px rgba(209,18,43,.6))}
html.gl3d-on .print .icon .emoji{visibility:hidden}
#gl3d{position:fixed;inset:0;width:100%;height:100%;z-index:12;pointer-events:none}
.print h3{font-size:1.35rem;color:#fff;letter-spacing:.04em;margin-bottom:.5rem;text-shadow:0 0 14px rgba(209,18,43,.55)}
.print h3 .sub{display:block;font-size:.7rem;letter-spacing:.36em;text-transform:uppercase;color:var(--red-soft);font-weight:500;margin-top:.3rem}
.print p{color:#d3c3c3;font-size:.94rem;margin-bottom:1.1rem}
.print .note{color:#9c8a8a;font-size:.8rem;margin-top:-.4rem}
.print--new{border-color:var(--red-soft);box-shadow:0 16px 34px rgba(0,0,0,.75),0 0 28px rgba(209,18,43,.28)}
.print--big{grid-column:1/-1}
.print--dim{opacity:.55}.print--dim:hover{opacity:.95}
.print--safelight{border-color:#8a5a1e;background:radial-gradient(ellipse at 85% 0%,rgba(242,165,65,.16),transparent 60%),#15110e}
.print--safelight h3{color:#f2a541;text-shadow:0 0 14px rgba(242,165,65,.5)}.print--safelight .btn{background:#f2a541;border-color:#f2a541;color:#0e0b0a;box-shadow:0 0 18px rgba(242,165,65,.4)}
.print--obscura{border-color:#d1122b;background:radial-gradient(circle at 50% 0,rgba(255,255,255,.12),transparent 30%),#120607}
.apk{margin-top:1.1rem;padding-top:1.1rem;border-top:1px solid #3a2a2a}
.apk-badge{display:inline-block;background:var(--red);color:#fff;padding:.2rem .6rem;border-radius:3px;font-size:.7rem;font-weight:700;margin-bottom:.6rem}
.apk-box{background:#0b0607;border:1px solid #3a2a2a;border-radius:4px;padding:.8rem;font-size:.82rem;color:#b9a8a8}.apk-box ol{margin:.4rem 0 0 1.2rem}
/* ── developer trays (WIP) ─────────────────────────────────────────────── */
.trays .hang{opacity:0}
.trays .print{border-style:dashed;border-color:rgba(209,18,43,.5);background:linear-gradient(180deg,#140a0c 0,#0c0607 70%,#2a070e 100%);overflow:hidden}
.trays .print::after{content:"";position:absolute;left:-10%;right:-10%;bottom:-6px;height:34px;pointer-events:none;
  background:radial-gradient(ellipse 60px 12px at 20px 0,rgba(209,18,43,.38),transparent 70%) 0 0/120px 24px repeat-x,linear-gradient(180deg,rgba(209,18,43,.22),rgba(80,6,16,.5));animation:liquid 7s linear infinite}
@keyframes liquid{to{background-position:120px 0,0 0}}
.trays .print--big{border-style:solid}
.trays .print--big h3{font-size:1.8rem}
/* ── contact sheet (coming soon) ───────────────────────────────────────── */
.sheet .print{padding:1.7rem 2.3rem;background:#0a0708;border:1px solid #2b1c1e}
.sheet .print::before,.sheet .print::after{content:"";position:absolute;top:0;bottom:0;width:15px;background:repeating-linear-gradient(180deg,transparent 0 8px,#000 8px 20px,transparent 20px 28px);opacity:.9;border-right:1px solid #1b1213}
.sheet .print::before{left:0}.sheet .print::after{right:0;border-right:0;border-left:1px solid #1b1213}
.sheet .print[aria-disabled=true]{opacity:.28;pointer-events:none}
.roadnote{max-width:46rem;margin:-.6rem auto 1.8rem;text-align:center;color:#c9b8b8;font-size:.95rem}
footer{position:relative;z-index:10;text-align:center;color:#7a6a6a;font-size:.85rem;padding:2.4rem 1rem 4rem;border-top:1px solid #231516;margin-top:3rem}
footer a{color:var(--red-soft);text-decoration:none}
/* ── work light: a plain, readable room ───────────────────────────────── */
html.work #dark,html.work #glow,html.work #vignette,html.work #dust,html.work .moth{display:none}
html.work body{background:#17100f}html.work .lamp i{animation:none;box-shadow:0 0 20px 6px rgba(255,255,255,.6);background:#fff}
@media (max-width:760px){.hero-print{grid-template-columns:1fr;padding:1.4rem}.kaleido{max-width:260px;margin:0 auto}.lamp{display:none}header{margin-top:1.8rem}}
@media (prefers-reduced-motion:reduce){*,*::before,*::after{animation:none!important;transition:none!important}.hang{opacity:1}#dust,.moth{display:none}}
'''

JS = r'''
(function(){
"use strict";
var root=document.documentElement, reduce=matchMedia("(prefers-reduced-motion: reduce)").matches;
try{ if(localStorage.getItem("darklabs.work")==="1") root.classList.add("work"); }catch(e){}
var st={mx:innerWidth*.5,my:innerHeight*.35,tx:innerWidth*.5,ty:innerHeight*.35,idle:0,t:0};

/* ── where does the light go? ──────────────────────────────────────────────
   `cur` is where the light is now, `target` is where your cursor is, `dt` is the seconds
   since the last frame (about 0.016). Return where the light should be next. */
function chase(cur,target,dt){
  // TODO(human): make the light feel like a heavy lantern you swing around, not a cursor.
  // Right now it snaps straight to the target, which works but feels stiff.
  return target;
}

addEventListener("pointermove",function(e){st.tx=e.clientX;st.ty=e.clientY;st.idle=0;},{passive:true});
addEventListener("touchmove",function(e){var t=e.touches[0];if(t){st.tx=t.clientX;st.ty=t.clientY;st.idle=0;}},{passive:true});
addEventListener("touchstart",function(e){var t=e.touches[0];if(t){st.tx=t.clientX;st.ty=t.clientY;st.idle=0;}},{passive:true});

/* work light toggle: a button, and the lamps */
function setWork(on){root.classList.toggle("work",on);try{localStorage.setItem("darklabs.work",on?"1":"0");}catch(e){}
  var b=document.getElementById("worklight");if(b){b.textContent=on?"Back to the safelight":"Switch on the work light";b.setAttribute("aria-pressed",String(on));}}
document.getElementById("worklight").addEventListener("click",function(){setWork(!root.classList.contains("work"));});
document.querySelectorAll(".lamp").forEach(function(l){l.addEventListener("click",function(){setWork(!root.classList.contains("work"));});});
setWork(root.classList.contains("work"));

/* per-print tilt: the print leans toward your pointer */
document.querySelectorAll(".print").forEach(function(p){
  p.addEventListener("pointermove",function(e){var r=p.getBoundingClientRect(),x=(e.clientX-r.left)/r.width-.5,y=(e.clientY-r.top)/r.height-.5;
    p.style.setProperty("--ry",(x*9).toFixed(2)+"deg");p.style.setProperty("--rx",(-y*7).toFixed(2)+"deg");});
  p.addEventListener("pointerleave",function(){p.style.setProperty("--ry","0deg");p.style.setProperty("--rx","0deg");});
});

/* background parallax layers */
var layers=[].slice.call(document.querySelectorAll("#bg .layer"));

/* dust drifting in the beam */
var cv=document.getElementById("dust"),cx=cv.getContext("2d"),dust=[],W=0,H=0,dpr=Math.min(devicePixelRatio||1,1.5);
function size(){W=innerWidth;H=innerHeight;cv.width=W*dpr;cv.height=H*dpr;cx.setTransform(dpr,0,0,dpr,0,0);}
size();addEventListener("resize",size);
for(var i=0;i<(reduce?0:70);i++)dust.push({x:Math.random()*W,y:Math.random()*H,vx:(Math.random()-.5)*8,vy:-3-Math.random()*9,r:.5+Math.random()*1.6,p:Math.random()*6});

var last=performance.now(),slow=0;
function frame(now){
  var dt=Math.min(.05,(now-last)/1000);last=now;st.t+=dt;st.idle+=dt;
  if(dt>.034)slow++;else slow=Math.max(0,slow-1);
  var tx=st.tx,ty=st.ty;
  if(st.idle>4.5&&!reduce){tx=innerWidth*(.5+.3*Math.sin(st.t*.33));ty=innerHeight*(.42+.26*Math.sin(st.t*.27+1));}   // nobody is moving the light: let it wander
  st.mx=chase(st.mx,tx,dt);st.my=chase(st.my,ty,dt);
  root.style.setProperty("--mx",st.mx.toFixed(1)+"px");root.style.setProperty("--my",st.my.toFixed(1)+"px");
  var nx=st.mx/innerWidth-.5,ny=st.my/innerHeight-.5,sy=scrollY;
  for(var i=0;i<layers.length;i++){var d=+layers[i].dataset.depth;layers[i].style.transform="translate3d("+(-nx*d*90).toFixed(1)+"px,"+(-ny*d*60-sy*d*.25).toFixed(1)+"px,0)";}
  if(!reduce&&slow<12&&!root.classList.contains("work")){
    cx.clearRect(0,0,W,H);cx.globalCompositeOperation="lighter";
    for(var j=0;j<dust.length;j++){var q=dust[j];q.x+=q.vx*dt+Math.sin(st.t*.6+q.p)*.15;q.y+=q.vy*dt;
      if(q.y<-10){q.y=H+10;q.x=Math.random()*W;}if(q.x<-10)q.x=W+10;if(q.x>W+10)q.x=-10;
      var dx=q.x-st.mx,dy=q.y-st.my,a=Math.max(0,1-Math.sqrt(dx*dx+dy*dy)/330);
      if(a>0.02){cx.fillStyle="rgba(255,120,130,"+(a*.55).toFixed(3)+")";cx.beginPath();cx.arc(q.x,q.y,q.r,0,6.283);cx.fill();}}
  }
  requestAnimationFrame(frame);
}
requestAnimationFrame(frame);
console.log("%cDARKLABS","color:#d1122b;font:700 22px monospace;text-shadow:0 0 8px #d1122b","\nthe light is on. look closer.");
})();
'''

HTML = f'''<!doctype html>
<html lang="en">
<head>
<meta charset="UTF-8">
<meta name="viewport" content="width=device-width, initial-scale=1, viewport-fit=cover">
<meta name="color-scheme" content="dark">
<meta name="darkreader-lock">
<title>Darkroom Labs</title>
<meta name="description" content="Dre Darklabs: experimental browser instruments and games, developed in the dark.">
<link rel="icon" href="data:image/svg+xml,<svg xmlns=%22http://www.w3.org/2000/svg%22 viewBox=%220 0 100 100%22><rect width=%22100%22 height=%22100%22 rx=%2214%22 fill=%22%23060607%22/><text x=%2250%22 y=%2268%22 font-size=%2258%22 font-family=%22monospace%22 font-weight=%22700%22 text-anchor=%22middle%22 fill=%22%23d1122b%22>DD</text></svg>">
<style>{CSS}</style>
<link rel="stylesheet" href="robots.css">
</head>
<body>
<a class="skip" href="#main">Skip to the projects</a>
<div id="bg" aria-hidden="true"><div class="layer wall" data-depth=".02"></div><div class="layer shelf" data-depth=".05"></div><div class="layer pipes" data-depth=".09"></div><div class="layer strips" data-depth=".14"></div></div>
<div id="vignette" aria-hidden="true"></div>
<canvas id="dust" aria-hidden="true"></canvas>
<canvas id="gl3d" aria-hidden="true"></canvas>
<div id="dark" aria-hidden="true"></div>
<div id="glow" aria-hidden="true"></div>
<button class="lamp lamp-l" type="button" aria-label="Safelight: toggle the work light"><i></i></button>
<button class="lamp lamp-r" type="button" aria-label="Safelight: toggle the work light"><i></i></button>
<button class="worklight" id="worklight" type="button" aria-pressed="false">Switch on the work light</button>

<div class="wrap">
<div class="topbar"><a href="/">&larr; Home</a></div>
<header>
<h1 class="sign" aria-label="Darklabs">{letters}</h1>
<p class="tagline">Experimental instruments &middot; developed in the dark</p>
</header>
<main id="main">
{hero}
<h2 class="sect">On the line</h2>
<p class="sect-sub">Fresh prints &mdash; ready to play</p>
{main}
<h2 class="sect">In the trays</h2>
<p class="sect-sub">Work in progress &mdash; still developing, rough edges expected</p>
{wip}
<h2 class="sect">Roadmap To The Future</h2>
<p class="sect-sub">What's playable now, and what's waiting its turn</p>
<p class="roadnote">The first few are playable or in preview. The rest are projects on the <strong>back burner for now</strong>: some half-built, some just ideas in a drawer, all of them waiting while the instruments above get finished. Nothing here is abandoned. It's simmering.</p>
{soon}
</main>
</div>
<footer><p>Part of <a href="https://github.com/DreDarkroom/darklabs">Dre Darkroom</a> &middot; psst: the lamps are buttons.</p></footer>
<script>{JS}</script>
<script type="module" src="hub3d.js"></script>
<script type="module" src="robots.js"></script>
<script type="module" src="kit/ctx.js"></script>
</body>
</html>
'''
io.open(os.path.join(HERE, "..", "..", "index.html"), "w", encoding="utf-8", newline="\n").write(HTML)
print("hub built", len(HTML), "bytes;", len(MAIN), "main,", len(WIP), "wip,", len(SOON), "soon")

# ---- DarkDesk's built-in project list: the same public facts as the cards, as data ----
import html as _html, json as _json, re as _re
def _plain(s): return _html.unescape(_re.sub(r"<[^>]+>", "", s or "")).strip()
_STATUS = {"NEW": "Live", "LIVE": "Live", "FEATURED": "Live", "PREVIEW": "Testing", "WORK IN PROGRESS": "Building", "BACK BURNER": "Paused"}
_seeds = []
for _group, _items in (("featured", [HERO]), ("on the line", MAIN), ("in the trays", WIP), ("roadmap", SOON)):
    for _c in _items:
        _seeds.append(dict(id=_c["id"], title=_plain(_c["title"]), blurb=_plain(_c.get("desc")), url=_c.get("href", ""), status=_STATUS.get(_c.get("badge", ""), "Live" if _group != "roadmap" else "Paused"), group=_group))
_out = os.path.join(HERE, "..", "..", "desk", "projects.js")
os.makedirs(os.path.dirname(_out), exist_ok=True)
io.open(_out, "w", encoding="utf-8", newline="\n").write("/* Generated by tools/hub/build_hub.py from the home page's cards: the public facts only. Edit hub_data.py, not this file. */\nexport const SEEDS = " + _json.dumps(_seeds, indent=1, ensure_ascii=False) + ";\n")
print("desk projects:", len(_seeds))
