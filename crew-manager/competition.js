"use strict";

(function () {
  function el(id){ return document.getElementById(id); }

  function esc(s){
    return String(s == null ? "" : s).replace(/[&<>"']/g, function (c){
      return ({ "&":"&amp;", "<":"&lt;", ">":"&gt;", '"':"&quot;", "'":"&#39;" })[c];
    });
  }

  function activateScreen(id){
    try { if (typeof showScreen === "function") showScreen(id); } catch (e) {}
    var t = el(id);
    if (t && !t.classList.contains("is-active")) {
      document.querySelectorAll(".screen").forEach(function (s){ s.classList.remove("is-active"); });
      t.classList.add("is-active");
    }
  }

  function content(){ return el("cp-content"); }
  function loading(){ return (window.cmLoader ? window.cmLoader() : '<div class="wl-muted">Loading\u2026</div>'); }  function errorBox(msg){ return '<div class="wl-err">' + esc(msg) + '</div>'; }

  function head(title, sub){
    return '<div class="wl-head">' +
      '<button class="wl-back" id="cp-back" type="button" aria-label="Back">' +
      '<svg viewBox="0 0 24 24" width="20" height="20" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round"><path d="M19 12H5M11 18l-6-6 6-6"/></svg>' +
      '</button><div><div class="cp-title">' + esc(title) + '</div>' +
      (sub ? '<div class="cp-subt">' + esc(sub) + '</div>' : '') + '</div></div>';
  }

  function wireBack(fn){
    var b = el("cp-back");
    if (b) b.addEventListener("click", fn || function (){
      if (typeof window.cmOpenWorlds === "function") window.cmOpenWorlds();
      else activateScreen("screen-worlds");
    });
  }

  async function render(worldId){
    content().innerHTML = head("Competition", "") + loading();

    var world = null, standings = [], fixtures = [];
    try {
      var w = await Api.getWorld(worldId); world = w && w.world;
    } catch (e){ content().innerHTML = head("Competition", "") + errorBox(e.message); wireBack(); return; }

    try { var s = await Api.worldStandings(worldId); standings = (s && s.standings) || []; } catch (e){ standings = []; }

    var nextDay = (world && world.status === "active") ? world.currentDay : 1;
    try { var f = await Api.worldFixtures(worldId, nextDay); fixtures = (f && f.fixtures) || []; } catch (e){ fixtures = []; }

    var sub = "";
    if (world){
      if (world.status === "active") sub = 'Season 1 \u00b7 Day ' + world.currentDay + (world.totalDays ? (' of ' + world.totalDays) : '');
      else if (world.status === "finished") sub = 'Season finished';
      else sub = 'Waiting to start';
    }

    var html = head(world ? world.name : "Competition", sub);

    html += '<div class="wl-lbl">Standings</div>';
    if (!standings.length){
      html += '<div class="wl-soft">No standings yet.</div>';
    } else {
      html += '<div class="cp-tbl">';
      html += '<div class="cp-tr cp-hd"><div class="cp-pos">#</div><div>Crew</div><div class="cp-c">P</div><div class="cp-c">Pts</div></div>';
      standings.forEach(function (m){
        var rec = (m.won || 0) + '-' + (m.drawn || 0) + '-' + (m.lost || 0);
        html += '<div class="cp-tr' + (m.isMe ? ' me' : '') + '">' +
          '<div class="cp-pos">' + m.rank + '</div>' +
          '<div style="min-width:0"><div class="cp-cr">' + esc(m.crewName) + (m.isMe ? ' \u2605' : '') + '</div>' +
          '<div class="cp-crp">' + esc(m.username) + ' \u00b7 ' + rec + '</div></div>' +
          '<div class="cp-c">' + (m.played || 0) + '</div>' +
          '<div class="cp-pt">' + (m.points || 0) + '</div></div>';
      });
      html += '</div>';
    }

    if (world && world.status === "active"){
      html += '<div class="wl-lbl">Matchday \u00b7 Day ' + nextDay + '</div>';
      if (!fixtures.length){
        html += '<div class="wl-soft">No fixtures scheduled for this day.</div>';
      } else {
        fixtures.forEach(function (fx){
          var mid = fx.played ? (fx.homeScore + ' \u2013 ' + fx.awayScore) : 'vs';
          html += '<div class="cp-fx"><span class="cp-side r">' + esc(fx.home) + '</span>' +
            '<span class="cp-vs">' + mid + '</span>' +
            '<span class="cp-side">' + esc(fx.away) + '</span></div>';
        });
      }
    } else if (world && world.status === "open"){
      html += '<div class="wl-soft">The competition hasn\'t started yet. Fixtures appear once an admin starts this world.</div>';
    }

    content().innerHTML = html;
    wireBack(function (){ if (typeof window.cmOpenLeague === "function") window.cmOpenLeague(worldId); });
  }

  window.cmOpenCompetition = function (worldId){
    worldId = worldId || window.cmCurrentWorldId;
    if (!worldId){ if (typeof window.cmOpenWorlds === "function") window.cmOpenWorlds(); return; }
    window.cmCurrentWorldId = worldId;
    activateScreen("screen-competition");
    render(worldId);
  };
})();