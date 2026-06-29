"use strict";

/* ====================================================================
   Crew Manager — competition.js  (League standings)

   De volledige ranglijst (cmOpenCompetition), geopend door de "League"-tegel
   en "View all ->" op de game-home. House-style unified table zoals de markt,
   maar op de bestaande DONKERE home-achtergrond (geen eigen achtergrond op de
   container) met een beige tabelpaneel + donkere cmTopbar (sub-modus).

   Kolommen:  #  ·  Crew  ·  Bounty(☠)  ·  W · G · V · Form  ·  Pts
     - Geen P (played): iedereen speelt evenveel in een gesynchroniseerde
       competitie, dus die kolom is dode ruimte -> vervangen door bounty.
     - Geen doelpunten/saldo (het is geen voetbal; crews vechten het uit).
     - Tie-break = totale crew-bounty (alleen volgorde; backend sorteert).

   Features die EXTRA backend-velden nodig hebben verschijnen vanzelf zodra
   worldStandings ze levert; tot dan werkt het scherm met de huidige data:
     - m.bounty   -> Bounty-kolom (anders valt 'ie terug op Played)
     - m.move     -> positie-pijlen ▲▼–  (of m.prevRank)
     - m.form     -> vorm-gids laatste 5 (["W","D","L",...])
   Kapitein in het tik-detail komt uit Api.getLeague (lg.crews), dus die werkt
   meteen. Bounty in het detail komt mee zodra m.bounty bestaat.

   Data:
     Api.getWorld(id)        -> world.name/status/currentDay/totalDays
     Api.worldStandings(id)  -> { standings:[{ rank, crewName, username,
                                  won, drawn, lost, points, isMe,
                                  bounty?, move?/prevRank?, form? }] }
     Api.getLeague(id)       -> { crews:[{ crewName, captain, ... }] }  (optioneel)
   ==================================================================== */

