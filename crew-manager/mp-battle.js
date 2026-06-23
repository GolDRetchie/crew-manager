"use strict";

/* ====================================================================
   Crew Manager — mp-battle.js
   Replays a finished online matchday on the cinematic battle screen.
   Reuses game-battle.js wholesale: buildBattleScript builds the beats,
   and the global playback engine (timer, Big News Morgan, the special-
   attack takeover) plays them. We only feed it the two crews + result
   from the server, render the frame, and route "Continue" back to the
   league. Single-player is untouched.
   window.cmPlayMatchday(worldId, day?) — back returns to the league home.
   Reuses globals from game-battle.js / game-core.js:
     buildBattleScript, spByName, startBattleTimer, battleSkip,
     ensureMorganStyle, the global `battle` object, els, $,
     colorFor, initial, escapeHtml, showScreen.
   ==================================================================== */

(function () {
  function el(id){ return document.getElementById(id); }
  function esc(s){ return (typeof escapeHtml === "function") ? escapeHtml(s) : String(s == null ? "" : s); }
  function col(n){ return (typeof colorFor === "function") ? colorFor(n || "?") : "#8a5a2b"; }
  function ini(n){ return (typeof initial === "function") ? initial(n || "?") : "?"; }
  function content(){ return el("cp-content"); }

  function activateCompetition(){
    try { if (typeof showScreen === "function") showScreen("screen-competition"); } catch (e) {}
  }
  function toast(msg){
    var d = document.createElement("div");
    d.className = "ol-toast"; d.textContent = msg;
    document.body.appendChild(d);
    setTimeout(function (){ d.classList.add("out"); }, 1300);
    setTimeout(function (){ if (d.parentNode) d.remove(); }, 1700);
  }

  function fightersFrom(side){
    var cs = side.captainStats || { p: 8, d: 8, s: 8 };
    var sp = (typeof spByName === "function") ? spByName : function (){ return []; };
    var list = [{ name: side.captain, sp: sp(side.captain), s: cs.s, sum: (cs.p || 0) + (cs.d || 0) + (cs.s || 0) }];
    (side.deck || []).forEach(function (m){
      list.push({ name: m.name, sp: sp(m.name), s: m.s, sum: (m.p || 0) + (m.d || 0) + (m.s || 0) });
    });
    return list;
  }

  window.cmPlayMatchday = async function (worldId, day){
    var info;
    try { info = await Api.getMatch(worldId, day); }
    catch (e){ toast(e.message); return; }
    if (!info || info.none){ toast("No matchday to watch yet \u2014 sail on first."); return; }
    if (typeof buildBattleScript !== "function"){ toast("Battle module not loaded."); return; }

    var ctx = {
      you: fightersFrom(info.you),
      opp: fightersFrom(info.opp),
      isNavy: false,
      island: null,
      youName: info.youName,
      oppName: info.oppName,
      res: info.res,
    };

    battle.save = { crew: info.youName };          // only .crew is read during playback
    battle.res = info.res;
    battle.report = null;
    battle.onContinue = function (){ if (typeof window.cmOpenLeague === "function") window.cmOpenLeague(worldId); };
    battle.beats = buildBattleScript(ctx);
    battle.idx = 0; battle.clock = 0;
    battle.lastMin = battle.beats[battle.beats.length - 1].minute || 90;
    battle.baseTick = Math.max(45, Math.min(420, Math.round(26000 / battle.lastMin)));
    battle.speed = 1;

    renderFrame(info.youName, info.oppName, col(info.oppName));
    if (typeof showScreen === "function") showScreen("screen-battle");
    if (typeof startBattleTimer === "function") startBattleTimer();
  };

  /* same frame as single-player renderBattleFrame, but with explicit names
     (no save.league dependency). Reuses the global button behaviours. */
  function renderFrame(youName, oppName, oppColor){
    els.battle.innerHTML =
      '<div class="bt-top">' +
        '<div class="bt-team"><span class="bt-av" style="background:' + col(youName) + '">' + ini(youName) + '</span>' +
          '<span class="bt-nm">' + esc(youName) + '</span></div>' +
        '<div class="bt-live"><span class="bt-live-dot"></span>Replay</div>' +
        '<div class="bt-team bt-team-r"><span class="bt-nm">' + esc(oppName) + '</span>' +
          '<span class="bt-av" style="background:' + oppColor + '">' + ini(oppName) + '</span></div>' +
      '</div>' +
      '<div class="bt-stage">' +
        '<div class="bt-morgan"><div class="bt-morgan-av" id="morgan-av">M</div>' +
          '<div class="bt-morgan-nm">Big News Morgan</div></div>' +
        '<div class="bt-line" id="bt-line">&hellip;</div>' +
      '</div>' +
      '<div class="bt-feed" id="bt-feed"></div>' +
      '<div class="bt-result" id="bt-result" style="display:none"></div>' +
      '<div class="bt-action">' +
        '<button class="btn-ghost" id="bt-speed" type="button">x2</button>' +
        '<button class="btn-ghost" id="bt-skip" type="button">Skip &raquo;</button>' +
        '<button class="btn-gold bt-cont" id="bt-cont" type="button" style="display:none">Continue &#9654;</button>' +
      '</div>';
    els.battle.style.position = "relative";
    if (typeof ensureMorganStyle === "function") ensureMorganStyle();
    battle._fxEl = null; battle._fxTimers = [];
    battle._morganEl = null; battle._morganTimer = null;

    el("bt-speed").addEventListener("click", function (){
      battle.speed = battle.speed === 1 ? 2 : 1;
      el("bt-speed").textContent = battle.speed === 1 ? "x2" : "x1";
      el("bt-speed").classList.toggle("on", battle.speed === 2);
      if (battle.timer && typeof startBattleTimer === "function") startBattleTimer();
    });
    el("bt-skip").addEventListener("click", function (){ if (typeof battleSkip === "function") battleSkip(); });
    el("bt-cont").addEventListener("click", function (){
      if (battle.onContinue){ var cb = battle.onContinue; battle.onContinue = null; cb(); }
    });
  }
})();