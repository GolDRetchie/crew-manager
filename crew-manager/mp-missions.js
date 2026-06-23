"use strict";

/* ====================================================================
   mp-missions.js — daily & weekly missions page (renders into #cp-content)
   Aangesloten op GET /api/missions + POST /api/missions/claim.
   Geopend via window.cmOpenMissions(worldId); back -> league home.
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

  var DC = { bronze:"#b3713a", silver:"#7f97a6", gold:"#d99a1f" };
  var ICONS = {
    dumbbell:'<svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="1.8" stroke-linecap="round" stroke-linejoin="round"><path d="M4 9v6M7 7.5v9M17 7.5v9M20 9v6M7 12h10"/></svg>',
    clipboard:'<svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="1.7" stroke-linecap="round" stroke-linejoin="round"><rect x="5" y="4" width="14" height="17" rx="2"/><path d="M9 4.5h6v2.5H9z" fill="currentColor" stroke="none"/><path d="M8.5 11h7M8.5 14.5h7M8.5 18h4"/></svg>',
    flag:'<svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="1.8" stroke-linecap="round" stroke-linejoin="round"><path d="M7 3.5v17"/><path d="M7 4.5h10l-2.6 3.4L17 11.5H7"/></svg>',
    coins:'<svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="1.6" stroke-linecap="round" stroke-linejoin="round"><ellipse cx="9" cy="7" rx="5.5" ry="2.6"/><path d="M3.5 7v4c0 1.4 2.5 2.6 5.5 2.6s5.5-1.2 5.5-2.6V7"/><ellipse cx="15" cy="15" rx="5.5" ry="2.6"/><path d="M9.5 15v2c0 1.4 2.5 2.6 5.5 2.6s5.5-1.2 5.5-2.6v-4"/></svg>',
    swords:'<svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="1.7" stroke-linecap="round" stroke-linejoin="round"><path d="M14.5 3.5H19V8l-9.5 9.5-3-3z"/><path d="M5 16l3 3M3.5 20.5l2.5-2.5"/><path d="M9.5 3.5H5V8l3 3"/><path d="M19 16l-3 3M20.5 20.5L18 18"/></svg>',
    poster:'<svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="1.7" stroke-linecap="round" stroke-linejoin="round"><rect x="5" y="3.5" width="14" height="17" rx="1.4"/><path d="M8 6.5h8"/><circle cx="12" cy="11" r="2.5"/><path d="M8.5 17h7"/></svg>'
  };

  var M = { id: null, data: null, ticker: null };

  function fmtK(n){ return n >= 1000 ? (Math.round(n / 1000) + "K") : String(n); }
  function rewardText(r){
    if (!r) return "";
    var parts = [];
    if (r.berries) parts.push("+" + fmtK(r.berries) + " Berries");
    if (r.xp) parts.push("+" + r.xp + " XP");
    if (r.chest) parts.push(r.chest.charAt(0).toUpperCase() + r.chest.slice(1) + " Chest");
    return parts.join(" \u00b7 ");
  }
  function countdown(iso){
    var ms = new Date(iso).getTime() - Date.now();
    if (ms <= 0) return "now";
    var s = Math.floor(ms / 1000), d = Math.floor(s / 86400), h = Math.floor((s % 86400) / 3600), m = Math.floor((s % 3600) / 60);
    if (d > 0) return d + "d " + h + "h";
    if (h > 0) return h + "h " + m + "m";
    return m + "m " + (s % 60) + "s";
  }

  function cardHtml(it){
    var rc = DC[it.difficulty] || "#b3713a";
    var done = it.completed, claimed = it.claimed;
    var right = claimed
      ? '<span class="mi-claimed">\u2713 Claimed</span>'
      : (done
          ? '<button class="mi-claim" data-id="' + it.id + '" type="button">Claim</button>'
          : '<span class="mi-prog">' + it.progress + '/' + it.target + '</span>');
    return '<div class="mi-card r-' + it.difficulty + (claimed ? ' is-claimed' : '') + '" style="--dc:' + rc + '">' +
      '<div class="mi-ic">' + (ICONS[it.icon] || ICONS.flag) + '</div>' +
      '<div class="mi-main"><div class="mi-r1"><span class="mi-nm">' + esc(it.title) + '</span><span class="mi-tag">' + it.difficulty + '</span></div>' +
        '<div class="mi-desc">' + esc(it.desc) + '</div></div>' +
      '<div class="mi-right">' + right + '<span class="mi-rew">' + rewardText(it.reward) + '</span></div></div>';
  }

  function bonusHtml(b, label){
    if (!b) return "";
    var chest = (b.chest || "").charAt(0).toUpperCase() + (b.chest || "").slice(1);
    var state = b.claimed ? ("\u2713 " + chest + " Chest geclaimd") : (b.allDone ? (chest + " Chest klaar om te claimen") : ("Maak alle " + label + " af \u2192 " + chest + " Chest"));
    return '<div class="mi-bonus' + (b.claimed ? ' done' : '') + '">' +
      '<svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="1.6" stroke-linecap="round" stroke-linejoin="round"><path d="M4 10c0-2.4 2-3.6 8-3.6s8 1.2 8 3.6"/><rect x="4" y="10" width="16" height="8.5" rx="1.3"/><path d="M4 13.2h16"/></svg>' +
      '<span>' + state + '</span></div>';
  }

  function render(){
    var d = M.data;
    var dailyDone = d.daily.filter(function (m){ return m.completed; }).length;
    var weeklyDone = d.weekly.filter(function (m){ return m.completed; }).length;

    content().innerHTML =
      '<div class="mi-page">' +
        '<div class="mi-head">' +
          '<button class="mi-back" id="mi-back" type="button" aria-label="Back"><svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round"><path d="M19 12H5M11 18l-6-6 6-6"/></svg></button>' +
          '<div style="flex:1"><div class="mi-title">MISSIONS</div></div>' +
          '<div class="mi-streak"><svg viewBox="0 0 24 24" fill="currentColor"><path d="M13 2c.5 3-1.5 4.5-3 6.5C8.2 11 7 12.8 7 15a5 5 0 0 0 10 .3c.1-2-.9-3.6-1.8-4.8-.4 1-1.2 1.6-2.2 1.8.8-2 .6-4.2-.5-6-.4-.6-1-1.5-1.5-4.3z"/></svg>' + (d.streak || 0) + '-day streak</div>' +
        '</div>' +

        '<div class="mi-sec"><span class="t">Daily</span><span class="c">' + dailyDone + '/' + d.daily.length + '</span><span class="r" data-deadline="' + d.resets.daily + '"></span></div>' +
        d.daily.map(cardHtml).join("") +
        bonusHtml(d.bonusDaily, "daily") +

        '<div class="mi-sec"><span class="t">Weekly</span><span class="c">' + weeklyDone + '/' + d.weekly.length + '</span><span class="r" data-deadline="' + d.resets.weekly + '"></span></div>' +
        d.weekly.map(cardHtml).join("") +
        bonusHtml(d.bonusWeekly, "weekly") +
      '</div>';

    var b = el("mi-back"); if (b) b.addEventListener("click", exit);
    content().querySelectorAll(".mi-claim").forEach(function (btn){ btn.addEventListener("click", function (){ claim(btn.getAttribute("data-id"), btn); }); });
    tickCountdowns();
  }

  function tickCountdowns(){
    if (M.ticker) clearInterval(M.ticker);
    function upd(){
      content().querySelectorAll("[data-deadline]").forEach(function (e){ e.textContent = "Resets in " + countdown(e.getAttribute("data-deadline")); });
    }
    upd();
    M.ticker = setInterval(upd, 1000);
  }

  // gedeelde claim-kern (pagina + game-home kaartje gebruiken dit allebei)
  function claimCore(missionId, worldId){ return Api.claimMission(missionId, worldId); }

  // bouwt de eenvoudige tekst-samenvatting (fallback zolang er geen pack-opening is)
  function claimMsg(r){
    var msg = (r.granted || []).map(function (g){
      if (g.type === "berries") return "+" + fmtK(g.amount) + " Berries";
      if (g.type === "xp") return "+" + g.amount + " XP";
      if (g.type === "card") return (g.kind === "crew_card" ? "Crew card: " : "Role card: ") + g.value;
      return "";
    }).filter(Boolean).join("  \u00b7  ");
    if (r.bonusGranted && r.bonusGranted.length) msg += "   +  Bonus chest!";
    return msg || "Reward claimed";
  }

  /* Eén centrale reveal-hook. Zodra window.cmRevealRewards bestaat (pack-opening,
     verse chat) gebruiken BEIDE claim-plekken die animatie; anders de toast. */
  function revealRewards(r, onDone){
    if (typeof window.cmRevealRewards === "function"){
      window.cmRevealRewards(r.granted || [], r.bonusGranted || [], onDone);
    } else {
      toast(claimMsg(r));
      if (onDone) onDone();
    }
  }

  async function claim(missionId, btn){
    if (btn){ btn.disabled = true; btn.textContent = "\u2026"; }
    try {
      var r = await claimCore(missionId, M.id);
      revealRewards(r, function (){ load(); });   // herlaad pagina: voortgang + bonus-status
    } catch (e){
      toast(e.message || "Claimen mislukt");
      if (btn){ btn.disabled = false; btn.textContent = "Claim"; }
    }
  }

  var toastEl = null;
  function toast(msg){
    if (!toastEl){ toastEl = document.createElement("div"); toastEl.className = "mi-toast"; document.body.appendChild(toastEl); }
    toastEl.textContent = msg; toastEl.classList.add("in");
    clearTimeout(toastEl._tm); toastEl._tm = setTimeout(function (){ toastEl.classList.remove("in"); }, 2600);
  }

  async function load(){
    try { M.data = await Api.missions(M.id); render(); }
    catch (e){ content().innerHTML = '<div class="mi-page"><div class="wl-err" style="margin:20px">' + esc(e.message) + '</div></div>'; }
  }

  function exit(){
    if (M.ticker){ clearInterval(M.ticker); M.ticker = null; }
    document.body.classList.remove("mi-active");
    if (typeof window.cmOpenLeague === "function" && (M.id || window.cmCurrentWorldId)) window.cmOpenLeague(M.id || window.cmCurrentWorldId);
    else if (typeof window.cmOpenWorlds === "function") window.cmOpenWorlds();
  }

  window.cmOpenMissions = function (worldId){
    M.id = worldId || window.cmCurrentWorldId || null;
    activateScreen("screen-competition");
    document.body.classList.add("mi-active");
    content().innerHTML = '<div class="mi-page"><div class="mi-head"><div class="mi-title">MISSIONS</div></div>' +
      (typeof window.cmLoader === "function" ? window.cmLoader("Loading missions\u2026") : '<div class="wl-muted" style="margin:20px">Loading\u2026</div>') + '</div>';
    load();
  };

  /* ====================================================================
     Game-home kaartje (window.cmMissionsWidget).
     Toont een uitgetypte missie (volgende open, of claimbaar met Claim-knop)
     + daily/weekly bolletjes + reset. Klik op kaart = volledige pagina.
     ==================================================================== */
  function mdots(done, total){
    var s = "";
    for (var i = 0; i < total; i++) s += '<span class="gh-mdot' + (i < done ? " on" : "") + '"></span>';
    return s;
  }
  var TARGET = '<svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="1.8" stroke-linecap="round" stroke-linejoin="round"><circle cx="12" cy="12" r="9"/><circle cx="12" cy="12" r="5"/><circle cx="12" cy="12" r="1.4" fill="currentColor"/></svg>';
  var CHECK  = '<svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2.2" stroke-linecap="round" stroke-linejoin="round"><path d="M5 12.5l4.5 4.5L19 7"/></svg>';

  function shortCd(iso){
    var s = Math.max(0, Math.floor((new Date(iso).getTime() - Date.now()) / 1000));
    var d = Math.floor(s / 86400), h = Math.floor((s % 86400) / 3600), m = Math.floor((s % 3600) / 60);
    if (d > 0) return d + "d " + h + "h";
    if (h > 0) return h + "h";
    return m + "m";
  }

  function renderCard(container, d, id){
    var dd = d.daily.filter(function (m){ return m.completed; }).length, dt = d.daily.length;
    var wd = d.weekly.filter(function (m){ return m.completed; }).length, wt = d.weekly.length;
    var all = d.daily.concat(d.weekly);
    // uitgelichte missie: eerst iets claimbaars, anders de volgende open missie
    var feat = all.filter(function (m){ return m.completed && !m.claimed; })[0]
            || all.filter(function (m){ return !m.completed; })[0]
            || null;

    var line;
    if (feat){
      var diff = feat.difficulty || "bronze";
      var icon = ICONS[feat.icon] || ICONS.flag;
      var claimable = feat.completed && !feat.claimed;
      var right = claimable
        ? '<button class="gh-mline-claim" data-claim="' + feat.id + '" type="button">Claim</button>'
        : '<span class="gh-mline-prog">' + feat.progress + '/' + feat.target + '</span>';
      var barW = claimable ? 100 : Math.min(100, Math.round((feat.progress / feat.target) * 100));
      line =
        '<div class="gh-mline"><span class="gh-mline-ic ' + diff + '">' + icon + '</span>' +
          '<span class="gh-mline-nm">' + esc(feat.title) + '</span>' + right + '</div>' +
        '<div class="gh-mbar"><i style="width:' + barW + '%"></i></div>';
    } else {
      line =
        '<div class="gh-mline"><span class="gh-mline-ic gold">' + CHECK + '</span>' +
          '<span class="gh-mline-nm">All missions claimed</span></div>' +
        '<div class="gh-mbar"><i style="width:100%"></i></div>';
    }

    container.innerHTML =
      '<span class="gh-v3-strip"></span>' +
      '<div class="gh-ch"><span class="gh-ch-ic">' + TARGET + '</span><span class="gh-ch-t">Missions</span></div>' +
      line +
      '<div class="gh-dotsrow">' +
        '<span class="gh-dg"><span class="lab">Daily</span><span class="gh-mdots">' + mdots(dd, dt) + '</span></span>' +
        '<span class="gh-dg"><span class="lab">Weekly</span><span class="gh-mdots">' + mdots(wd, wt) + '</span></span>' +
        '<span class="gh-reset" data-deadline="' + d.resets.daily + '"></span>' +
      '</div>';

    // Claim-knop op het kaartje: niet doorklikken naar de pagina, wel direct claimen
    var cb = container.querySelector("[data-claim]");
    if (cb) cb.addEventListener("click", function (e){
      e.stopPropagation();
      cardClaim(cb.getAttribute("data-claim"), id, container, cb);
    });

    var rs = container.querySelector(".gh-reset");
    if (rs){
      var upd = function (){ rs.textContent = "resets " + shortCd(rs.getAttribute("data-deadline")); };
      upd();
      window._ghmTimer = setInterval(upd, 1000);
    }
  }

  async function cardClaim(missionId, worldId, container, btn){
    if (btn){ btn.disabled = true; btn.textContent = "\u2026"; }
    try {
      var r = await claimCore(missionId, worldId);
      revealRewards(r, function (){ window.cmMissionsWidget(container, worldId); });  // ververs alleen het kaartje
    } catch (e){
      toast(e.message || "Claimen mislukt");
      if (btn){ btn.disabled = false; btn.textContent = "Claim"; }
    }
  }

  // container = het bestaande .gh-soon-card .gh-mcard element (klik via data-act in mp-online.js)
  window.cmMissionsWidget = function (container, worldId){
    if (!container) return;
    if (window._ghmTimer){ clearInterval(window._ghmTimer); window._ghmTimer = null; }
    var id = worldId || window.cmCurrentWorldId || null;
    Api.missions(id)
      .then(function (d){ if (d && d.daily && d.weekly) renderCard(container, d, id); })  // anders: nette placeholder laten staan
      .catch(function (){ /* geen missies / geen crew -> placeholder laten staan */ });
  };
})();