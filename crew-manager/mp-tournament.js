"use strict";

/* ====================================================================
   Crew Manager — mp-tournament.js
   Read-only Grand Tournament bracket. The server resolves the whole
   bracket at day 30 and stores it on World.bracket; this just renders it,
   reusing the single-player .tn-* styling. Renders into #cp-content.
   window.cmOpenTournament(worldId) — back returns to the league home.
   Depends on: Api, colorFor / initial / escapeHtml.
   ==================================================================== */

(function () {
  function el(id){ return document.getElementById(id); }
  function esc(s){ return (typeof escapeHtml === "function") ? escapeHtml(s) : String(s == null ? "" : s); }
  function content(){ return el("cp-content"); }
  function activateScreen(id){
    try { if (typeof showScreen === "function") showScreen(id); } catch (e) {}
    var t = el(id);
    if (t && !t.classList.contains("is-active")) {
      document.querySelectorAll(".screen").forEach(function (s){ s.classList.remove("is-active"); });
      t.classList.add("is-active");
    }
  }
  function avatar(name){
    var c = (typeof colorFor === "function") ? colorFor(name || "?") : "#8a5a2b";
    var i = (typeof initial === "function") ? initial(name || "?") : "?";
    return '<span class="mk-av" style="background:' + c + '">' + i + '</span>';
  }

  var ROUND_NAMES = ["Quarter-final", "Semi-final", "Final"];
  var V = { id: null, mine: null };

  function head(sub){
    return '<div class="wl-head">' +
      '<button class="wl-back" id="tn-back" type="button" aria-label="Back">' +
      '<svg viewBox="0 0 24 24" width="20" height="20" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round"><path d="M19 12H5M11 18l-6-6 6-6"/></svg>' +
      '</button><div><div class="cp-title">Laugh Tale \u2014 Grand Tournament</div>' +
      (sub ? '<div class="cp-subt">' + esc(sub) + '</div>' : '') + '</div></div>';
  }
  function wireBack(){
    var b = el("tn-back");
    if (b) b.addEventListener("click", function (){ if (typeof window.cmOpenLeague === "function") window.cmOpenLeague(V.id); });
  }

  window.cmOpenTournament = async function (worldId){
    V.id = worldId || V.id;
    activateScreen("screen-competition");
    content().innerHTML = head("Loading\u2026");

    var league = null;
    try { league = await Api.getLeague(V.id); }
    catch (e){ content().innerHTML = head("") + '<div class="wl-err">' + esc(e.message) + '</div>'; wireBack(); return; }

    try { var sq = await Api.getSquad(V.id); V.mine = sq ? sq.crewName : null; } catch (e){ V.mine = null; }

    var b = league.bracket;
    if (!b || !b.rounds || !b.rounds.length){
      content().innerHTML = head("") +
        '<div class="wl-soft" style="margin-top:14px">The Grand Tournament hasn\u2019t been played yet. It happens on the final day, when the top 8 crews fight for the treasure.</div>';
      wireBack();
      return;
    }
    render(b);
  };

  function rowHtml(name, isWinner, decided, you){
    var cls = "tn-row" + (decided && isWinner ? " tn-win" : "") +
              (decided && !isWinner ? " tn-lose" : "") + (you ? " tn-you" : "");
    var label = name ? esc(name) : "&mdash;";
    var av = name ? avatar(name) : "";
    var mark = decided ? (isWinner ? '<span class="tn-tick">&#10003;</span>' : '<span class="tn-cross">&#10007;</span>') : "";
    return '<div class="' + cls + '">' + av + '<span>' + label + '</span>' + mark + '</div>';
  }
  function matchHtml(m){
    var decided = !!m.w;
    var aWin = decided && m.w === m.a;
    var bWin = decided && m.w === m.b;
    var youA = V.mine && m.an === V.mine, youB = V.mine && m.bn === V.mine;
    var mine = youA || youB;
    return '<div class="tn-match' + (mine ? " tn-match-you" : "") + '">' +
      rowHtml(m.an, aWin, decided, youA) + rowHtml(m.bn, bWin, decided, youB) + '</div>';
  }

  function render(b){
    var cols = "";
    b.rounds.forEach(function (rd, r){
      var name = ROUND_NAMES[Math.min(r, 2)];
      cols += '<div class="tn-col"><div class="tn-col-h">' + name + '</div>' +
        rd.map(matchHtml).join("") + '</div>';
    });
    var champ = b.champion ? b.champion.name : null;
    if (champ){
      cols += '<div class="tn-col"><div class="tn-col-h">Champion</div>' +
        '<div class="tn-champ">' + avatar(champ) + esc(champ) + '</div></div>';
    }

    var iWon = V.mine && champ === V.mine;
    var banner = iWon
      ? '<div class="tn-banner tn-banner-win">Your crew are the Kings of the Pirates!</div>'
      : '<div class="tn-banner">' + (champ ? esc(champ) + ' won the Grand Tournament.' : 'The bracket is set.') + '</div>';

    content().innerHTML =
      head("Top 8 \u00b7 single elimination") +
      banner +
      '<div class="tn-bracket">' + cols + '</div>';
    wireBack();
  }
})();