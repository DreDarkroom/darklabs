/* Plays a graffiti piece: fetches the piece's tag.css and tag.svg, drops the artwork into #stage, and runs the
   spray-paint build-up once. The base CSS is the FINISHED piece, so reduced motion simply never starts the animation.
   Usage: <section id="stage" data-gloss-ms="4300"></section> next to <button id="replay">, with the piece's
   tag.css / tag.svg in the same folder as the page. */
(function () {
  "use strict";
  var stage = document.getElementById("stage");
  if (!stage) return;
  var glossMs = parseInt(stage.getAttribute("data-gloss-ms"), 10) || 5000;
  var reduced = window.matchMedia && window.matchMedia("(prefers-reduced-motion: reduce)").matches;
  var svg = null, timer = 0;

  function loadCss(href) {
    return new Promise(function (resolve) {
      var l = document.createElement("link");
      l.rel = "stylesheet"; l.href = href;
      l.onload = l.onerror = function () { resolve(); };
      setTimeout(resolve, 2500);                       // never block the reveal on a slow stylesheet
      document.head.appendChild(l);
    });
  }

  function play() {
    clearTimeout(timer);
    stage.className = "wall";
    stage.innerHTML = "";
    if (!svg) return;
    void stage.offsetWidth;                            // restart the CSS animations from the first frame
    if (!reduced) stage.classList.add("is-spraying");  // class first, so the first paint is already the start pose
    stage.innerHTML = svg;                             // our own same-origin static asset
    timer = setTimeout(function () { stage.classList.add("is-finished"); }, reduced ? 0 : glossMs);
  }

  stage.className = "wall";
  stage.setAttribute("data-state", "loading");
  Promise.all([
    loadCss("tag.css"),
    fetch("tag.svg").then(function (r) { if (!r.ok) throw new Error("HTTP " + r.status); return r.text(); })
  ]).then(function (res) {
    svg = res[1];
    stage.removeAttribute("data-state");
    play();
  }).catch(function () {
    stage.setAttribute("data-state", "failed");
    stage.textContent = "Could not load the artwork.";
  });

  var btn = document.getElementById("replay");
  if (btn) btn.addEventListener("click", play);
})();
