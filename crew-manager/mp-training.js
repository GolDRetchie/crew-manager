"use strict";

/* ====================================================================
   Crew Manager — mp-training.js
   Online training grounds. Gebruikt de gedeelde cmTopbar (sub-modus,
   back -> league home) en een responsive, container-breedte-gestuurde
   body onder .tg-wrap. Plaatsen/annuleren/auto-fill draaien OPTIMISTIC:
   de UI update direct en de server-call gaat op de achtergrond (rollback
   bij fout) -> geen wachttijd meer per actie.

   Renders into #cp-content. window.cmOpenTraining(worldId).
   Depends on: Api, cmTopbar, colorFor / escapeHtml / fmtShort.
   ==================================================================== */

(function () {
  function el(id){ return document.getElementById(id); }
  function esc(s){ return (typeof escapeHtml === "function") ? escapeHtml(s) : String(s == null ? "" : s); }
  function content(){ return el("cp-content"); }
  function onScreen(){ var c = content(); return !!(c && c.querySelector(".tg-wrap")); }

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
  var SESSION_MS = 6 * 60 * 60 * 1000;   // 6u sessie (zelfde als server) — voor de optimistic countdown

  var T = { id: null, data: null, pending: null, timer: null };

  function stop(){ if (T.timer){ clearInterval(T.timer); T.timer = null; } }

  window.cmOpenTraining = function (worldId){
    T.id = worldId || T.id;
    T.pending = null;
    activateScreen("screen-competition");
    shell('<div class="tg-loading">Hitting the training grounds\u2026</div>', "Loading\u2026");
    load();
  };

  /* ---- gedeelde topbar (sub-modus) + body-wrapper ---- */
  function mountTopbar(sub){
    var host = el("tr-topbar");
    if (host && window.cmTopbar) {
      cmTopbar.mount(host, T.id, {
        title: "Training grounds",
        sub: sub,
        onBack: function (){ stop(); if (typeof window.cmOpenLeague === "function") window.cmOpenLeague(T.id); }
      });
    }
  }
  function shell(bodyHtml, sub){
    injectCss();
    content().innerHTML = '<div id="tr-topbar"></div><div class="tg-wrap">' + bodyHtml + '</div>';
    mountTopbar(sub);
  }

  async function load(){
    try { T.data = await Api.trainingStatus(T.id); }
    catch (e){ if (onScreen() || el("tr-topbar")) shell('<div class="tg-err">' + esc(e.message) + '</div>', ""); return; }
    render();
  }

  /* active trainings grouped by stat -> [{name, stat, endsAt}] */
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

  /* ---- open slots per stat ---- */
  function openByStat(){
    var b = bucket(), open = {};
    STATS.forEach(function (s){ open[s] = SLOTS_PER_STAT - (b[s] ? b[s].length : 0); });
    return open;
  }

  /* ---- optimistic helpers: lokaal toevoegen/verwijderen ---- */
  function addLocal(name, stat){
    var rec = { name: name, stat: stat, endsAt: new Date(Date.now() + SESSION_MS).toISOString() };
    T.data.active = (T.data.active || []).concat([rec]);
    return rec;
  }
  function removeLocal(name){
    var kept = [], gone = [];
    (T.data.active || []).forEach(function (a){ (a.name === name ? gone : kept).push(a); });
    T.data.active = kept;
    return gone;
  }

  /* ---- AUTO: ieder vrij crewlid in z'n laagste stat (P,D,S bij gelijkspel),
          overflow naar de volgende laagste met ruimte. Optimistic: alles
          meteen geplaatst, calls sequentieel op de achtergrond. ---- */
  async function autoFill(){
    var open = openByStat();
    var totalOpen = STATS.reduce(function (n, s){ return n + open[s]; }, 0);
    if (totalOpen <= 0){ toast("No open training slots \u2014 remove someone first."); return; }

    var avail = available();
    if (!avail.length){ toast("Everyone is already training."); return; }

    var ranked = avail.map(function (x){
      var order = STATS.slice().sort(function (a, c){
        return (x.st[a] - x.st[c]) || (STATS.indexOf(a) - STATS.indexOf(c));
      });
      return { name: x.n, order: order, done: false };
    });

    var plan = [];
    function take(name, stat){ if (open[stat] > 0){ open[stat]--; plan.push({ name: name, stat: stat }); return true; } return false; }
    ranked.forEach(function (r){ if (!r.done && take(r.name, r.order[0])) r.done = true; });
    ranked.forEach(function (r){ if (r.done) return; for (var k = 1; k < r.order.length; k++){ if (take(r.name, r.order[k])){ r.done = true; break; } } });

    if (!plan.length){ toast("No open training slots \u2014 remove someone first."); return; }

    // optimistic: meteen plaatsen + tonen
    T.pending = null;
    plan.forEach(function (p){ addLocal(p.name, p.stat); });
    render();
    toast("Auto-filled " + plan.length + (plan.length === 1 ? " crewmate" : " crewmates"));

    // server bijwerken (sequentieel = veilig voor slot-limieten); bij fout verzoenen
    try {
      for (var i = 0; i < plan.length; i++){ await Api.startTraining(T.id, plan[i].name, plan[i].stat); }
    } catch (e){
      toast(e.message || "Some couldn\u2019t be queued");
      if (onScreen()) await load();   // herlaad alleen bij fout -> echte staat terug
    }
  }

  function render(){
    injectCss();
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

    var open = openByStat();
    var totalOpen = STATS.reduce(function (n, s){ return n + open[s]; }, 0);
    var canAuto = totalOpen > 0 && avail.length > 0;

    var sub = (d.active ? d.active.length : 0) + "/" + (d.slotsTotal || 6) + " slots in training";

    var body =
      '<div class="tg-toolbar">' +
        '<button class="btn-gold-sm" id="tr-auto" type="button"' + (canAuto ? "" : " disabled") + '>Auto-fill lowest stat</button>' +
      '</div>' +
      '<p class="tg-intro">Tap a field slot then a crewmate \u2014 or a crewmate then a slot, or hit <b>Auto-fill</b> to put each crewmate in their lowest stat. Each session takes <b>6 hours</b> and adds +' +
        (d.gain || 3) + ' to that stat. Up to 2 per stat, 6 in total. Training runs even while you\u2019re away.</p>' +
      '<div class="tcols">' + cols + '</div>' +
      '<div class="tg-avail-t">Available crew</div>' +
      '<div class="tg-avail">' + chips + '</div>';

    content().innerHTML = '<div id="tr-topbar"></div><div class="tg-wrap">' + body + '</div>';
    mountTopbar(sub);

    var auto = el("tr-auto"); if (auto) auto.addEventListener("click", autoFill);

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
      if (refresh){ stop(); load(); }                 // training klaar -> herlaad (server kent +3 toe / queue schuift door)
    }, 1000);
  }

  /* ---- acties: optimistic, geen reload op de happy path ---- */
  async function startOne(name, stat){
    T.pending = null;
    addLocal(name, stat);
    render();                                          // direct zichtbaar
    try { await Api.startTraining(T.id, name, stat); } // server op de achtergrond
    catch (e){
      removeLocal(name);                               // rollback
      toast(e.message || "Couldn\u2019t start training");
      if (onScreen()) render();
    }
  }
  async function cancelOne(name){
    var gone = removeLocal(name);
    render();
    try { await Api.cancelTraining(T.id, name); }
    catch (e){
      T.data.active = (T.data.active || []).concat(gone); // rollback
      toast(e.message || "Couldn\u2019t cancel");
      if (onScreen()) render();
    }
  }

  /* ---- gescoopte, container-breedte-gestuurde body-CSS (eigen namespace,
          raakt styles.css / single-player training niet aan) ---- */
  function injectCss(){
    if (el("tg-styles")) return;
    var css = document.createElement("style"); css.id = "tg-styles";
    css.textContent = [
      ".tg-wrap{container-type:inline-size;padding:12px 12px 18px;}",
      ".tg-wrap .tg-loading,.tg-wrap .tg-err{padding:26px 14px;text-align:center;font-style:italic;color:var(--muted);font-size:14px;}",
      ".tg-wrap .tg-err{color:var(--danger);}",
      ".tg-wrap .tg-toolbar{display:flex;justify-content:flex-end;margin-bottom:10px;}",
      ".tg-wrap .tg-intro{font-size:13px;line-height:1.55;color:rgba(241,226,190,.85);margin:0 0 14px;max-width:64ch;}",
      ".tg-wrap .tg-intro b{color:var(--gold-hi);}",
      ".tg-wrap .tcols{display:grid;grid-template-columns:repeat(3,minmax(0,1fr));gap:8px;}",
      ".tg-wrap .tcol{display:flex;flex-direction:column;gap:7px;min-width:0;background:linear-gradient(180deg,var(--parch-3),var(--parch));border:1.5px solid var(--line-soft);border-radius:12px;padding:8px;box-shadow:0 2px 0 rgba(0,0,0,.12);}",
      ".tg-wrap .tcol-h{font-family:var(--display);letter-spacing:.4px;font-size:15px;text-align:center;color:#fff;border-radius:8px;padding:5px 4px;line-height:1;border:1.5px solid rgba(0,0,0,.2);}",
      ".tg-wrap .tcol-p{background:linear-gradient(180deg,#c0432f,var(--danger));}",
      ".tg-wrap .tcol-d{background:linear-gradient(180deg,#2a86ad,var(--sea-light));}",
      ".tg-wrap .tcol-s{background:linear-gradient(180deg,#2a8c63,#1f6f4a);}",
      ".tg-wrap .ts{border-radius:9px;font-size:12.5px;min-width:0;}",
      ".tg-wrap .ts.empty{display:flex;align-items:center;justify-content:center;text-align:center;min-height:46px;padding:6px;color:var(--muted);font-style:italic;border:1.5px dashed var(--line-soft);background:rgba(255,255,255,.25);cursor:pointer;}",
      ".tg-wrap .ts.empty:hover{background:rgba(255,255,255,.45);}",
      ".tg-wrap .ts.empty.pend{color:var(--ink);border-color:var(--gold-d);background:rgba(231,185,74,.22);font-style:normal;}",
      ".tg-wrap .ts.empty.ready{color:#1f6f4a;border-style:solid;border-color:#2a8c63;background:rgba(42,140,99,.16);font-style:normal;}",
      ".tg-wrap .ts.filled{display:grid;grid-template-columns:auto minmax(0,1fr) auto;grid-template-areas:'dot nm x' 'cd cd cd';gap:4px 7px;align-items:center;padding:7px 8px;border:1.5px solid var(--line-soft);background:#fff7e2;cursor:pointer;}",
      ".tg-wrap .ts-dot{grid-area:dot;width:10px;height:10px;border-radius:50%;flex:0 0 auto;}",
      ".tg-wrap .ts-nm{grid-area:nm;font-weight:600;color:var(--ink);white-space:nowrap;overflow:hidden;text-overflow:ellipsis;}",
      ".tg-wrap .ts-x{grid-area:x;color:var(--danger);font-weight:700;cursor:pointer;font-size:15px;line-height:1;padding:0 2px;}",
      ".tg-wrap .ts-cd{grid-area:cd;justify-self:start;font-family:var(--display);font-size:12px;letter-spacing:.3px;color:var(--gold-hi);background:var(--sea-deep);border:1px solid var(--gold-d);border-radius:7px;padding:1px 7px;white-space:nowrap;}",
      ".tg-wrap .tg-avail-t{font-family:var(--display);letter-spacing:.5px;font-size:16px;color:var(--parch);margin:16px 0 8px;}",
      ".tg-wrap .tg-avail{display:grid;grid-template-columns:repeat(auto-fill,minmax(118px,1fr));gap:8px;}",
      ".tg-wrap .av-chip{display:flex;align-items:center;gap:7px;min-width:0;text-align:left;cursor:pointer;background:linear-gradient(180deg,var(--parch-3),var(--parch-2));border:1.5px solid var(--line-soft);border-radius:10px;padding:7px 9px;color:var(--ink);}",
      ".tg-wrap .av-chip:hover{background:var(--parch-3);}",
      ".tg-wrap .av-chip.pend{border-color:var(--gold-d);background:rgba(231,185,74,.25);}",
      ".tg-wrap .av-dot{width:10px;height:10px;border-radius:50%;flex:0 0 auto;}",
      ".tg-wrap .av-nm{flex:1 1 auto;min-width:0;font-weight:600;font-size:13px;white-space:nowrap;overflow:hidden;text-overflow:ellipsis;}",
      ".tg-wrap .av-by{flex:0 0 auto;font-family:var(--display);font-size:12px;letter-spacing:.3px;color:var(--ink-2);}",
      ".tg-wrap .tg-empty{grid-column:1/-1;color:var(--muted);font-style:italic;font-size:13px;padding:6px 2px;}",
      "@container (min-width:560px){",
      "  .tg-wrap .tcols{gap:12px;}",
      "  .tg-wrap .tcol{padding:11px;gap:9px;}",
      "  .tg-wrap .tcol-h{font-size:16px;padding:6px;}",
      "  .tg-wrap .ts.empty{min-height:50px;font-size:13px;}",
      "  .tg-wrap .ts.filled{grid-template-columns:auto minmax(0,1fr) auto auto;grid-template-areas:'dot nm cd x';gap:8px;padding:8px 10px;}",
      "  .tg-wrap .ts-cd{justify-self:end;}",
      "  .tg-wrap .tg-avail{grid-template-columns:repeat(auto-fill,minmax(150px,1fr));}",
      "}"
    ].join("\n");
    document.head.appendChild(css);
  }
})();