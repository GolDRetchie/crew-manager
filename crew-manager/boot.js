"use strict";

/* ====================================================================
   boot.js — boot-splash + shared loading helpers
   - shows the One Piece Manager splash on open, then fades it out
   - window.cmLoader(label)  -> HTML string for an inline Log Pose loader
   - window.cmSaved(message) -> small bottom "Saved automatically" anchor toast
   Load this LAST in index.html (after the other scripts).
   ==================================================================== */

(function () {

  /* =========================================================
     PAS HIER DE LAADTEKSTEN AAN — voeg gerust eigen zinnen toe
     ========================================================= */
  var BOOT_MESSAGES = [
    "Hoisting the sails",
    "Charting the course",
    "Logging the magnetic field",
    "Counting the berries",
    "Waking the crew"
  ];
  /* ========================================================= */

  var MIN_MS  = 1400;   // splash blijft minstens zo lang in beeld
  var FADE_MS = 600;    // moet matchen met de transition in boot.css

  /* Log Pose: leren band + gouden frame + glazen bol + zoekende naald */
  var LP_SVG =
    '<svg class="lp" viewBox="0 0 120 120" xmlns="http://www.w3.org/2000/svg" aria-hidden="true">' +
      '<defs><radialGradient id="lpGlass" cx="40%" cy="34%" r="70%">' +
        '<stop offset="0%" stop-color="#eaf6fa"/><stop offset="55%" stop-color="#bfe0ec"/><stop offset="100%" stop-color="#7fa8b8"/>' +
      '</radialGradient></defs>' +
      '<rect x="6" y="84" width="108" height="22" rx="9" fill="#6b4a26" stroke="#3a2708" stroke-width="2"/>' +
      '<rect x="6" y="84" width="108" height="7" rx="6" fill="#8a5a2b"/>' +
      '<line x1="16" y1="95" x2="104" y2="95" stroke="#f1e2be" stroke-width="1.4" stroke-dasharray="2 5" opacity=".6"/>' +
      '<rect x="45" y="78" width="7" height="12" rx="2" fill="#9a6b1e"/>' +
      '<rect x="68" y="78" width="7" height="12" rx="2" fill="#9a6b1e"/>' +
      '<circle cx="60" cy="52" r="33" fill="none" stroke="#9a6b1e" stroke-width="6"/>' +
      '<circle cx="60" cy="52" r="33" fill="none" stroke="#f4cf6a" stroke-width="2"/>' +
      '<circle cx="60" cy="52" r="29" fill="url(#lpGlass)"/>' +
      '<g class="lp-needle">' +
        '<polygon points="60,30 54,52 66,52" fill="#a3331f"/>' +
        '<polygon points="60,74 54,52 66,52" fill="#f1e2be" stroke="#9a6b1e" stroke-width="1"/>' +
      '</g>' +
      '<circle cx="60" cy="52" r="4.5" fill="#9a6b1e"/>' +
      '<path d="M44 38 A20 20 0 0 1 70 33" fill="none" stroke="#ffffff" stroke-width="4" stroke-linecap="round" opacity=".5"/>' +
    '</svg>';

  var ANCHOR_SVG =
    '<svg class="cm-anchor" viewBox="0 0 24 30" xmlns="http://www.w3.org/2000/svg" aria-hidden="true">' +
      '<g class="cm-anchor-g" stroke="#9a6b1e" stroke-width="2.2" fill="none" stroke-linecap="round" stroke-linejoin="round">' +
        '<circle cx="12" cy="4" r="2.4"/>' +
        '<line x1="12" y1="6.4" x2="12" y2="25"/>' +
        '<line x1="7" y1="10" x2="17" y2="10"/>' +
        '<path d="M5 18 C5 25 9 27 12 27 C15 27 19 25 19 18"/>' +
      '</g>' +
    '</svg>';

  function esc(s){ return String(s == null ? "" : s).replace(/[&<>]/g, function (c){ return ({ "&":"&amp;", "<":"&lt;", ">":"&gt;" })[c]; }); }

  /* ---- inline loader (use anywhere instead of a kale "Loading…") ---- */
  window.cmLoader = function (label){
    return '<div class="cm-loader">' + LP_SVG.replace('class="lp"', 'class="lp lp-sm"') +
      '<span class="cm-loader-l">' + esc(label || "Loading\u2026") + '</span></div>';
  };

  /* ---- "Saved automatically" indicator with the swinging anchor ---- */
  var savedTimer = null;
  window.cmSaved = function (msg){
    var old = document.querySelector(".cm-saved");
    if (old && old.parentNode) old.parentNode.removeChild(old);
    if (savedTimer){ clearTimeout(savedTimer); savedTimer = null; }
    var d = document.createElement("div");
    d.className = "cm-saved";
    d.innerHTML = ANCHOR_SVG + '<span>' + esc(msg || "Saved automatically") + '</span>';
    document.body.appendChild(d);
    void d.offsetWidth;            // reflow zodat de transition pakt
    d.classList.add("in");
    savedTimer = setTimeout(function (){
      d.classList.remove("in");
      setTimeout(function (){ if (d.parentNode) d.parentNode.removeChild(d); }, 360);
    }, 2200);
  };

  /* ---- boot splash ---- */
  function initSplash(){
    var splash = document.getElementById("boot-splash");
    if (!splash) return;

    var mount = document.getElementById("boot-pose");
    if (mount && !mount.children.length) mount.innerHTML = LP_SVG;   // vul de Log Pose als de markup leeg is

    var msgEl = document.getElementById("boot-msg");
    var i = 0;
    function dots(){ return '<span class="d">.</span><span class="d d2">.</span><span class="d d3">.</span>'; }
    function paint(){ if (msgEl) msgEl.innerHTML = esc(BOOT_MESSAGES[i % BOOT_MESSAGES.length]) + dots(); }
    paint();
    var cyc = setInterval(function (){ i++; paint(); }, 1700);

    var start = Date.now(), gone = false;
    function hide(){
      if (gone) return; gone = true;
      clearInterval(cyc);
      splash.classList.add("boot-hide");
      setTimeout(function (){ if (splash.parentNode) splash.parentNode.removeChild(splash); }, FADE_MS + 60);
    }
    function scheduleHide(){ setTimeout(hide, Math.max(0, MIN_MS - (Date.now() - start))); }

    if (document.readyState === "complete") scheduleHide();
    else window.addEventListener("load", scheduleHide);
    setTimeout(hide, 6000);   // vangnet, mocht 'load' nooit komen
  }

  if (document.readyState === "loading") document.addEventListener("DOMContentLoaded", initSplash);
  else initSplash();

  /* ---- maak het anker de STANDAARD voor alle save-acties ----
     We wrappen de muterende Api-methodes; elke geslaagde call toont
     automatisch "Saved automatically". Werkt voor élke module die deze
     methodes aanroept (markt, crew/opstelling, training, sign-on, ...),
     ook modules die hier verder niet aangepast zijn. */
  (function wrapSaves(){
    if (typeof Api === "undefined") return;
    ["signOn", "buyListing", "sellMember", "saveLineup", "startTraining", "cancelTraining"].forEach(function (name){
      var orig = Api[name];
      if (typeof orig !== "function") return;
      Api[name] = function (){
        var p = orig.apply(Api, arguments);
        if (p && typeof p.then === "function"){
          return p.then(function (res){ if (window.cmSaved) window.cmSaved(); return res; });
        }
        return p;
      };
    });
  })();
})();