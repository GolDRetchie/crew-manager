"use strict";

/* ====================================================================
   Crew Manager — mp-achievements.js
   Phase 1 achievements page. Renders into #cp-content; back -> league home.
   The display catalog lives here; the SERVER owns unlocks + XP (account-wide).
   The frontend shows the full list immediately (locked) and fills in the
   unlocked state + XP from GET /api/achievements once that exists.
   Opened via window.cmOpenAchievements().
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

  var RC    = { bronze:"#b3713a", silver:"#7f97a6", gold:"#d99a1f", legendary:"#9b3f8c", secret:"#2e7d72" };
  var RNAME = { bronze:"Bronze", silver:"Silver", gold:"Gold", legendary:"Legendary", secret:"Secret" };
  var RANKS = ["Rookie Pirate", "The Worst Generation", "Notorious", "Warlord", "Yonko", "King of the Pirates"];

  var ICONS = {
    poster:'<svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="1.7" stroke-linecap="round" stroke-linejoin="round"><rect x="5" y="3.5" width="14" height="17" rx="1.4"/><path d="M8 6.5h8"/><circle cx="12" cy="11" r="2.5"/><path d="M8.5 17h7"/></svg>',
    trophy:'<svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="1.7" stroke-linecap="round" stroke-linejoin="round"><path d="M7 4h10v4a5 5 0 0 1-10 0V4z"/><path d="M7 5H4v1.5a3 3 0 0 0 3 3"/><path d="M17 5h3v1.5a3 3 0 0 1-3 3"/><path d="M12 13v3"/><path d="M9.5 20h5"/><path d="M10 16h4l.5 4h-5z"/></svg>',
    flag:'<svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="1.8" stroke-linecap="round" stroke-linejoin="round"><path d="M7 3.5v17"/><path d="M7 4.5h10l-2.6 3.4L17 11.5H7"/></svg>',
    chest:'<svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="1.7" stroke-linecap="round" stroke-linejoin="round"><path d="M4 10c0-2.6 2-4 8-4s8 1.4 8 4"/><rect x="4" y="10" width="16" height="9" rx="1.4"/><path d="M4 13.5h16"/><rect x="10.7" y="12" width="2.6" height="3.4" rx=".5" fill="currentColor" stroke="none"/></svg>',
    bag:'<svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="1.7" stroke-linecap="round" stroke-linejoin="round"><path d="M9.5 6.5 8 4h8l-1.5 2.5"/><path d="M8.6 6.5C6.2 8 4.7 10.8 4.7 14c0 3.6 2.8 6 7.3 6s7.3-2.4 7.3-6c0-3.2-1.5-6-3.9-7.5z"/><path d="M12 10v7M10.2 12h3a1.4 1.4 0 0 1 0 2.8h-2a1.4 1.4 0 0 0 0 2.8h3"/></svg>',
    skull:'<svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="1.7" stroke-linecap="round" stroke-linejoin="round"><path d="M5 10.5C5 6.6 8 4 12 4s7 2.6 7 6.5c0 2-1 3.4-2 4.2V17a1.4 1.4 0 0 1-1.4 1.4H8.4A1.4 1.4 0 0 1 7 17v-2.3c-1-.8-2-2.2-2-4.2z"/><circle cx="9.3" cy="11" r="1.4" fill="currentColor" stroke="none"/><circle cx="14.7" cy="11" r="1.4" fill="currentColor" stroke="none"/><path d="M10.5 18.4v1.4M13.5 18.4v1.4"/></svg>'
  };

  // ---- display catalog ----
  // ids MUST match the server's catalog (the server owns the XP values + the unlock conditions).
  var CATALOG = [
    { cat:"Bounty", note:"op je totale crew-bounty", icon:"poster", items:[
      { id:"bounty_10m",  name:"First Wanted Poster", cond:"Reach 10M crew bounty",  rarity:"bronze",    xp:10 },
      { id:"bounty_100m", name:"Rising Threat",       cond:"Reach 100M crew bounty", rarity:"silver",    xp:25 },
      { id:"bounty_500m", name:"Marked Man",          cond:"Reach 500M crew bounty", rarity:"silver",    xp:25 },
      { id:"bounty_1b",   name:"Billionaire Captain", cond:"Reach 1B crew bounty",   rarity:"gold",      xp:60 },
      { id:"bounty_3b",   name:"World's Most Wanted", cond:"Reach 3B crew bounty",   rarity:"legendary", xp:150 }
    ]},
    { cat:"League", icon:"trophy", items:[
      { id:"league_debut",      name:"League Debut",       cond:"Play your first league match",          rarity:"bronze",    xp:10 },
      { id:"league_firstwin",   name:"First Three Points", cond:"Win your first league match",           rarity:"bronze",    xp:10 },
      { id:"league_top4",       name:"Top 4 Finish",       cond:"Finish a season in the top 4",          rarity:"silver",    xp:25 },
      { id:"league_champ",      name:"League Champion",    cond:"Win the league",                        rarity:"gold",      xp:60 },
      { id:"league_invincible", name:"Invincible Season",  cond:"Win the league without a single loss",  rarity:"legendary", xp:150 }
    ]},
    { cat:"Crew", icon:"flag", items:[
      { id:"crew_first", name:"First Recruit", cond:"Recruit your first crewmate", rarity:"bronze", xp:10 },
      { id:"crew_full",  name:"Full Crew",     cond:"Fill every crew position",    rarity:"silver", xp:25 }
    ]},
    { cat:"Secret", icon:"chest", items:[
      { id:"secret_almostking", name:"Almost King", cond:"Finish 2nd in the league", rarity:"secret", xp:40, secret:true }
    ]}
  ];

  var state = { xp:0, unlocked:{} };

  function rankInfo(xp){
    var lvl = 1, need = 100, acc = 0;
    while (lvl < RANKS.length && xp >= acc + need){ acc += need; lvl++; need = lvl * 100; }
    var maxed = (lvl >= RANKS.length && xp >= acc + need);
    return { name:RANKS[lvl-1], next: lvl < RANKS.length ? RANKS[lvl] : null, into:xp-acc, need:need, maxed:maxed };
  }

  function cardHtml(it, icon){
    var done = !!state.unlocked[it.id], locked = !done, rc = RC[it.rarity];
    var name = (it.secret && locked) ? "???" : it.name;
    var cond = (it.secret && locked) ? "Hidden achievement — keep playing to discover" : it.cond;
    var ic   = (it.secret && locked) ? '<span class="ach-qm">?</span>' : ICONS[icon];
    var right = done ? '<span class="ach-done-tag">\u2713 Unlocked</span>' : '<span class="ach-rar">' + RNAME[it.rarity] + '</span>';
    return '<div class="ach-card r-' + it.rarity + ' ' + (done ? 'done' : 'locked') + '" style="--rc:' + rc + '">' +
      '<div class="ach-ic">' + ic + '</div>' +
      '<div class="ach-main"><div class="ach-nm">' + esc(name) + '</div><div class="ach-cond">' + esc(cond) + '</div></div>' +
      '<div class="ach-right"><span class="ach-xp">+' + it.xp + ' XP</span>' + right + '</div></div>';
  }

  function render(){
    var total = 0, done = 0, listHtml = "";
    CATALOG.forEach(function (sec){
      listHtml += '<div class="ach-sec-h">' + esc(sec.cat) + (sec.note ? ' <span class="ach-note">\u00b7 ' + esc(sec.note) + '</span>' : '') + '</div><div class="ach-grid">';
      sec.items.forEach(function (it){ total++; if (state.unlocked[it.id]) done++; listHtml += cardHtml(it, sec.icon); });
      listHtml += '</div>';
    });
    var ri = rankInfo(state.xp);
    var legend = Object.keys(RC).map(function (k){ return '<span class="ach-chip" style="background:' + RC[k] + '">' + RNAME[k] + '</span>'; }).join("");

    content().innerHTML =
      '<div class="ach-page">' +
        '<div class="ach-head">' +
          '<button class="ach-back" id="ach-back" type="button" aria-label="Back"><svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round"><path d="M19 12H5M11 18l-6-6 6-6"/></svg></button>' +
          '<div><div class="ach-title">ACHIEVEMENTS</div><div class="ach-sub">' + done + ' of ' + total + ' unlocked</div></div>' +
        '</div>' +
        '<div class="ach-lvl-card">' +
          '<div class="ach-emblem"><svg viewBox="0 0 24 24" fill="currentColor"><path d="M12 2l2.6 5.3 5.8.8-4.2 4.1 1 5.8L12 18.3 6.8 18l1-5.8L3.6 8.1l5.8-.8z"/></svg></div>' +
          '<div class="ach-lvl-main"><div class="ach-rank-lbl">CAPTAIN RANK</div><div class="ach-rank">' + esc(ri.name) + '</div>' +
            '<div class="ach-bar"><i style="width:' + (ri.maxed ? 100 : Math.round(ri.into / ri.need * 100)) + '%"></i></div>' +
            '<div class="ach-xpline">' + (ri.maxed ? ("Max rank reached \u00b7 " + state.xp + " XP total") : (ri.into + " / " + ri.need + " XP \u00b7 next: " + esc(ri.next))) + '</div>' +
          '</div>' +
        '</div>' +
        '<div class="ach-legend">' + legend + '</div>' +
        listHtml +
      '</div>';

    var b = el("ach-back"); if (b) b.addEventListener("click", exit);
  }

  function exit(){
    document.body.classList.remove("ach-active");
    if (typeof window.cmOpenLeague === "function" && window.cmCurrentWorldId) window.cmOpenLeague(window.cmCurrentWorldId);
    else if (typeof window.cmOpenWorlds === "function") window.cmOpenWorlds();
  }

  /* ---- unlock-toast (top-center, met queue) — aangeroepen vanaf de home ---- */
  var META = {};
  CATALOG.forEach(function (sec){ sec.items.forEach(function (it){ META[it.id] = { name:it.name, rarity:it.rarity, icon:sec.icon, xp:it.xp }; }); });
  window.cmAchievementMeta = META;

  var tq = [], tShowing = false;
  function toastHost(){
    var h = el("ach-toasts");
    if (!h){ h = document.createElement("div"); h.id = "ach-toasts"; h.className = "ach-toasts"; document.body.appendChild(h); }
    return h;
  }
  function nextToast(){
    if (!tq.length){ tShowing = false; return; }
    tShowing = true;
    var m = tq.shift();
    var d = document.createElement("div");
    d.className = "ach-toast r-" + m.rarity; d.style.setProperty("--rc", RC[m.rarity] || "#b3713a");
    d.innerHTML = '<div class="t-ic">' + (ICONS[m.icon] || ICONS.trophy) + '</div>' +
      '<div class="t-main"><div class="t-lbl">Achievement unlocked</div><div class="t-nm">' + esc(m.name) + '</div></div>' +
      '<span class="t-xp">+' + m.xp + '</span>';
    toastHost().appendChild(d);
    void d.offsetWidth; d.classList.add("in");
    setTimeout(function (){ d.classList.remove("in"); setTimeout(function (){ if (d.parentNode) d.remove(); nextToast(); }, 320); }, 2800);
  }
  window.cmAchievement = function (id){
    var m = META[id]; if (!m) return;
    tq.push(m);
    if (!tShowing) nextToast();
  };

  window.cmOpenAchievements = async function (){
    activateScreen("screen-competition");
    document.body.classList.add("ach-active");
    render();   // toon de lijst meteen (vergrendeld) terwijl we de echte status laden
    try {
      if (typeof Api !== "undefined" && typeof Api.achievements === "function"){
        var r = await Api.achievements();
        state.xp = (r && r.xp) || 0;
        state.unlocked = {};
        ((r && r.unlocked) || []).forEach(function (u){ state.unlocked[(u && u.id) ? u.id : u] = true; });
        render();
      }
    } catch (e){ /* backend nog niet klaar -> blijft vergrendeld tonen */ }
  };
})();