(function () {
  var QUALIFY = 8;   // top-8 -> Grand Tournament op de laatste dag

  function el(id){ return document.getElementById(id); }
  function esc(s){ return (typeof escapeHtml === "function") ? escapeHtml(s) : String(s == null ? "" : s).replace(/[&<>"']/g, function (c){ return ({ "&":"&amp;","<":"&lt;",">":"&gt;",'"':"&quot;","'":"&#39;" })[c]; }); }
  function colOf(n){ return (typeof colorFor === "function") ? colorFor(n || "?") : "#8a5a2b"; }
  function iniOf(n){ return (typeof initial === "function") ? initial(n || "?") : "?"; }
  function shortB(n){ return (typeof fmtShort === "function") ? fmtShort(n) : (Math.round((n || 0) / 1e6) + "M"); }
  function content(){ return el("cp-content"); }
  function loader(label){ return (window.cmLoader ? window.cmLoader(label) : '<div class="lg-soft" style="padding:20px;text-align:center">Loading\u2026</div>'); }

  function activateScreen(id){
    try { if (typeof showScreen === "function") showScreen(id); } catch (e) {}
    var t = el(id);
    if (t && !t.classList.contains("is-active")) {
      document.querySelectorAll(".screen").forEach(function (s){ s.classList.remove("is-active"); });
      t.classList.add("is-active");
    }
  }

  var L = { id: null, world: null, standings: [], capByCrew: {}, hasBounty: false, hasMove: false, hasForm: false };

  /* ---------------- CSS (eenmalig injecteren) ---------------- */
  function injectCss(){
    if (el("lg2-css")) return;
    var s = document.createElement("style");
    s.id = "lg2-css";
    s.textContent = [
      /* container: vult het scherm, GEEN eigen achtergrond -> toont de home-bg */
      '.lg2{ container-type:inline-size; font-family:var(--body); color:var(--ink); height:100dvh; display:flex; flex-direction:column; overflow:hidden; }',
      '.lg2 #lg-tb{ flex:0 0 auto; background:var(--sea-deep); }',

      /* het beige tabelpaneel (scroller); dark margins eromheen = home-bg */
      '.lg2 #lg-body{ flex:1 1 auto; min-height:0; overflow-y:auto; overflow-x:hidden; -webkit-overflow-scrolling:touch; scrollbar-width:none; -ms-overflow-style:none;',
      '  margin:10px 11px 12px; background:var(--parch-3); border:1.5px solid var(--line); border-radius:14px; box-shadow:0 4px 12px -6px #0006, 0 0 0 1px #ffffff40 inset;',
      '  --cols: 30px minmax(0,1fr) 54px 40px; }',                 /* portrait: # · Crew · ☠ · Pts */
      '.lg2 #lg-body::-webkit-scrollbar{ width:0; height:0; display:none; }',
      '.lg2 #lg-body.loading{ background:transparent; border:0; box-shadow:none; margin:0; }',

      '.lg2 .board-head{ position:sticky; top:0; z-index:5; background:var(--parch-3); padding:9px 11px 6px; border-bottom:1.5px solid var(--line-soft); }',
      '.lg2 .head-top{ display:flex; align-items:center; margin:0 4px 7px; }',
      '.lg2 .head-top .cap{ font-family:var(--display); font-weight:400; letter-spacing:.4px; font-size:15px; color:var(--ink-2); }',
      '.lg2 .matchlink{ margin-left:auto; display:inline-flex; align-items:center; gap:4px; font-family:var(--body); font-weight:700; font-size:11px; color:var(--sea-light); cursor:pointer; border:0; background:transparent; }',
      '.lg2 .thead{ display:grid; grid-template-columns:var(--cols); gap:5px; align-items:end; padding:0 4px; }',
      '.lg2 .thead span{ font-family:var(--body); font-weight:700; font-size:9px; letter-spacing:.5px; text-transform:uppercase; color:var(--ink-2); text-align:center; }',
      '.lg2 .thead .h-pos{ text-align:left; padding-left:2px; color:var(--muted); }',
      '.lg2 .thead .h-crew{ text-align:left; padding-left:4px; }',
      '.lg2 .thead .h-bty{ color:var(--gold-d); }',
      '.lg2 .thead .h-pts{ color:var(--gold-d); }',
      '.lg2 .thead .h-wide{ display:none; }',

      '.lg2 .tbl{ display:flex; flex-direction:column; }',
      '.lg2 .trow{ display:grid; grid-template-columns:var(--cols); gap:5px; align-items:center; position:relative; border-bottom:1px solid var(--line-soft); padding:7px 4px; cursor:pointer; }',
      '.lg2 .trow:last-child{ border-bottom:0; }',
      '.lg2 .trow.you{ background:#e7b94a24; }',
      '.lg2 .trow.you::after{ content:""; position:absolute; left:0; top:0; bottom:0; width:3px; background:var(--gold-d); }',
      '.lg2 .trow.qz::before{ content:""; position:absolute; left:0; top:0; bottom:0; width:3px; background:var(--good); }',
      '.lg2 .trow.qz.you::before{ background:var(--gold-d); }',
      '.lg2 .trow.zone-end{ border-bottom:2px solid var(--good); }',
      '.lg2 .zone-cap{ display:flex; align-items:center; gap:7px; padding:5px 10px 5px 12px; font-family:var(--body); font-weight:700; font-size:10.5px; letter-spacing:.3px; color:var(--good); background:#3f7a3a0f; border-bottom:1px solid var(--line-soft); }',

      '.lg2 .r-pos{ display:flex; align-items:center; gap:3px; padding-left:2px; }',
      '.lg2 .r-rank{ font-family:var(--display); font-weight:400; font-size:16px; line-height:1; color:var(--ink-2); min-width:15px; text-align:right; }',
      '.lg2 .trow.you .r-rank{ color:var(--gold-d); }',
      '.lg2 .mv{ font-size:9px; line-height:1; width:9px; text-align:center; }',
      '.lg2 .mv.up{ color:var(--good); } .lg2 .mv.dn{ color:var(--danger); } .lg2 .mv.sm{ color:var(--line-soft); }',

      '.lg2 .r-crew{ display:flex; align-items:center; gap:8px; min-width:0; padding-left:2px; }',
      '.lg2 .r-emblem{ width:30px; height:30px; border-radius:50%; flex:0 0 auto; display:grid; place-items:center; font-family:var(--display); font-size:15px; color:#11202a; box-shadow:0 0 0 2px #00000022,0 0 0 3px #ffffff70; position:relative; overflow:hidden; }',
      '.lg2 .r-emblem img{ position:absolute; inset:0; width:100%; height:100%; object-fit:cover; }',
      '.lg2 .r-meta{ min-width:0; }',
      '.lg2 .r-nm{ font-family:var(--display); font-weight:400; letter-spacing:.3px; font-size:15px; line-height:1.05; color:var(--ink); white-space:nowrap; overflow:hidden; text-overflow:ellipsis; display:flex; align-items:center; gap:5px; }',
      '.lg2 .r-nm .crown{ color:var(--gold-d); flex:0 0 auto; }',
      '.lg2 .r-nm .nmtx{ overflow:hidden; text-overflow:ellipsis; }',
      '.lg2 .you-tag{ font-family:var(--body); font-weight:800; font-size:8px; letter-spacing:.5px; color:#fff; background:var(--gold-d); padding:1px 5px; border-radius:4px; flex:0 0 auto; }',
      '.lg2 .r-mgr{ font-size:10px; color:var(--ink-2); margin-top:1px; white-space:nowrap; overflow:hidden; text-overflow:ellipsis; }',
      '.lg2 .r-mgr .ai{ color:var(--muted); font-weight:700; font-size:9px; }',

      '.lg2 .r-form{ display:flex; gap:3px; margin-top:4px; }',
      '.lg2 .fp{ width:14px; height:14px; border-radius:4px; display:grid; place-items:center; font-family:var(--body); font-weight:800; font-size:8.5px; color:#fff; }',
      '.lg2 .fp.w{ background:var(--good); } .lg2 .fp.d{ background:var(--line-soft); } .lg2 .fp.l{ background:var(--danger); }',

      '.lg2 .r-bty{ text-align:center; font-variant-numeric:tabular-nums; font-weight:700; font-size:12px; color:var(--gold-d); white-space:nowrap; }',
      '.lg2 .r-stat{ text-align:center; font-variant-numeric:tabular-nums; font-weight:600; font-size:13px; color:var(--ink-2); }',
      '.lg2 .r-stat.w{ color:var(--good); } .lg2 .r-stat.l{ color:var(--danger); }',
      '.lg2 .r-formcol{ display:none; gap:3px; justify-content:center; overflow:hidden; }',
      '.lg2 .r-pts{ text-align:center; font-family:var(--display); font-weight:400; font-size:18px; line-height:1; color:var(--gold-d); }',
      '.lg2 .r-wdl{ display:none; }',

      '.lg2 .chev{ position:absolute; right:3px; top:50%; transform:translateY(-50%); color:var(--line-soft); opacity:.7; transition:transform .15s; }',
      '.lg2 .trow.open .chev{ transform:translateY(-50%) rotate(90deg); }',
      '.lg2 .r-detail{ display:none; padding:8px 12px 10px 40px; border-bottom:1px solid var(--line-soft); background:#1d68860d; }',
      '.lg2 .trow.open + .r-detail{ display:flex; align-items:center; flex-wrap:wrap; gap:6px 14px; }',
      '.lg2 .r-detail .d-it{ display:inline-flex; align-items:center; gap:5px; font-size:11.5px; color:var(--ink-2); }',
      '.lg2 .r-detail .d-it b{ color:var(--ink); font-weight:700; }',
      '.lg2 .r-detail .d-it .lab{ color:var(--muted); }',
      '.lg2 .r-detail .d-bounty b{ color:var(--gold-d); }',
      '.lg2 .r-detail .d-link{ margin-left:auto; display:inline-flex; align-items:center; gap:4px; font-weight:700; font-size:11px; color:var(--sea-light); cursor:pointer; }',

      '.lg2 .lg-soft{ color:var(--ink-2); padding:18px 14px; text-align:center; }',
      '.lg2 .lg-err{ color:var(--danger); padding:14px; }',

      /* ---- WIDE (landscape): # · Crew · ☠ · W · G · V · Form · Pts ---- */
      '@container (min-width:560px){',
      '  .lg2 #lg-body{ --cols: 46px minmax(0,1fr) 70px 30px 30px 30px 0px 54px; }',
      '  .lg2 #lg-body.has-form{ --cols: 46px minmax(0,1fr) 70px 30px 30px 30px 110px 54px; }',
      '  .lg2 .board-head{ padding:11px 14px 7px; }',
      '  .lg2 .thead span{ font-size:10px; }',
      '  .lg2 .thead .h-wide{ display:block; }',
      '  .lg2 .trow{ padding:9px 4px; gap:7px; }',
      '  .lg2 .r-rank{ font-size:18px; }',
      '  .lg2 .r-emblem{ width:34px; height:34px; font-size:16px; }',
      '  .lg2 .r-nm{ font-size:16px; }',
      '  .lg2 .r-mgr{ font-size:11.5px; }',
      '  .lg2 .r-bty{ font-size:13px; }',
      '  .lg2 .r-stat{ font-size:14px; }',
      '  .lg2 .r-pts{ font-size:21px; }',
      '  .lg2 .r-form{ display:none; }',
      '  .lg2 .r-formcol{ display:flex; }',
      '  .lg2 .r-wdl{ display:block; }',
      '  .lg2 .head-top, .lg2 .thead{ margin-left:4px; margin-right:4px; }',
      '}',
    ].join("\n");
    document.head.appendChild(s);
  }

  /* ---------------- vul-hoogte (zoals de markt) ---------------- */
  function fitHeight(){
    var c = content(); var m = c ? c.querySelector(".lg2") : null;
    if (!m) return;
    var top = m.getBoundingClientRect().top;
    m.style.height = Math.max(320, window.innerHeight - top) + "px";
  }

  /* ---------------- entry ---------------- */
  window.cmOpenCompetition = function (worldId){
    worldId = worldId || window.cmCurrentWorldId;
    if (!worldId){ if (typeof window.cmOpenWorlds === "function") window.cmOpenWorlds(); return; }
    L.id = worldId;
    window.cmCurrentWorldId = worldId;
    injectCss();
    activateScreen("screen-competition");
    document.body.classList.remove("gh-active");
    document.body.classList.remove("md-active");
    content().innerHTML = '<div class="lg2"><div id="lg-tb"></div><div id="lg-body" class="loading">' + loader("Reading the standings") + '</div></div>';
    fitHeight();
    if (!window.__lgFit){ window.__lgFit = true;
      window.addEventListener("resize", fitHeight);
      window.addEventListener("orientationchange", function(){ setTimeout(fitHeight, 150); });
    }
    fetchCore().then(function(){ mountTopbar(); paintBody(); fitHeight(); })
      .catch(function (e){
        content().innerHTML = '<div class="lg2"><div id="lg-tb"></div><div id="lg-body"><div class="lg-err">' + esc(e.message || "Could not load the standings.") + '</div></div></div>';
        mountTopbar(); fitHeight();
      });
  };

  /* ---------------- data ---------------- */
  async function fetchCore(){
    var w = null;
    try { var r = await Api.getWorld(L.id); w = (r && r.world) ? r.world : r; } catch (e){ w = null; }
    L.world = w || {};

    var st = [];
    try { var s = await Api.worldStandings(L.id); st = (s && s.standings) || []; } catch (e){ st = []; }
    L.standings = st;

    // kapiteins voor het tik-detail (optioneel; faalt stil)
    L.capByCrew = {};
    try {
      if (typeof Api.getLeague === "function"){
        var lg = await Api.getLeague(L.id);
        (lg && lg.crews || []).forEach(function (c){ if (c && c.crewName) L.capByCrew[c.crewName] = c.captain; });
      }
    } catch (e){ /* geen kapiteins -> detail toont ze gewoon niet */ }

    L.hasBounty = st.some(function (m){ return m.bounty != null; });
    L.hasMove   = st.some(function (m){ return (m.move != null) || (m.prevRank != null); });
    L.hasForm   = st.some(function (m){ return Array.isArray(m.form) && m.form.length; });
  }

  /* ---------------- topbar (cmTopbar sub-modus) ---------------- */
  function seasonSub(){
    var w = L.world || {};
    if (w.status === "active") return "Season 1 \u00b7 Day " + (w.currentDay || 1) + (w.totalDays ? (" of " + w.totalDays) : "");
    if (w.status === "finished") return "Season finished";
    return "Waiting to start";
  }
  function mountTopbar(){
    var host = el("lg-tb"); if (!host) return;
    var title = (L.world && L.world.name) ? L.world.name : "League table";
    if (window.cmTopbar && cmTopbar.mount){
      cmTopbar.mount(host, L.id, {
        title: title,
        sub: seasonSub(),
        onBack: function(){ if (window.cmOpenLeague) cmOpenLeague(L.id); }
      });
    } else {
      host.innerHTML = '<div class="lg-fbhead" style="display:flex;align-items:center;gap:10px;padding:11px 12px;color:var(--parch-3)">' +
        '<button class="lg-fbback" type="button" aria-label="Back" style="background:#ffffff14;border:0;color:inherit;width:34px;height:34px;border-radius:9px;cursor:pointer">\u2190</button>' +
        '<div><div style="font-family:var(--display);font-size:18px">' + esc(title) + '</div><div style="font-size:12px;color:#bcd3da">' + esc(seasonSub()) + '</div></div></div>';
      var b = host.querySelector(".lg-fbback"); if (b) b.onclick = function(){ if (window.cmOpenLeague) cmOpenLeague(L.id); };
    }
  }

  /* ---------------- helpers ---------------- */
  var CROWN = '<svg class="crown" viewBox="0 0 24 24" width="13" height="13" fill="currentColor"><path d="M3 7l4 4 5-7 5 7 4-4-2 12H5L3 7z"/></svg>';
  var CHEV  = '<svg viewBox="0 0 24 24" width="13" height="13" fill="none" stroke="currentColor" stroke-width="2.4" stroke-linecap="round" stroke-linejoin="round"><path d="M9 18l6-6-6-6"/></svg>';

  function moveOf(m){
    var v = (m.move != null) ? m.move : (m.prevRank != null ? (m.prevRank - m.rank) : 0);
    if (v > 0) return '<span class="mv up">\u25B2</span>';
    if (v < 0) return '<span class="mv dn">\u25BC</span>';
    return '<span class="mv sm">\u2013</span>';
  }
  function formDots(arr){
    return (arr || []).slice(-5).map(function (r){
      var k = (r === "W") ? "w" : (r === "L") ? "l" : "d";
      return '<span class="fp ' + k + '">' + esc(r) + '</span>';
    }).join("");
  }
  function btyOrPlayed(m){
    if (L.hasBounty) return '<div class="r-bty">\u2620 ' + shortB(m.bounty) + '</div>';
    return '<div class="r-bty" style="color:var(--ink-2);font-weight:600">' + (m.played != null ? m.played : ((m.won||0)+(m.drawn||0)+(m.lost||0))) + '</div>';
  }

  function rowHtml(m){
    var inZone  = m.rank <= QUALIFY;
    var zoneEnd = (m.rank === QUALIFY) && (QUALIFY < L.standings.length);
    var cls = "trow" + (m.isMe ? " you" : "") + (inZone ? " qz" : "") + (zoneEnd ? " zone-end" : "");
    var mgr = (m.username === "AI" || !m.username) ? '<span class="ai">AI</span>' : esc(m.username);

    var html = '<div class="' + cls + '" data-rank="' + m.rank + '">' +
      '<div class="r-pos"><span class="r-rank">' + m.rank + '</span>' + (L.hasMove ? moveOf(m) : '') + '</div>' +
      '<div class="r-crew"><span class="r-emblem" style="background:' + colOf(m.crewName) + '">' + iniOf(m.crewName) +
        (window.CrewCard ? CrewCard.photoTag(m.crewName) : "") + '</span>' +
        '<div class="r-meta">' +
          '<div class="r-nm">' + (m.rank === 1 ? CROWN : '') + '<span class="nmtx">' + esc(m.crewName) + '</span>' + (m.isMe ? '<span class="you-tag">YOU</span>' : '') + '</div>' +
          '<div class="r-mgr">' + mgr + '</div>' +
          (L.hasForm ? ('<div class="r-form">' + formDots(m.form) + '</div>') : '') +
        '</div></div>' +
      btyOrPlayed(m) +
      '<div class="r-stat w r-wdl">' + (m.won || 0) + '</div>' +
      '<div class="r-stat r-wdl">' + (m.drawn || 0) + '</div>' +
      '<div class="r-stat l r-wdl">' + (m.lost || 0) + '</div>' +
      '<div class="r-formcol">' + (L.hasForm ? formDots(m.form) : '') + '</div>' +
      '<div class="r-pts">' + (m.points || 0) + '</div>' +
      '<span class="chev">' + CHEV + '</span>' +
    '</div>';

    // tik-detail
    var cap = L.capByCrew[m.crewName];
    html += '<div class="r-detail">' +
      (cap ? '<span class="d-it"><span class="lab">Captain</span> <b>' + esc(cap) + '</b></span>' : '') +
      (L.hasBounty ? '<span class="d-it d-bounty"><span class="lab">\u2620 Bounty</span> <b>' + shortB(m.bounty) + '</b></span>' : '') +
      '<span class="d-it"><span class="lab">Record</span> <b>' + (m.won||0) + 'W \u00b7 ' + (m.drawn||0) + 'D \u00b7 ' + (m.lost||0) + 'L</b></span>' +
      '<span class="d-link" data-link="matchdays">Matchups ' + CHEV + '</span>' +
    '</div>';
    return html;
  }

  /* ---------------- paint ---------------- */
  function paintBody(){
    var body = el("lg-body"); if (!body) return;
    body.classList.remove("loading");
    body.classList.toggle("has-form", L.hasForm);

    var st = L.standings;
    if (!st.length){
      body.innerHTML = '<div class="lg-soft">No standings yet \u2014 they appear once the season is underway.</div>';
      return;
    }

    var btyHead = L.hasBounty ? '<span class="h-bty">\u2620</span>' : '<span class="h-bty" style="color:var(--ink-2)">P</span>';
    var head =
      '<div class="board-head">' +
        '<div class="head-top"><span class="cap">' + st.length + ' crews</span>' +
          '<button class="matchlink" type="button" data-link="matchdays">Matchdays ' + CHEV + '</button>' +
        '</div>' +
        '<div class="thead"><span class="h-pos">#</span><span class="h-crew">Crew</span>' +
          btyHead +
          '<span class="h-wide r-wdl">W</span><span class="h-wide r-wdl">G</span><span class="h-wide r-wdl">V</span>' +
          '<span class="h-wide">' + (L.hasForm ? 'Form' : '') + '</span>' +
          '<span class="h-pts">Pts</span></div>' +
      '</div>';

    var rows = "";
    st.forEach(function (m){
      rows += rowHtml(m);
      if (m.rank === QUALIFY && QUALIFY < st.length){
        rows += '<div class="zone-cap"><span>\u2693 Top ' + QUALIFY + ' qualify for the Grand Tournament</span></div>';
      }
    });

    body.innerHTML = head + '<div class="tbl">' + rows + '</div>';

    // tik-op-crew -> detail (één tegelijk)
    body.querySelectorAll(".trow").forEach(function (r){
      r.addEventListener("click", function (e){
        if (e.target.closest("[data-link]")) return;  // links niet als rij-tik
        var wasOpen = r.classList.contains("open");
        body.querySelectorAll(".trow.open").forEach(function (o){ o.classList.remove("open"); });
        if (!wasOpen) r.classList.add("open");
      });
    });
    // Matchdays -> bestaande day-carousel
    body.querySelectorAll('[data-link="matchdays"]').forEach(function (b){
      b.addEventListener("click", function (e){
        e.stopPropagation();
        if (typeof window.cmOpenMatchday === "function") window.cmOpenMatchday(L.id);
        else if (typeof window.cmOpenLeague === "function") window.cmOpenLeague(L.id);
      });
    });
  }
})();