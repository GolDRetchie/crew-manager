"use strict";

/* ====================================================================
   Crew Manager — mp-matchday.js
   Matchday page: a day carousel (arrows + scrollable day chips) and the
   fixtures for the selected day, with scores, win/loss colouring and your
   own crew highlighted. Renders into #cp-content; back -> league home.

   Data:
     Api.getWorld(id)            -> currentDay / totalDays / status
     Api.getSquad(id)            -> your crewName (to highlight your match)
     Api.worldFixtures(id, day)  -> the fixtures for a given day

   Opened via window.cmOpenMatchday(worldId, day?). Wired to the home's
   "Matchday" menu item and the "Watch matchday" button (see mp-online.js).
   ==================================================================== */

(function () {
  function el(id){ return document.getElementById(id); }
  function esc(s){ return (typeof escapeHtml === "function") ? escapeHtml(s) : String(s == null ? "" : s); }
  function colOf(n){ return (typeof colorFor === "function") ? colorFor(n || "?") : "#8a5a2b"; }
  function iniOf(n){ return (typeof initial === "function") ? initial(n || "?") : "?"; }
  function content(){ return el("cp-content"); }
  function loader(label){ return (window.cmLoader ? window.cmLoader(label) : '<div class="md-loading">Loading\u2026</div>'); }

  function activateScreen(id){
    try { if (typeof showScreen === "function") showScreen(id); } catch (e) {}
    var t = el(id);
    if (t && !t.classList.contains("is-active")) {
      document.querySelectorAll(".screen").forEach(function (s){ s.classList.remove("is-active"); });
      t.classList.add("is-active");
    }
  }

  var MD = { id: null, day: 1, total: 30, current: 1, status: "open", myCrew: null, cache: {} };

  function exit(){
    document.body.classList.remove("md-active");
    if (typeof window.cmOpenLeague === "function") window.cmOpenLeague(MD.id);
    else if (typeof window.cmOpenWorlds === "function") window.cmOpenWorlds();
  }

  function dayStatus(n){
    if (MD.status === "finished") return "done";
    if (MD.status !== "active")  return "soon";   // not started yet
    if (n < MD.current) return "done";
    if (n === MD.current) return "today";
    return "soon";
  }
  function statusLabel(s){ return s === "done" ? "Played" : (s === "today" ? "Today" : "Upcoming"); }

  function emblem(n){ return '<div class="md-emblem" style="background:' + colOf(n) + '">' + iniOf(n) + '</div>'; }
  function youTag(n){ return (MD.myCrew && n === MD.myCrew) ? '<span class="md-you">YOU</span>' : ''; }

  /* ---- entry point ---- */
  window.cmOpenMatchday = async function (worldId, day){
    worldId = worldId || MD.id;
    if (!worldId){ if (typeof window.cmOpenWorlds === "function") window.cmOpenWorlds(); return; }
    MD.id = worldId;
    window.cmCurrentWorldId = worldId;
    activateScreen("screen-competition");
    document.body.classList.add("md-active");
    content().innerHTML = '<div class="md-page">' + loader() + '</div>';

    // world meta (current day / season length / status)
    var world = null;
    try { var w = await Api.getWorld(worldId); world = (w && w.world) ? w.world : w; } catch (e){ world = null; }
    world = world || {};
    MD.total   = world.totalDays || 30;
    MD.status  = world.status || "open";
    MD.current = (MD.status === "active")   ? (world.currentDay || 1)
               : (MD.status === "finished") ? MD.total
               : 1;

    // my crew name (to highlight my match)
    try { var sq = await Api.getSquad(worldId); MD.myCrew = (sq && sq.crewName) ? sq.crewName : null; } catch (e){ MD.myCrew = null; }

    MD.cache = {};
    MD.day = day || MD.current || 1;
    if (MD.day < 1) MD.day = 1;
    if (MD.day > MD.total) MD.day = MD.total;

    renderShell();
    renderCarousel();
    loadDay(MD.day);
  };

  function renderShell(){
    content().innerHTML =
      '<div class="md-page">' +
        '<div class="md-head">' +
          '<button class="md-back" id="md-back" type="button" aria-label="Back">' +
            '<svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round"><path d="M19 12H5M11 18l-6-6 6-6"/></svg>' +
          '</button>' +
          '<div><div class="md-title">MATCHDAY</div><div class="md-sub" id="md-sub"></div></div>' +
        '</div>' +
        '<div class="md-car">' +
          '<button class="md-arrow" id="md-prev" type="button" aria-label="Earlier days">' +
            '<svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2.5" stroke-linecap="round" stroke-linejoin="round"><path d="M15 18l-6-6 6-6"/></svg>' +
          '</button>' +
          '<div class="md-strip" id="md-strip"></div>' +
          '<button class="md-arrow" id="md-next" type="button" aria-label="Later days">' +
            '<svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2.5" stroke-linecap="round" stroke-linejoin="round"><path d="M9 18l6-6-6-6"/></svg>' +
          '</button>' +
        '</div>' +
        '<div class="md-card">' +
          '<div class="md-card-h"><span class="h-t" id="md-day">Day ' + MD.day + '</span><span class="h-s" id="md-count"></span></div>' +
          '<div id="md-list">' + loader() + '</div>' +
        '</div>' +
        '<div class="md-foot">Fixtures fight daily at 19:00.</div>' +
      '</div>';

    el("md-back").addEventListener("click", exit);
    el("md-prev").addEventListener("click", function (){ if (MD.day > 1) select(MD.day - 1); });
    el("md-next").addEventListener("click", function (){ if (MD.day < MD.total) select(MD.day + 1); });
    updateSub();
  }

  function updateSub(){
    var sub = el("md-sub");
    if (sub){
      sub.textContent = (MD.status === "open")
        ? "Season hasn't started yet"
        : "Season 1 \u00b7 Day " + MD.day + " of " + MD.total + " \u00b7 " + statusLabel(dayStatus(MD.day));
    }
    var dd = el("md-day"); if (dd) dd.textContent = "Day " + MD.day;
  }

  function renderCarousel(){
    var strip = el("md-strip"); if (!strip) return;
    var h = "";
    for (var n = 1; n <= MD.total; n++){
      var st = dayStatus(n);
      h += '<button class="md-chip ' + st + (n === MD.day ? ' sel' : '') + '" data-d="' + n + '" type="button">' +
             '<span class="d-dot"></span>' +
             '<span class="d-n">DAY ' + n + '</span>' +
             '<span class="d-s">' + statusLabel(st) + '</span>' +
           '</button>';
    }
    strip.innerHTML = h;
    strip.querySelectorAll(".md-chip").forEach(function (c){
      c.addEventListener("click", function (){ select(+c.getAttribute("data-d")); });
    });
    var sel = strip.querySelector(".md-chip.sel");
    if (sel) sel.scrollIntoView({ inline: "center", block: "nearest" });
  }

  function select(n){
    MD.day = n;
    renderCarousel();
    updateSub();
    loadDay(n);
  }

  async function loadDay(day){
    var list = el("md-list"); if (!list) return;
    if (MD.cache[day]){ paint(day, MD.cache[day]); return; }
    list.innerHTML = loader();
    var fixtures = [];
    try { var f = await Api.worldFixtures(MD.id, day); fixtures = (f && f.fixtures) || []; }
    catch (e){
      if (MD.day === day && el("md-list")) el("md-list").innerHTML = '<div class="md-empty">' + esc(e.message) + '</div>';
      return;
    }
    MD.cache[day] = fixtures;
    if (MD.day === day) paint(day, fixtures);
  }

  function paint(day, fixtures){
    if (MD.day !== day) return;            // user moved on while loading
    var list = el("md-list"); if (!list) return;
    var cnt = el("md-count");

    if (!fixtures.length){
      if (cnt) cnt.textContent = "";
      list.innerHTML = '<div class="md-empty">No fixtures for this day.</div>';
      return;
    }
    if (cnt) cnt.textContent = fixtures.length + (fixtures.length === 1 ? " match" : " matches");

    var h = "";
    fixtures.forEach(function (f){
      var home = f.home, away = f.away, played = !!f.played;
      var hs = f.homeScore, as = f.awayScore;
      var me = (MD.myCrew && (home === MD.myCrew || away === MD.myCrew));
      var hCls = "", aCls = "";
      if (played){
        if (hs > as){ hCls = " win"; aCls = " loss"; }
        else if (hs < as){ hCls = " loss"; aCls = " win"; }
      }
      var mid = played
        ? '<span class="sc">' + hs + ' \u2013 ' + as + '</span><div class="ft">Full-time</div>'
        : '<span class="ko">19:00</span><div class="ft">Kick-off</div>';
      h += '<div class="md-fx' + (me ? ' me' : '') + '">' +
             '<div class="md-side home' + hCls + '"><span class="md-nm">' + youTag(home) + esc(home) + '</span>' + emblem(home) + '</div>' +
             '<div class="md-score">' + mid + '</div>' +
             '<div class="md-side away' + aCls + '">' + emblem(away) + '<span class="md-nm">' + esc(away) + youTag(away) + '</span></div>' +
           '</div>';
    });
    list.innerHTML = h;
  }
})();