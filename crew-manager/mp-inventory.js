"use strict";

/* ====================================================================
   mp-inventory.js — account-brede kaarten + toepassen op je crew
   GET /api/inventory + POST /api/inventory/:id/apply (+ getSquad voor targets)
   Geopend via window.cmOpenInventory(worldId); back -> league home.
   ==================================================================== */

(function () {
  function el(id){ return document.getElementById(id); }
  function esc(s){ return (typeof escapeHtml === "function") ? escapeHtml(s) : String(s == null ? "" : s); }
  function content(){ return el("cp-content"); }
  function ini(s){ return (s || "?").trim().charAt(0).toUpperCase(); }
  function col(n){ return (typeof colorFor === "function") ? colorFor(n || "?") : "#8a5a2b"; }
  function activateScreen(id){
    try { if (typeof showScreen === "function") showScreen(id); } catch (e) {}
    var t = el(id);
    if (t && !t.classList.contains("is-active")) {
      document.querySelectorAll(".screen").forEach(function (s){ s.classList.remove("is-active"); });
      t.classList.add("is-active");
    }
  }

  var RC = { bronze:"#b3713a", silver:"#7f97a6", gold:"#d99a1f", crew:"#9b3f8c", stamina:"#2e7d5b" };
  var ROLE_EMB = '<svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="1.7" stroke-linecap="round" stroke-linejoin="round"><path d="M12 3l7 3v5c0 4.2-2.9 7.4-7 8.6C7.9 18.4 5 15.2 5 11V6z"/><path d="M9.2 11.6l2 2 3.6-4"/></svg>';
  // bliksem/energie-icoon voor stamina
  var STAM_EMB = '<svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="1.7" stroke-linecap="round" stroke-linejoin="round"><path d="M13 2L4.5 13.5H11l-1 8.5L19.5 10H13z"/></svg>';

  var I = { id: null, groups: [], squad: [], sel: null };

  function group(items){
    var map = {};
    items.forEach(function (it){
      var k = it.kind + "|" + it.value + "|" + it.rarity;
      if (!map[k]) map[k] = { kind: it.kind, value: it.value, rarity: it.rarity, data: it.data, ids: [] };
      map[k].ids.push(it.id);
    });
    return Object.keys(map).map(function (k){ return map[k]; });
  }

  function cardHtml(g, i){
    var rc = RC[g.rarity] || RC[g.kind] || "#b3713a";
    var ribbon, emb, sub;
    if (g.kind === "crew_card"){
      ribbon = "Crew Card";
      emb = '<div class="inv-av">' + ini(g.value) + '</div>';
      var d = g.data || {};
      sub = (d.p != null) ? ("P" + d.p + " \u00b7 D" + d.d + " \u00b7 S" + d.s) : "Crew card";
    } else if (g.kind === "stamina"){
      ribbon = "Stamina";
      emb = '<div class="inv-badge">' + STAM_EMB + '</div>';
      var amt = (g.data && g.data.amount) ? g.data.amount : 25;
      sub = "Restores +" + amt + " stamina";
    } else {
      ribbon = "Role Card";
      emb = '<div class="inv-badge">' + ROLE_EMB + '</div>';
      sub = "Position card";
    }
    var cnt = g.ids.length > 1 ? '<div class="inv-cnt">\u00d7' + g.ids.length + '</div>' : '';
    var rcls = (g.kind === "stamina") ? "r-stamina" : ("r-" + g.rarity);
    return '<div class="inv-card ' + rcls + (i === I.sel ? ' sel' : '') + '" data-i="' + i + '" style="--rc:' + rc + '">' +
      '<div class="inv-rib">' + ribbon + '</div>' + cnt +
      '<div class="inv-emb">' + emb + '</div>' +
      '<div class="inv-nm">' + esc(g.value) + '</div><div class="inv-sub">' + esc(sub) + '</div></div>';
  }

  function render(){
    var grid = I.groups.length
      ? '<div class="inv-grid">' + I.groups.map(cardHtml).join("") + '</div>'
      : '<div class="inv-empty">Je inventory is leeg \u2014 voltooi missies en open chests om kaarten te verzamelen.</div>';

    content().innerHTML =
      '<div class="inv-page">' +
        '<div class="inv-head">' +
          '<button class="inv-back" id="inv-back" type="button" aria-label="Back"><svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round"><path d="M19 12H5M11 18l-6-6 6-6"/></svg></button>' +
          '<div><div class="inv-title">INVENTORY</div><div class="inv-subt">' + I.groups.reduce(function (a, g){ return a + g.ids.length; }, 0) + ' cards \u2014 tik een kaart om \u2019m toe te passen</div></div>' +
        '</div>' +
        grid +
        '<div class="inv-apply" id="inv-apply"></div>' +
      '</div>';

    var b = el("inv-back"); if (b) b.addEventListener("click", exit);
    content().querySelectorAll(".inv-card").forEach(function (c){ c.addEventListener("click", function (){ pick(parseInt(c.dataset.i, 10)); }); });
  }

  // welke crewleden zijn een zinvol doel voor dit item?
  function targetsFor(g){
    if (g.kind === "role_card"){
      // iedereen die deze rol nog niet kan spelen
      return I.squad.filter(function (m){
        var alt = Array.isArray(m.altRoles) ? m.altRoles : [];
        return m.role !== g.value && alt.indexOf(g.value) < 0;
      });
    }
    if (g.kind === "stamina"){
      // alleen wie niet al vol zit
      return I.squad.filter(function (m){ return (m.cond == null ? 100 : m.cond) < 100; });
    }
    return I.squad.slice();
  }

  function pick(i){
    var g = I.groups[i];
    if (g.kind === "crew_card"){ applyItem(g, null); return; }

    I.sel = i; render();
    var panel = el("inv-apply");
    var targets = targetsFor(g);

    var what = g.kind === "stamina"
      ? ('<b>' + esc(g.value) + '</b> (+' + ((g.data && g.data.amount) || 25) + ' stamina)')
      : ('<b>' + esc(g.value) + '</b>');

    panel.className = "inv-apply show";

    if (!I.squad.length){
      panel.innerHTML = '<div class="inv-apply-h">Je hebt nog geen crewleden om ' + what + ' op toe te passen \u2014 koop eerst iemand op de markt.</div><div class="inv-cancel" id="inv-cancel">Sluiten</div>';
    } else if (!targets.length){
      var none = g.kind === "stamina"
        ? "Al je crewleden zitten al op volle stamina."
        : "Iedereen kan deze rol al spelen.";
      panel.innerHTML = '<div class="inv-apply-h">' + none + '</div><div class="inv-cancel" id="inv-cancel">Sluiten</div>';
    } else {
      panel.innerHTML = '<div class="inv-apply-h">Pas ' + what + ' toe op een crewlid:</div>' +
        '<div class="inv-chips">' + targets.map(function (m){
          var cond = (m.cond == null ? 100 : m.cond);
          var extra = g.kind === "stamina" ? (' \u00b7 ' + cond + '/100') : "";
          return '<div class="inv-chip" data-n="' + esc(m.name) + '"><div class="inv-cav" style="background:' + col(m.name) + '">' + ini(m.name) + '</div>' +
            '<div><div class="inv-cn">' + esc(m.name) + '</div><div class="inv-cr">' + esc(m.role) + extra + '</div></div></div>';
        }).join("") + '</div><div class="inv-cancel" id="inv-cancel">Annuleren</div>';
      panel.querySelectorAll(".inv-chip").forEach(function (ch){ ch.addEventListener("click", function (){ applyItem(g, ch.dataset.n); }); });
    }
    var c = el("inv-cancel"); if (c) c.addEventListener("click", function (){ I.sel = null; render(); });
    panel.scrollIntoView({ behavior: "smooth", block: "nearest" });
  }

  async function applyItem(g, squadMemberName){
    try {
      var r = await Api.applyInventory(g.ids[0], I.id, squadMemberName);
      var ap = (r && r.applied) || {};
      if (g.kind === "crew_card"){
        toast(g.value + " is bij je crew gekomen");
      } else if (g.kind === "stamina"){
        var gained = ap.gained != null ? ap.gained : ((g.data && g.data.amount) || 25);
        toast(squadMemberName + " kreeg +" + gained + " stamina (" + (ap.to != null ? ap.to : "") + "/100)");
      } else {
        var lbl = { p:"Power", d:"Defense", s:"Speed" }[ap.stat] || "";
        var bonus = (lbl && ap.gained) ? ("  \u00b7  +" + ap.gained + " " + lbl) : "";
        toast(squadMemberName + " kan nu " + g.value + " spelen" + bonus);
      }
      I.sel = null;
      await load();
    } catch (e){ toast(e.message || "Toepassen mislukt"); }
  }

  var toastEl = null;
  function toast(msg){
    if (!toastEl){ toastEl = document.createElement("div"); toastEl.className = "inv-toast"; document.body.appendChild(toastEl); }
    toastEl.textContent = msg; toastEl.classList.add("in");
    clearTimeout(toastEl._tm); toastEl._tm = setTimeout(function (){ toastEl.classList.remove("in"); }, 2400);
  }

  async function load(){
    try {
      var inv = await Api.inventory();
      I.groups = group(inv.items || []);
      try { var sq = await Api.getSquad(I.id); I.squad = sq.squad || []; } catch (e){ I.squad = []; }
      render();
    } catch (e){
      content().innerHTML = '<div class="inv-page"><div class="wl-err" style="margin:20px">' + esc(e.message) + '</div></div>';
    }
  }

  function exit(){
    document.body.classList.remove("inv-active");
    if (typeof window.cmOpenLeague === "function" && (I.id || window.cmCurrentWorldId)) window.cmOpenLeague(I.id || window.cmCurrentWorldId);
    else if (typeof window.cmOpenWorlds === "function") window.cmOpenWorlds();
  }

  window.cmOpenInventory = function (worldId){
    I.id = worldId || window.cmCurrentWorldId || null;
    I.sel = null;
    activateScreen("screen-competition");
    document.body.classList.add("inv-active");
    content().innerHTML = '<div class="inv-page"><div class="inv-head"><div class="inv-title">INVENTORY</div></div>' +
      (typeof window.cmLoader === "function" ? window.cmLoader("Loading inventory\u2026") : '<div class="wl-muted" style="margin:20px">Loading\u2026</div>') + '</div>';
    load();
  };
})();