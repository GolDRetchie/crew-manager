"use strict";

/* ====================================================================
   mp-chest.js — treasure-chest pack-opening (Stijl-B kist)

   Plek:  crew-manager/mp-chest.js
   Laden: in index.html ná mp-missions.js:
       <script src="mp-chest.js"></script>
   CSS:   blok onderaan mp-online.css (zie de bijgeleverde toevoeging).

   Publieke API (mp-missions.js gebruikt deze automatisch via revealRewards):
       window.cmRevealRewards(granted, bonusGranted, onDone)
         - bouwt packs uit granted + bonusGranted en speelt ze af
       window.cmOpenPacks(packs, onDone)
         - packs = [{ tier:"bronze|silver|gold", items:[ ...granted ] }, ...]

   granted-item-vormen (zoals de server ze geeft):
     { type:"berries", amount }
     { type:"xp", amount }
     { type:"card", kind:"role_card", value, rarity }
     { type:"card", kind:"crew_card", value, rarity, data:{p,d,s,role,name} }
     { type:"stamina", amount, value }
   Niets in localStorage; alles in geheugen.
   ==================================================================== */

(function () {
  var TIER = {
    bronze:{ metal:"#b3713a", hi:"#d99a5e", d:"#6f4420" },
    silver:{ metal:"#93a6b3", hi:"#e8eef2", d:"#5f7382" },
    gold:  { metal:"#d99a1f", hi:"#f4cf6a", d:"#9a6b1e" }
  };
  var TIER_SCALE = { bronze:1, silver:1.12, gold:1.26 };
  var RARITY_COL = { bronze:"#b3713a", silver:"#7f97a6", gold:"#d99a1f", legendary:"#9b3f8c", crew:"#9b3f8c", stamina:"#2e7d5b" };
  var TAPS_NEEDED = 4;

  var COIN  = '<svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="1.6" stroke-linecap="round" stroke-linejoin="round"><ellipse cx="9" cy="7" rx="5.5" ry="2.6"/><path d="M3.5 7v4c0 1.4 2.5 2.6 5.5 2.6s5.5-1.2 5.5-2.6V7"/><ellipse cx="15" cy="15" rx="5.5" ry="2.6"/><path d="M9.5 15v2c0 1.4 2.5 2.6 5.5 2.6s5.5-1.2 5.5-2.6v-4"/></svg>';
  var XPIC  = '<svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="1.8" stroke-linecap="round" stroke-linejoin="round"><path d="M12 3l2.6 5.3 5.8.8-4.2 4.1 1 5.8L12 18.3 6.8 19l1-5.8L3.6 9.1l5.8-.8z"/></svg>';
  var ROLEIC= '<svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="1.7" stroke-linecap="round" stroke-linejoin="round"><path d="M12 3l7 3v5c0 4.2-2.9 7.4-7 8.6C7.9 18.4 5 15.2 5 11V6z"/><path d="M9.2 11.6l2 2 3.6-4"/></svg>';
  var STAMIC= '<svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="1.7" stroke-linecap="round" stroke-linejoin="round"><path d="M13 2L4.5 13.5H11l-1 8.5L19.5 10H13z"/></svg>';
  var SKULL = '<svg viewBox="0 0 24 24" fill="none" stroke="#bcd2da" stroke-width="1.4"><path d="M12 3c-4.4 0-8 3.2-8 7.4 0 2.6 1.4 4.3 3 5.2V19h2v-2h2v2h2v-2h2v2h2v-3.4c1.6-.9 3-2.6 3-5.2C20 6.2 16.4 3 12 3z"/><circle cx="9" cy="11" r="1.6" fill="#bcd2da" stroke="none"/><circle cx="15" cy="11" r="1.6" fill="#bcd2da" stroke="none"/></svg>';

  function ini(s){ return (s || "?").trim().charAt(0).toUpperCase(); }
  function fmtBerries(n){ return n >= 1000 ? (Math.round(n / 1000) + "K") : String(n); }
  function esc(s){ return (typeof escapeHtml === "function") ? escapeHtml(s) : String(s == null ? "" : s); }

  /* ---- DOM (lazy: bouwt de overlay één keer en hergebruikt 'm) ---- */
  var dom = null;
  function build(){
    if (dom) return dom;
    var ov = document.createElement("div");
    ov.className = "pk-overlay";
    ov.innerHTML =
      '<div class="pk-amb"></div>' +
      '<div class="pk-stage">' +
        '<button class="pk-skip" type="button">Skip</button>' +
        '<div class="pk-tapwrap">' +
          '<div class="pk-glow"></div><div class="pk-glow2"></div>' +
          '<div class="pk-flash"></div><div class="pk-burst"></div>' +
          '<div class="pk-chest"></div>' +
          '<div class="pk-hint">Tap to open</div>' +
        '</div>' +
        '<div class="pk-reveal"></div>' +
        '<div class="pk-summary"></div>' +
      '</div>';
    document.body.appendChild(ov);
    dom = {
      ov: ov,
      amb: ov.querySelector(".pk-amb"),
      stage: ov.querySelector(".pk-stage"),
      skip: ov.querySelector(".pk-skip"),
      tapwrap: ov.querySelector(".pk-tapwrap"),
      flash: ov.querySelector(".pk-flash"),
      burst: ov.querySelector(".pk-burst"),
      chest: ov.querySelector(".pk-chest"),
      hint: ov.querySelector(".pk-hint"),
      reveal: ov.querySelector(".pk-reveal"),
      summary: ov.querySelector(".pk-summary")
    };
    // input
    dom.chest.addEventListener("pointerdown", function (e){ e.preventDefault(); if (!S.busy) onChestTap(); });
    dom.stage.addEventListener("pointerdown", function (e){
      if (e.target.closest(".pk-skip")) return;
      if (e.target.closest(".pk-chest")) return;
      if (S.waiting) nextReward();
    });
    dom.skip.addEventListener("click", function (e){
      e.stopPropagation();
      S.allGranted = [];
      for (var i = S.idx; i < S.packs.length; i++) S.allGranted = S.allGranted.concat(S.packs[i].items || []);
      S.idx = S.packs.length - 1;
      dom.tapwrap.style.display = "none";
      dom.reveal.className = "pk-reveal"; dom.reveal.innerHTML = "";
      showSummary();
    });
    return dom;
  }

  function setTier(tier){
    var t = TIER[tier] || TIER.gold;
    var s = dom.ov.style;
    s.setProperty("--metal", t.metal); s.setProperty("--metal-hi", t.hi);
    s.setProperty("--metal-d", t.d);  s.setProperty("--tier", t.metal);
  }
  function setGlow(v){ dom.ov.style.setProperty("--g", v); }

  /* ---- Stijl-B kist ---- */
  function chestSVG(){
    return '<svg viewBox="0 0 110 124" xmlns="http://www.w3.org/2000/svg">' +
      '<ellipse cx="55" cy="114" rx="42" ry="7" fill="rgba(0,0,0,.4)"/>' +
      '<rect x="16" y="58" width="78" height="48" rx="4" fill="var(--wood)" stroke="var(--wood-d)" stroke-width="2"/>' +
      '<path d="M18 82 H92 M18 94 H92" stroke="var(--wood-d)" stroke-width="1.3" opacity=".4"/>' +
      '<path d="M13 58 V50 C13 44 17 40 23 40 H87 C93 40 97 44 97 50 V58 Z" fill="var(--wood-hi)" stroke="var(--wood-d)" stroke-width="2"/>' +
      '<g class="pk-seam">' +
        '<rect x="13" y="46" width="84" height="7" rx="2" fill="var(--metal)" stroke="var(--metal-d)" stroke-width="1"/>' +
        '<rect x="14" y="68" width="82" height="8" rx="2" fill="var(--metal)" stroke="var(--metal-d)" stroke-width="1"/>' +
        '<rect x="14" y="97" width="82" height="8" rx="2" fill="var(--metal)" stroke="var(--metal-d)" stroke-width="1"/>' +
      '</g>' +
      '<g fill="var(--metal-d)"><circle cx="20" cy="49.5" r="1.4"/><circle cx="90" cy="49.5" r="1.4"/>' +
        '<circle cx="20" cy="72" r="1.4"/><circle cx="90" cy="72" r="1.4"/><circle cx="20" cy="101" r="1.4"/><circle cx="90" cy="101" r="1.4"/></g>' +
      '<path d="M50 53 a5 5 0 0 1 10 0 v4" fill="none" stroke="var(--metal-d)" stroke-width="2.6"/>' +
      '<rect x="46.5" y="56" width="17" height="14" rx="2.5" fill="var(--metal-hi)" stroke="var(--metal-d)" stroke-width="1.3"/>' +
      '<circle cx="55" cy="62" r="2" fill="var(--wood-d)"/><path d="M55 63.4 l-1.6 4.2h3.2z" fill="var(--wood-d)"/>' +
      '</svg>';
  }

  /* ---- state ---- */
  var S = { packs:[], idx:0, onDone:null, taps:0, busy:false, allGranted:[], queue:[], qi:0, waiting:false };

  function reset(){
    dom.reveal.className = "pk-reveal"; dom.reveal.innerHTML = "";
    dom.summary.className = "pk-summary"; dom.summary.innerHTML = "";
    dom.tapwrap.style.display = "flex";
    dom.stage.className = "pk-stage";
    dom.burst.innerHTML = "";
    setGlow(0);
    dom.chest.className = "pk-chest"; dom.chest.innerHTML = chestSVG();
    dom.hint.style.display = "";
  }

  function startPack(){
    S.taps = 0; S.busy = false; S.waiting = false;
    reset();
    var pack = S.packs[S.idx];
    setTier(pack.tier);
    var cs = TIER_SCALE[pack.tier] || 1;
    dom.chest.style.setProperty("--cs", cs);
    dom.chest.style.transform = "scale(" + cs + ")";
    dom.hint.textContent = "Tap to open";
    buildAmbient(pack.tier);
    requestAnimationFrame(function (){ dom.ov.classList.add("dim"); });
  }

  function buildAmbient(){
    var box = dom.amb; box.innerHTML = "";
    for (var i = 0; i < 14; i++){
      var s = document.createElement("i");
      s.style.left = (4 + Math.random() * 92) + "%";
      s.style.animationDuration = (5 + Math.random() * 5) + "s";
      s.style.animationDelay = (-Math.random() * 6) + "s";
      s.style.transform = "scale(" + (0.6 + Math.random() * 1.6) + ")";
      box.appendChild(s);
    }
  }

  /* ---- tikken om te openen: gloed groeit per tik ---- */
  function onChestTap(){
    if (S.busy) return;
    S.taps++;
    setGlow(S.taps / TAPS_NEEDED);
    var chest = dom.chest;
    chest.classList.remove("bump"); void chest.offsetWidth; chest.classList.add("bump");
    if (S.taps >= 2) chest.classList.add("idle");
    dom.hint.textContent = S.taps >= TAPS_NEEDED ? "" : "Keep tapping!";
    if (S.taps >= TAPS_NEEDED) openChest();
  }

  function openChest(){
    S.busy = true;
    var chest = dom.chest;
    chest.classList.remove("idle", "bump");
    burst();
    dom.flash.classList.add("go");
    chest.classList.add("pop");
    setTimeout(function (){
      dom.tapwrap.style.display = "none";
      dom.flash.classList.remove("go");
      beginReveal(S.packs[S.idx].items || []);
    }, 430);
  }

  function burst(){
    var box = dom.burst; box.innerHTML = "";
    var N = 24;
    for (var i = 0; i < N; i++){
      var p = document.createElement("i");
      var ang = (Math.PI * 2) * (i / N) + Math.random() * 0.5;
      var dist = 90 + Math.random() * 130;
      var dx = Math.cos(ang) * dist, dy = Math.sin(ang) * dist - 30;
      p.animate([
        { transform:"translate(0,0) scale(1)", opacity:1 },
        { transform:"translate(" + dx + "px," + dy + "px) scale(0)", opacity:0 }
      ], { duration:700 + Math.random() * 300, easing:"cubic-bezier(.2,.7,.3,1)", fill:"forwards" });
      box.appendChild(p);
    }
  }

  /* ---- reveal: tik-voor-tik door de items ---- */
  function beginReveal(items){
    dom.reveal.className = "pk-reveal show"; dom.reveal.innerHTML = "";
    S.queue = items.slice().sort(function (a, b){ return rank(a) - rank(b); });
    S.qi = 0;
    S.allGranted = S.allGranted.concat(S.queue);
    nextReward();
  }
  function rank(it){ if (it.type === "berries") return 0; if (it.type === "xp") return 1; if (it.type === "stamina") return 2; return 3; }

  function nextReward(){
    S.waiting = false;
    removeNextHint();
    if (S.qi >= S.queue.length){ setTimeout(showSummary, 500); return; }
    var it = S.queue[S.qi++];
    if (it.type === "card") showCard(it);
    else showSimple(it);
  }

  function armNext(){
    if (S.qi >= S.queue.length){ setTimeout(showSummary, 550); return; }
    S.waiting = true;
    var h = document.createElement("div");
    h.className = "pk-next"; h.textContent = "Tap for next";
    dom.reveal.appendChild(h);
    requestAnimationFrame(function (){ h.classList.add("in"); });
  }
  function removeNextHint(){ var h = dom.reveal.querySelector(".pk-next"); if (h && h.parentNode) h.parentNode.removeChild(h); }

  function showSimple(it){
    var wrap = dom.reveal;
    var row = document.createElement("div");
    if (it.type === "berries"){
      row.className = "pk-loot berries";
      row.innerHTML = '<div class="pk-loot-ic">' + COIN + '</div><div class="pk-loot-main">' +
        '<div class="pk-loot-v">+0</div><div class="pk-loot-l">Berries</div></div>';
      wrap.appendChild(row);
      requestAnimationFrame(function (){ row.classList.add("in"); });
      countUp(row.querySelector(".pk-loot-v"), it.amount, function (){ armNext(); });
    } else if (it.type === "stamina"){
      row.className = "pk-loot stamina";
      row.innerHTML = '<div class="pk-loot-ic">' + STAMIC + '</div><div class="pk-loot-main">' +
        '<div class="pk-loot-v">+' + it.amount + '</div><div class="pk-loot-l">' + esc(it.value || "Stamina") + '</div></div>';
      wrap.appendChild(row);
      requestAnimationFrame(function (){ row.classList.add("in"); });
      setTimeout(armNext, 600);
    } else { // xp
      row.className = "pk-loot xp";
      row.innerHTML = '<div class="pk-loot-ic">' + XPIC + '</div><div class="pk-loot-main">' +
        '<div class="pk-loot-v">+' + it.amount + '</div><div class="pk-loot-l">Experience</div></div>';
      wrap.appendChild(row);
      requestAnimationFrame(function (){ row.classList.add("in"); });
      setTimeout(armNext, 550);
    }
  }

  function countUp(node, target, done){
    var dur = 1100, t0 = performance.now();
    function step(t){
      var k = Math.min(1, (t - t0) / dur);
      var eased = 1 - Math.pow(1 - k, 3);
      node.textContent = "+" + fmtBerries(Math.round((target * eased) / 5000) * 5000);
      if (k < 1) requestAnimationFrame(step);
      else { node.textContent = "+" + fmtBerries(target); if (done) setTimeout(done, 250); }
    }
    requestAnimationFrame(step);
  }

  function showCard(it){
    var rc = RARITY_COL[it.rarity] || "#d99a1f";
    var isCrew = it.kind === "crew_card";
    var rcls = "r-" + (it.rarity || "gold");
    var holder = document.createElement("div");
    holder.className = "pk-cardwrap " + rcls;
    holder.style.setProperty("--rc", rc);

    var artInner = isCrew ? '<div class="pk-av">' + ini(it.value) + '</div>' : '<div class="pk-badge">' + ROLEIC + '</div>';
    var ribbon = isCrew ? "Crew Card" : "Role Card";

    holder.innerHTML =
      '<div class="pk-card">' +
        '<div class="pk-face pk-back">' + SKULL + '</div>' +
        '<div class="pk-face pk-front">' +
          '<div class="pk-front-rib">' + ribbon + '</div>' +
          '<div class="pk-front-art">' + artInner + '</div>' +
          '<div class="pk-front-stats"></div>' +
          '<div class="pk-front-nm"></div>' +
          '<div class="pk-front-sub"></div>' +
        '</div>' +
      '</div>';
    dom.reveal.appendChild(holder);
    requestAnimationFrame(function (){ holder.classList.add("in"); });

    var card = holder.querySelector(".pk-card");
    var front = holder.querySelector(".pk-front");
    var stats = holder.querySelector(".pk-front-stats");
    var nm = holder.querySelector(".pk-front-nm");
    var sub = holder.querySelector(".pk-front-sub");

    setTimeout(function (){ card.classList.add("flip"); }, 320);
    setTimeout(function (){ front.classList.add("flare"); }, 720);

    if (isCrew){
      var d = it.data || {};
      // 1) P·D·S
      setTimeout(function (){
        stats.innerHTML = '<span class="pk-stat"><b>P</b> ' + d.p + '</span><span class="pk-stat"><b>D</b> ' + d.d + '</span><span class="pk-stat"><b>S</b> ' + d.s + '</span>';
        stats.classList.add("in");
      }, 1000);
      // 2) rol
      setTimeout(function (){ sub.textContent = (d.role || "Crewmate"); sub.classList.add("in"); }, 1650);
      // 3) naam
      setTimeout(function (){ nm.textContent = it.value; nm.classList.add("in"); }, 2200);
      setTimeout(armNext, 2850);
    } else {
      setTimeout(function (){
        nm.textContent = it.value; nm.classList.add("in");
        sub.textContent = it.rarity + " role"; sub.classList.add("in");
      }, 1000);
      setTimeout(armNext, 1650);
    }
  }

  /* ---- eindoverzicht ---- */
  function showSummary(){
    removeNextHint();
    dom.reveal.className = "pk-reveal"; dom.reveal.innerHTML = "";
    var more = (S.idx < S.packs.length - 1);
    var sum = dom.summary;
    var rows = S.allGranted.map(function (it){ return sumRow(it); }).join("");
    sum.innerHTML =
      '<div class="pk-sum-h">' + (more ? "Pack opened!" : "All done!") + '</div>' +
      '<div class="pk-sum-s">' + (more ? "Nice haul \u2014 one more pack waiting." : "Your loot has been added to your crew.") + '</div>' +
      '<div class="pk-sum-list">' + rows + '</div>' +
      '<button class="pk-cta" type="button">' +
        (more ? ("Open another (" + (S.packs.length - S.idx - 1) + " left)") : "Continue") + '</button>';
    sum.className = "pk-summary show";
    sum.querySelector(".pk-cta").addEventListener("click", function (){
      if (more){ S.idx++; S.allGranted = []; sum.className = "pk-summary"; startPack(); }
      else finish();
    });
  }

  function sumRow(it){
    if (it.type === "berries")
      return '<div class="pk-sum-item berries"><div class="ic">' + COIN + '</div><div class="tx"><div class="nm">+' + fmtBerries(it.amount) + ' Berries</div></div></div>';
    if (it.type === "xp")
      return '<div class="pk-sum-item xp"><div class="ic">' + XPIC + '</div><div class="tx"><div class="nm">+' + it.amount + ' XP</div></div></div>';
    if (it.type === "stamina")
      return '<div class="pk-sum-item stamina"><div class="ic">' + STAMIC + '</div><div class="tx"><div class="nm">' + esc(it.value || "Stamina") + '</div><div class="sub">Restores +' + it.amount + ' stamina</div></div></div>';
    if (it.kind === "crew_card"){
      var d = it.data || {};
      return '<div class="pk-sum-item crew"><div class="ic">' + ROLEIC + '</div>' +
        '<div class="tx"><div class="nm">' + esc(it.value) + '</div><div class="sub">Crew card \u00b7 ' + esc(d.role || "Crewmate") + ' \u00b7 P' + d.p + ' D' + d.d + ' S' + d.s + '</div></div>' +
        '<span class="rar" style="background:' + (RARITY_COL[it.rarity] || "#9b3f8c") + '">' + (it.rarity || "crew") + '</span></div>';
    }
    return '<div class="pk-sum-item role r-' + (it.rarity || "gold") + '"><div class="ic">' + ROLEIC + '</div>' +
      '<div class="tx"><div class="nm">' + esc(it.value) + '</div><div class="sub">Role card</div></div>' +
      '<span class="rar" style="background:' + (RARITY_COL[it.rarity] || "#d99a1f") + '">' + (it.rarity || "gold") + '</span></div>';
  }

  function finish(){
    var done = S.onDone;
    dom.ov.classList.remove("dim", "show");
    setTimeout(function (){ if (dom) dom.amb.innerHTML = ""; }, 500);
    if (typeof done === "function") done();
  }

  /* ---- packs uit een chest-tier afleiden voor losse granted-lijsten ---- */
  // We weten de tier niet altijd uit granted alleen; daarom kleurt cmRevealRewards
  // de hoofd-pack op basis van de "zwaarste" rarity erin, en bonus krijgt z'n eigen tier.
  function tierFromItems(items){
    var has = { gold:false, silver:false };
    items.forEach(function (it){
      if (it.type === "card" && (it.rarity === "gold" || it.kind === "crew_card")) has.gold = true;
      else if (it.type === "card" && it.rarity === "silver") has.silver = true;
      else if (it.type === "stamina" && it.amount >= 50) has.silver = true;
    });
    return has.gold ? "gold" : (has.silver ? "silver" : "bronze");
  }

  /* ---- public API ---- */
  window.cmOpenPacks = function (packs, onDone){
    if (!packs || !packs.length){ if (onDone) onDone(); return; }
    build();
    S.packs = packs; S.idx = 0; S.onDone = onDone || null; S.allGranted = [];
    dom.ov.classList.add("show");
    startPack();
  };

  // mp-missions.js roept dit aan via revealRewards()
  window.cmRevealRewards = function (granted, bonusGranted, onDone){
    granted = granted || []; bonusGranted = bonusGranted || [];
    var packs = [];
    if (granted.length) packs.push({ tier: tierFromItems(granted), items: granted });
    if (bonusGranted.length) packs.push({ tier: tierFromItems(bonusGranted), items: bonusGranted });
    if (!packs.length){ if (onDone) onDone(); return; }
    window.cmOpenPacks(packs, onDone);
  };
})();