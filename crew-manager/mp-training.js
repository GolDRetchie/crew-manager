"use strict";

/* ====================================================================
   Crew Manager — mp-training.js
   Online training grounds. Reuses the single-player training look
   (.tcol / .ts / .av-chip) but is fed from the server and shows a live
   6-hour countdown per slot. Renders into #cp-content.
   window.cmOpenTraining(worldId) — back returns to the league home.
   Depends on: Api, colorFor / initial / escapeHtml / fmtShort.
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
  function toast(msg){
    var d = document.createElement("div");
    d.className = "ol-toast"; d.textContent = msg;
    document.body.appendChild(d);
    setTimeout(function (){ d.classList.add("out"); }, 1300);
    setTimeout(function (){ if (d.parentNode) d.remove(); }, 1700);
  }

  var STATS = ["p", "d", "s"];
  var LABEL = { p: "Power", d: "Defense", s: "Speed" };
  var SLOTS_PER_STAT = 2;

  var T = { id: null, data: null, pending: null, timer: null };

  function stop(){ if (T.timer){ clearInterval(T.timer); T.timer = null; } }

  window.cmOpenTraining = function (worldId){
    T.id = worldId || T.id;
    T.pending = null;
    activateScreen("screen-competition");
    content().innerHTML = head("Loading\u2026");
    load();
  };

  function head(sub){
    return '<div class="wl-head">' +
      '<button class="wl-back" id="tr-back" type="button" aria-label="Back">' +
      '<svg viewBox="0 0 24 24" width="20" height="20" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round"><path d="M19 12H5M11 18l-6-6 6-6"/></svg>' +
      '</button><div><div class="cp-title">Training grounds</div>' +
      (sub ? '<div class="cp-subt">' + esc(sub) + '</div>' : '') + '</div></div>';
  }
  function wireBack(){
    var b = el("tr-back");
    if (b) b.addEventListener("click", function (){ stop(); if (typeof window.cmOpenLeague === "function") window.cmOpenLeague(T.id); });
  }

  async function load(){
    try { T.data = await Api.trainingStatus(T.id); }
    catch (e){ content().innerHTML = head("") + '<div class="wl-err">' + esc(e.message) + '</div>'; wireBack(); return; }
    render();
  }

  /* active trainings grouped by stat -> [{name, endsAt}] */
  function bucket(){
    var b = { p: [], d: [], s: [] };
    (T.data.active || []).forEach(function (a){ if (b[a.stat]) b[a.stat].push(a); });
    return b;
  }
  function trainingNames(){
    var s = {}; (T.data.active || []).forEach(function (a){ s[a.name] = true; }); return s;
  }
  function available(){
    var busy = trainingNames();
    var list = [{ n: T.data.captain, st: T.data.captainStats, cap: true }];
    (T.data.roster || []).forEach(function (m){ list.push({ n: m.name, st: m, cap: false }); });
    return list.filter(function (x){ return !busy[x.n]; });
  }

  function fmtLeft(ms){
    if (ms <= 0) return "done";
    var s = Math.floor(ms / 1000);
    var h = Math.floor(s / 3600), m = Math.floor((s % 3600) / 60);
    if (h > 0) return h + "h " + (m < 10 ? "0" : "") + m + "m";
    var x = s % 60;
    return m + "m " + (x < 10 ? "0" : "") + x + "s";
  }

  function slotHtml(stat, i, occ){
    var p = T.pending;
    var pendSlot = p && p.kind === "slot" && p.stat === stat && p.i === i;
    var wantSlot = p && p.kind === "trainee";
    if (occ){
      var left = new Date(occ.endsAt).getTime() - Date.now();
      return '<div class="ts filled" data-rm="' + esc(occ.name) + '">' +
        '<span class="ts-dot" style="background:' + (typeof colorFor === "function" ? colorFor(occ.name) : "#8a5a2b") + '"></span>' +
        '<span class="ts-nm">' + esc(occ.name) + '</span>' +
        '<span class="ts-cd" data-ends="' + esc(occ.endsAt) + '">' + fmtLeft(left) + '</span>' +
        '<span class="ts-x">&times;</span>' +
        '</div>';
    }
    return '<div class="ts empty' + (pendSlot ? " pend" : "") + (wantSlot ? " ready" : "") +
      '" data-slot="' + stat + ':' + i + '">' +
      (pendSlot ? "pick a crewmate &darr;" : wantSlot ? "place here &uarr;" : "+ add") + '</div>';
  }

  function render(){
    var d = T.data, b = bucket();
    var cols = STATS.map(function (stat){
      var slots = "";
      for (var i = 0; i < SLOTS_PER_STAT; i++) slots += slotHtml(stat, i, b[stat][i] || null);
      return '<div class="tcol"><div class="tcol-h tcol-' + stat + '">' + LABEL[stat] + '</div>' + slots + '</div>';
    }).join("");

    var avail = available();
    var chips = avail.length === 0
      ? '<div class="tg-empty">Everyone is already training.</div>'
      : avail.map(function (x){
          var isPend = T.pending && T.pending.kind === "trainee" && T.pending.name === x.n;
          return '<button class="av-chip' + (isPend ? " pend" : "") + '" data-train="' + esc(x.n) + '">' +
            '<span class="av-dot" style="background:' + (typeof colorFor === "function" ? colorFor(x.n) : "#8a5a2b") + '"></span>' +
            '<span class="av-nm">' + esc(x.n) + (x.cap ? " (Cpt)" : "") + '</span>' +
            '<span class="av-by">' + x.st.p + "-" + x.st.d + "-" + x.st.s + '</span>' +
            '</button>';
        }).join("");

    content().innerHTML =
      head((d.active ? d.active.length : 0) + "/" + (d.slotsTotal || 6) + " slots in training") +
      '<p class="tg-intro">Tap a field slot then a crewmate \u2014 or a crewmate then a slot. Each session takes <b>6 hours</b> and adds +' +
        (d.gain || 3) + ' to that stat. Up to 2 per stat, 6 in total. Training runs even while you\u2019re away.</p>' +
      '<div class="tcols">' + cols + '</div>' +
      '<div class="tg-avail-t">Available crew</div>' +
      '<div class="tg-avail">' + chips + '</div>';

    wireBack();
    content().querySelectorAll("[data-slot]").forEach(function (e){
      e.addEventListener("click", function (){
        var pr = e.getAttribute("data-slot").split(":"); var stat = pr[0], i = +pr[1];
        if (T.pending && T.pending.kind === "trainee") startOne(T.pending.name, stat);
        else { T.pending = { kind: "slot", stat: stat, i: i }; render(); }
      });
    });
    content().querySelectorAll("[data-train]").forEach(function (e){
      e.addEventListener("click", function (){
        var name = e.getAttribute("data-train");
        if (T.pending && T.pending.kind === "slot") startOne(name, T.pending.stat);
        else { T.pending = { kind: "trainee", name: name }; render(); }
      });
    });
    content().querySelectorAll("[data-rm]").forEach(function (e){
      e.addEventListener("click", function (){ cancelOne(e.getAttribute("data-rm")); });
    });

    startCountdowns();
  }

  function startCountdowns(){
    stop();
    T.timer = setInterval(function (){
      var any = false, refresh = false;
      content().querySelectorAll(".ts-cd").forEach(function (node){
        var ms = new Date(node.getAttribute("data-ends")).getTime() - Date.now();
        node.textContent = fmtLeft(ms);
        any = true;
        if (ms <= 0) refresh = true;
      });
      if (!any) stop();
      if (refresh){ stop(); load(); }                 // een training is klaar -> herlaad (server kent +3 toe)
    }, 1000);
  }

  async function startOne(name, stat){
    T.pending = null;
    try { await Api.startTraining(T.id, name, stat); toast(name + " \u2192 " + LABEL[stat] + " training"); await load(); }
    catch (e){ toast(e.message); render(); }
  }
  async function cancelOne(name){
    try { await Api.cancelTraining(T.id, name); toast("Pulled " + name + " out"); await load(); }
    catch (e){ toast(e.message); }
  }
})();