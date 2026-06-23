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

  function content(){ return el("wl-content"); }

  function worldIcon(){
    return '<svg viewBox="0 0 24 24" width="20" height="20" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round"><circle cx="12" cy="12" r="9"/><path d="M3 12h18"/><path d="M12 3c2.6 2.7 2.6 15.3 0 18M12 3c-2.6 2.7-2.6 15.3 0 18"/></svg>';
  }

  function head(title){
    return '<div class="wl-head">' +
      '<button class="wl-back" id="wl-back" type="button" aria-label="Back">' +
      '<svg viewBox="0 0 24 24" width="20" height="20" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round"><path d="M19 12H5M11 18l-6-6 6-6"/></svg>' +
      '</button><span class="wl-title">' + esc(title) + '</span></div>';
  }

  function loading(){ return '<div class="wl-muted">Loading\u2026</div>'; }
  function errorBox(msg){ return '<div class="wl-err">' + esc(msg) + '</div>'; }
  function cap(s){ s = String(s || ""); return s ? s.charAt(0).toUpperCase() + s.slice(1) : ""; }

  function wireBack(){
    var b = el("wl-back");
    if (b) b.addEventListener("click", function (){ activateScreen("screen-newgame"); });
  }

  function showMsg(msg){
    var m = el("wl-msg");
    if (m){ m.textContent = msg || ""; m.style.display = msg ? "block" : "none"; }
  }

  // Every "enter / join / view" route goes through the shared league lobby.
  function openLeague(id){
    window.cmCurrentWorldId = id;
    if (typeof window.cmOpenLeague === "function") window.cmOpenLeague(id);
    else if (typeof window.cmOpenCompetition === "function") window.cmOpenCompetition(id);
  }

  async function render(){
    content().innerHTML = head("Worlds") + loading();

    var mine = [], open = [];
    try {
      var a = await Api.myWorlds(); mine = (a && a.worlds) || [];
    } catch (e) {
      content().innerHTML = head("Worlds") + errorBox(e.message); wireBack(); return;
    }
    try {
      var b = await Api.listWorlds(); open = (b && b.worlds) || [];
    } catch (e) { open = []; }

    var html = head("Worlds");

    // --- Start your own Grand Line ---
    html += '<div class="wl-lbl">Grand Line</div>' +
      '<button class="wl-gold" id="wl-grand" type="button">Start a Grand Line league</button>' +
      '<div class="wl-soft" style="margin-top:8px">Start your own Grand Line, share the code, and friends sign on with you. AI crews fill the empty berths when recruiting closes.</div>';

    // --- Worlds you're already in ---
    if (mine.length){
      html += '<div class="wl-lbl">Your world' + (mine.length > 1 ? 's' : '') + '</div>';
      mine.forEach(function (w){
        var sub;
        if (w.status === "active") sub = 'Rank ' + w.rank + ' of ' + w.players + ' \u00b7 Day ' + w.currentDay + (w.totalDays ? (' of ' + w.totalDays) : '');
        else if (w.status === "finished") sub = 'Season finished';
        else sub = 'Recruiting \u00b7 ' + w.players + ' crew' + (w.players === 1 ? '' : 's');
        html += '<div class="wl-hero">' +
          '<div class="wl-hero-row"><div class="wl-globe">' + worldIcon() + '</div>' +
          '<div style="flex:1;min-width:0"><div class="wl-hero-name">' + esc(w.name) + '</div>' +
          '<div class="wl-sub">' + esc(sub) + '</div></div></div>' +
          '<button class="wl-gold" data-act="enter" data-id="' + esc(w.worldId) + '">Enter world</button>' +
          (w.status === "open" ? '<button class="wl-leave" data-act="leave" data-id="' + esc(w.worldId) + '">Leave world</button>' : '') +
          '</div>';
      });
    }

    // --- Join by code (Grand Line or an admin event world) ---
    html += '<div class="wl-lbl">Join by code</div>' +
      '<div class="wl-codewrap"><input id="wl-code" class="wl-code" type="text" placeholder="GRD-A12" maxlength="10" />' +
      '<button class="wl-join" id="wl-code-btn" type="button">Go</button></div>' +
      '<div id="wl-msg" class="wl-err" style="display:none"></div>';

    // --- Open worlds you can still join (admin events + others) ---
    var joinable = open.filter(function (w){
      return !mine.some(function (m){ return m.worldId === w.id; });
    });
    if (joinable.length){
      html += '<div class="wl-lbl">Open worlds</div>';
      joinable.forEach(function (w){
        html += '<div class="wl-row"><div class="wl-globe sm">' + worldIcon() + '</div>' +
          '<div style="flex:1;min-width:0"><div class="wl-name">' + esc(w.name) + '</div>' +
          '<div class="wl-sub">Open \u00b7 ' + w.players + '/' + w.maxPlayers + ' \u00b7 ' + esc(cap(w.difficulty)) + '</div></div>' +
          '<button class="wl-join" data-act="join" data-id="' + esc(w.id) + '">View</button></div>';
      });
    }

    content().innerHTML = html;
    wireBack();
    wireActions();
  }

  function wireActions(){
    var g = el("wl-grand");
    if (g) g.addEventListener("click", function (){ startGrandLine(g); });

    content().querySelectorAll('[data-act="enter"]').forEach(function (b){
      b.addEventListener("click", function (){ openLeague(b.getAttribute("data-id")); });
    });
    content().querySelectorAll('[data-act="join"]').forEach(function (b){
      b.addEventListener("click", function (){ openLeague(b.getAttribute("data-id")); });
    });
    content().querySelectorAll('[data-act="leave"]').forEach(function (b){
      b.addEventListener("click", function (){ leaveWorld(b.getAttribute("data-id")); });
    });
    var cb = el("wl-code-btn");
    if (cb) cb.addEventListener("click", joinByCode);
    var ci = el("wl-code");
    if (ci) ci.addEventListener("keydown", function (e){ if (e.key === "Enter") joinByCode(); });
  }

  async function startGrandLine(btn){
    if (btn){ btn.disabled = true; btn.textContent = "Charting a course\u2026"; }
    try {
      var r = await Api.createGrandLine();
      openLeague(r.id);
    } catch (e){
      showMsg(e.message);
      if (btn){ btn.disabled = false; btn.textContent = "Start a Grand Line league"; }
    }
  }

  async function leaveWorld(id){
    if (!confirm("Leave this world?")) return;
    try { await Api.leaveWorld(id); await render(); }
    catch (e){ alert(e.message); }
  }

  async function joinByCode(){
    showMsg("");
    var input = el("wl-code");
    var code = (input && input.value || "").trim();
    if (!code){ showMsg("Enter a join code."); return; }
    var btn = el("wl-code-btn");
    if (btn){ btn.disabled = true; btn.textContent = "\u2026"; }
    try {
      var r = await Api.findLeague(code);
      openLeague(r.id);
    } catch (e){
      showMsg(e.message);
      if (btn){ btn.disabled = false; btn.textContent = "Go"; }
    }
  }

  window.cmOpenWorlds = function (){
    activateScreen("screen-worlds");
    render();
  };

  function init(){
    var open = el("open-worlds-btn");
    if (open) open.addEventListener("click", function (){ window.cmOpenWorlds(); });

    // Deep-link: ?join=GRD-A12 opens the worlds hub and prefills the code box.
    try {
      var params = new URLSearchParams(location.search);
      var jc = params.get("join");
      if (jc){
        window.cmOpenWorlds();
        setTimeout(function (){ var ci = el("wl-code"); if (ci){ ci.value = jc.toUpperCase(); } }, 60);
      }
    } catch (e) {}
  }

  document.addEventListener("DOMContentLoaded", init);
})();