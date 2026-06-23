"use strict";

/* ====================================================================
   Battle broadcast  (cinematic playback, commentary by Big News Morgan)
   ==================================================================== */
const battle = { save:null, timer:null, beats:[], idx:0, clock:0, res:"D" };

function spByName(name){
  const key = String(name).replace(/^Admiral /, "");
  const c = (typeof PIRATES !== "undefined") ? PIRATES.find(p => p.n === key) : null;
  return (c && Array.isArray(c.sp)) ? c.sp : [];
}
/* Special attacks unlock as a fighter grows. Higher sum = more moves.
   Each entry in sp[] is gated by the threshold at the same index. */
const SP_THRESHOLDS = [0, 36, 60, 90, 120, 150];
function availableSp(spArr, sum){
  if (!Array.isArray(spArr) || !spArr.length) return [];
  return spArr.filter((s, i) => s && String(s).trim() && (SP_THRESHOLDS[i] !== undefined ? SP_THRESHOLDS[i] : 999) <= sum);
}
function fightersOf(save, i){
  const cap = teamCaptain(save, i), cs = teamCapStats(save, i);
  const capSum = (cs && cs.p || 0) + (cs && cs.d || 0) + (cs && cs.s || 0);
  const list = [{ name: cap, sp: spByName(cap), s: cs ? cs.s : 8, sum: capSum }];
  if (i === 0){ DECK_ROLES.forEach(r => { const nm = save.lineup.deck[r]; if (nm){ const m = memberByName(save, nm); if (m) list.push({ name:nm, sp: spByName(nm), s: m.s, sum: (m.p||0)+(m.d||0)+(m.s||0) }); } }); }
  else teamMembers(save, i).forEach(m => list.push({ name:m.n, sp: spByName(m.n), s: m.s, sum: (m.p||0)+(m.d||0)+(m.s||0) }));
  return list;
}
function pick(arr){ return arr[Math.floor(Math.random() * arr.length)]; }

/* Detect a special-attack beat from its broadcast markup and pull out who/what/where.
   Direction + tint follow the ATTACKER's side (first tagged name); the per-attack
   effect comes from SP_FX in data-pirates.js: "fire", "smoke", or absent for none. */
function btSpecialInfo(text){
  if (!text || text.indexOf("<i>") < 0) return null;
  const atk = (text.match(/<i>([\s\S]*?)<\/i>/) || [])[1] || "";
  const names = []; const re = /<b class="bt-(you|opp)">([\s\S]*?)<\/b>/g; let m;
  while ((m = re.exec(text))) names.push({ side:m[1], name:m[2] });
  if (!names.length || !String(atk).trim()) return null;
  const map = (typeof window !== "undefined" && window.SP_FX) ? window.SP_FX : null;
  const fx = (map && map[atk]) ? map[atk] : "none";
  return { attack:atk, attacker:names[0].name, fromYou:names[0].side === "you", target:names[1] ? names[1].name : "", fx:fx };
}

function buildBattleScript(ctx){
  const openT = [
    "Big News Morgan here, live{ISL} &mdash; and we are underway!",
    "Welcome to the brawl{ISL}! Big News Morgan, calling every blow!",
    "The crews square off{ISL} &mdash; this is Big News Morgan!",
    "Steel is drawn{ISL}! Big News Morgan on the scene!"
  ];
  const strikeT = [" comes out swinging at ", " strikes at ", " lunges straight at ", " sets sights on ",
                   " charges in at ", " barrels into ", " unloads on ", " bears down on ", " swings hard at ",
                   " throws everything at ", " makes a move on ", " closes the distance on "];
  const downT   = [" has defeated ", " takes down ", " puts down ", " overpowers ", " lays out ",
                   " sends crashing down ", " knocks out cold ", " finishes off ", " gets the better of ",
                   " drops ", " hammers down ", " leaves no doubt against "];
  const clashT  = [" clashes with ", " trades a flurry of blows with ", " locks horns with ", " squares off against ",
                   " goes toe to toe with ", " grapples with ", " exchanges blows with ", " weaves around ",
                   " stands firm against ", " duels "];
  const capClashT = [
    "Captain against captain &mdash; {A} and {B} face off!",
    "The captains collide! {A} takes on {B}!",
    "{A} squares up to {B} &mdash; captain against captain!",
    "{A} and {B} lock eyes &mdash; a captain's duel!"
  ];
  const meanwhileT = [
    "Meanwhile, {A} lands an attack on {B}!",
    "Elsewhere on the deck, {A} goes after {B}!",
    "Across the deck, {A} takes the fight to {B}!"
  ];
  const finalT = [
    "{A} stands tall over {B} &mdash; the captain falls, it's over!",
    "{A} defeats Captain {B} &mdash; that is the match!",
    "One last blow &mdash; {A} takes down Captain {B}!",
    "{A} finishes Captain {B} &mdash; their crew is broken!"
  ];
  const spStrikeT = [
    "{A} unleashes <i>{BL}</i> on {B}!",
    "{A} hits {B} with <i>{BL}</i>!",
    "{A} lets it rip &mdash; <i>{BL}</i> slams into {B}!",
    "{A} calls out <i>{BL}</i> and catches {B}!"
  ];
  const spFinalT = [
    "{A} ends it with <i>{BL}</i> &mdash; Captain {B} goes down!",
    "<i>{BL}</i>! {A} takes down Captain {B} for the win!",
    "One final <i>{BL}</i> from {A} &mdash; Captain {B} is finished!"
  ];
  const navyToughT = [
    "{ADM} stands alone against the whole crew &mdash; and doesn't flinch!",
    "{ADM} squares up to the entire crew at once!",
    "One Marine, a whole pirate crew &mdash; and {ADM} isn't backing down!"
  ];
  const navyReelT = [
    "At last {ADM} is reeling &mdash; the crew's numbers tell!",
    "It took the whole crew, but {ADM} staggers!",
    "{ADM} can't hold them all off any longer!"
  ];

  // names are tagged by side: your crew green, the opposition red
  const yourNames = new Set(ctx.you.map(f => f.name));
  const tag    = (n) => (yourNames.has(n) ? '<b class="bt-you">' : '<b class="bt-opp">') + n + "</b>";
  const blowMap = {};
  ctx.you.concat(ctx.opp || []).forEach(f => { if (f && f.sp && f.sp.length){ const av = availableSp(f.sp, f.sum || 0); if (av.length) blowMap[f.name] = av; } });
  if (ctx.isNavy && ctx.admiral){ const a = spByName("Admiral " + ctx.admiral); if (a.length) blowMap["Admiral " + ctx.admiral] = a; }   // admirals: all moves unlocked
  const blowFor = (n) => (blowMap[n] && blowMap[n].length) ? pick(blowMap[n]) : null;
  // A full-takeover animation fires on every special, so keep them rare: at most
  // SP_MAX mid-fight specials (the finishing blow below is always allowed one).
  let spUsed = 0; const SP_MAX = 2;
  const strike = (A, B) => {
    const bl = blowFor(A);
    if (bl && spUsed < SP_MAX && Math.random() < 0.45){ spUsed++; return pick(spStrikeT).replace("{A}", tag(A)).replace("{B}", tag(B)).replace("{BL}", bl); }
    return tag(A) + pick(strikeT) + tag(B) + "!";
  };
  const speedMap = {};
  ctx.you.concat(ctx.opp || []).forEach(f => { if (f) speedMap[f.name] = (typeof f.s === "number" ? f.s : 8); });
  if (ctx.isNavy && ctx.admiral){ const a = (typeof PIRATES !== "undefined") ? PIRATES.find(p => p.n === ctx.admiral) : null; speedMap["Admiral " + ctx.admiral] = a ? a.s : 9; }
  const spd = (n) => (typeof speedMap[n] === "number" ? speedMap[n] : 8);
  const dodgeT = [
    "{B} is too quick &mdash; {A}'s attack whiffs!",
    "{B} slips clean past {A}'s strike!",
    "{B} reads it and dodges {A} completely!",
    "{A} swings &mdash; but {B} is already gone!"
  ];
  // flavor strike: a faster target VERY occasionally dodges
  const fstrike = (A, B) => {
    if (spd(B) > spd(A) && Math.random() < 0.12) return pick(dodgeT).replace("{A}", tag(A)).replace("{B}", tag(B));
    return strike(A, B);
  };
  const clash  = (A, B) => tag(A) + pick(clashT)  + tag(B) + "!";
  const downL  = (A, B) => tag(A) + pick(downT)   + tag(B) + "!";
  const T      = (arr, A, B) => pick(arr).replace("{A}", tag(A)).replace("{B}", tag(B));
  const finalBlow = (A, B) => { const bl = blowFor(A); return bl
    ? pick(spFinalT).replace("{A}", tag(A)).replace("{B}", tag(B)).replace("{BL}", bl)
    : T(finalT, A, B); };

  const isl = ctx.island ? " from " + ctx.island : "";
  const youSide = { cap: ctx.you[0].name, members: ctx.you.slice(1).map(f => f.name) };
  const oppSide = ctx.isNavy ? { cap: "Admiral " + ctx.admiral, members: [] }
                             : { cap: ctx.opp[0].name, members: ctx.opp.slice(1).map(f => f.name) };
  const youWins = ctx.res === "W";
  const winner = youWins ? youSide : oppSide;
  const loser  = youWins ? oppSide : youSide;

  const beats = [{ minute:0, kind:"open", text: pick(openT).replace("{ISL}", isl) }];
  let minute = 4;
  const adv    = () => { minute += 2 + Math.floor(Math.random() * 3); };
  const line   = (t) => { beats.push({ minute, text:t }); adv(); };
  const koPair = (A, B) => { beats.push({ minute, text: strike(A, B) }); minute += 2; beats.push({ minute, down:true, text: downL(A, B) }); adv(); };

  if (ctx.isNavy){
    const adm = oppSide.cap, yc = youSide.cap;
    const admTag = () => tag(adm);
    let mem = youSide.members.slice();
    line(T(capClashT, yc, adm));                                   // your captain opens against the admiral
    line(pick(navyToughT).replace("{ADM}", admTag()));             // the admiral takes on the whole crew at once
    if (youWins){
      let losses = mem.length >= 2 ? (1 + (Math.random() < 0.5 ? 1 : 0)) : 0;
      while (losses-- > 0 && mem.length){ const v = pick(mem); line(fstrike(v, adm)); line(fstrike(adm, v)); koPair(adm, v); mem = mem.filter(x => x !== v); }
      mem.slice(0, 3).forEach(m => line(fstrike(m, adm)));          // it takes several of the crew piling on
      if (mem.length) line(fstrike(adm, pick(mem)));                // the admiral is still swinging
      line(pick(navyReelT).replace("{ADM}", admTag()));
      line(T(capClashT, yc, adm));
      line(fstrike(adm, yc));
      beats.push({ minute, text: strike(yc, adm) }); minute += 2;
      beats.push({ minute, down:true, text: finalBlow(yc, adm) });
    } else {
      mem.slice(0, 3).forEach(m => line(fstrike(m, adm)));          // your crew lands hits first
      while (mem.length){ const v = pick(mem); line(clash(v, adm)); koPair(adm, v); mem = mem.filter(x => x !== v); }
      line(T(capClashT, adm, yc));
      line(fstrike(yc, adm));                                       // captain's defiant blow
      beats.push({ minute, text: strike(adm, yc) }); minute += 2;
      beats.push({ minute, down:true, text: finalBlow(adm, yc) });
    }
  } else {
    const wc = winner.cap, lc = loser.cap;
    let wMem = winner.members.slice(), lMem = loser.members.slice();
    // Phase 1 - the captains open the bout (both throw hands)
    line(T(capClashT, wc, lc));
    line(fstrike(lc, wc));                                  // the loser's captain lands an opener too
    if (Math.random() < 0.6) line(fstrike(wc, lc));
    // Phase 2 - "meanwhile" hands the spotlight to the crews
    if (lMem.length) line(T(meanwhileT, wMem.length ? pick(wMem) : wc, pick(lMem)));
    // Phase 3 - the crew melee: blows fly BOTH ways; every loser member falls, the winner loses a few
    let winnerLossesLeft = wMem.length ? Math.floor(Math.random() * wMem.length) : 0, guard = 0;
    while (lMem.length && guard++ < 140){
      if (Math.random() < 0.34){                            // flavor exchange from a random side
        const wA = wMem.length ? pick(wMem) : wc, lA = lMem.length ? pick(lMem) : lc;
        if (Math.random() < 0.5) line(clash(wA, lA));
        else if (Math.random() < 0.5) line(fstrike(lA, wA));   // loser side attacks
        else line(fstrike(wA, lA));                            // winner side attacks
        continue;
      }
      if (winnerLossesLeft > 0 && wMem.length && Math.random() < 0.4){
        const v = pick(wMem); koPair(pick(lMem), v); wMem = wMem.filter(x => x !== v); winnerLossesLeft--; continue;
      }
      const v = pick(lMem); koPair(wMem.length ? pick(wMem) : wc, v); lMem = lMem.filter(x => x !== v);
    }
    // Phase 4 - the captains return for the finish (loser captain fights back first)
    line(T(capClashT, wc, lc));
    line(fstrike(lc, wc));
    if (Math.random() < 0.5) line(clash(wc, lc));
    beats.push({ minute, text: strike(wc, lc) }); minute += 2;
    beats.push({ minute, down:true, text: finalBlow(wc, lc) });
  }

  const winName = youWins ? '<b class="bt-you">' + ctx.youName + '</b>' : '<b class="bt-opp">' + ctx.oppName + '</b>';
  beats.push({ minute: minute + 3, kind:"close", text: "That's the final bell &mdash; " + winName + " win the day!" });
  beats.sort((a, b) => a.minute - b.minute);
  return beats;
}

/* ---- fight report (shown after each of your matches) ---- */
function capturePlayerFighters(save){
  const cs = captainStatsOf(save);
  const out = [{ name:save.captain, cap:true, p:cs.p, d:cs.d, s:cs.s }];
  DECK_ROLES.forEach(r => { const nm = save.lineup.deck[r]; if (nm){ const m = memberByName(save, nm); if (m) out.push({ name:m.n, cap:false, p:m.p, d:m.d, s:m.s }); } });
  return out;
}
function buildMatchReport(save, pre){
  const res = playerMatchResult(save);
  const berry = res === "W" ? MATCH_YOU_WIN : MATCH_YOU_LOSS;
  const rows = [];
  pre.forEach(f => {
    const now = f.cap ? captainStatsOf(save) : memberByName(save, f.name);
    if (!now) return;
    if (now.p !== f.p || now.d !== f.d || now.s !== f.s)
      rows.push({ name:f.name, cap:f.cap, from:{ p:f.p, d:f.d, s:f.s }, to:{ p:now.p, d:now.d, s:now.s } });
  });
  return { res:res, berry:berry, rows:rows };
}
function showMatchReport(save, rep, after){
  const d = (lbl, a, b) => a === b ? '' : '<span class="fr-d">' + lbl + ' ' + a + '&rarr;<b>' + b + '</b></span>';
  const rows = rep.rows.map(r =>
    '<div class="fr-row"><span class="mk-av" style="background:' + colorFor(r.name) + '">' + initial(r.name) + '</span>' +
    '<span class="fr-nm">' + escapeHtml(r.name) + (r.cap ? ' <span class="fr-cap">(cpt)</span>' : '') + '</span>' +
    '<span class="fr-deltas">' + d('P', r.from.p, r.to.p) + d('D', r.from.d, r.to.d) + d('S', r.from.s, r.to.s) + '</span></div>'
  ).join("");
  const win = rep.res === "W", lose = rep.res === "L";
  const berryTxt = (rep.berry >= 0 ? '+' : '\u2212') + fmtShort(Math.abs(rep.berry)) + ' Berry';
  els.modalTitle.textContent = "Fight report";
  els.modalMsg.innerHTML =
    '<div class="fr-head"><span class="fr-badge ' + (win ? 'win' : lose ? 'lose' : '') + '">' +
      (win ? 'Victory' : lose ? 'Defeat' : 'Draw') + '</span>' +
      '<span class="fr-berry ' + (rep.berry >= 0 ? 'up' : 'down') + '">' + berryTxt + '</span></div>' +
    (rows ? '<div class="fr-sub">Your crew grew</div><div class="fr-list">' + rows + '</div>' : '<div class="fr-sub">No stat changes this fight.</div>');
  els.modalConfirm.textContent = "Continue"; els.modalConfirm.className = "btn-gold-sm";
  els.modalCancel.style.display = "none";
  els.overlay.classList.add("is-open"); els.overlay.setAttribute("aria-hidden", "false");
  const _frm = els.overlay.querySelector(".modal"); if (_frm) _frm.classList.add("wide");
  els.modalConfirm.onclick = () => { closeModal(); if (after) after(); };
  els.modalConfirm.focus();
}

/* ---- inbox / notifications ---- */
function pushInbox(save, type, text, action){
  save.inbox = save.inbox || [];
  save._inboxSeq = (save._inboxSeq || 0) + 1;
  save.inbox.unshift({ id:"m" + save._inboxSeq, day:save.day || 1, type:type, text:text, read:false, action:action || null });
  if (save.inbox.length > 60) save.inbox.length = 60;
}
/* Player-only progression checks: call after stat bumps to notify when a new sp unlocks
   or when a Crewmate has grown enough to earn a specialist role. */
function checkUnlocks(save, name, oldSum, newSum){
  const sp = spByName(name);
  if (!sp || !sp.length) return;
  for (let i = 1; i < sp.length && i < SP_THRESHOLDS.length; i++){
    const t = SP_THRESHOLDS[i];
    if (oldSum < t && newSum >= t && sp[i] && String(sp[i]).trim()){
      pushInbox(save, "info", "<b>" + escapeHtml(name) + "</b> learned <i>" + escapeHtml(sp[i]) + "</i>!");
      save._pendingUnlocks = save._pendingUnlocks || [];
      save._pendingUnlocks.push({ name: name, attack: sp[i] });
    }
  }
}
const ROLES_BY_STAT = { p:["Swordsman","Sniper"], d:["Helmsman","Shipwright","Doctor"], s:["Musician","Archaeologist","Chef"] };
function suggestRolesFor(stats){
  const out = [];
  stats.forEach(k => ROLES_BY_STAT[k].forEach(r => { if (out.indexOf(r) < 0) out.push(r); }));
  return out;
}
const PROMOTE_THRESHOLDS = [43, 63];   // first offer / one follow-up after a decline
function checkPromotion(save, m){
  if (!m || m.r !== "Crewmate") return;
  if ((save._pendingPromos || []).some(p => p.name === m.n)) return;   // already queued
  const offers = m.promoCount || 0;
  if (offers >= PROMOTE_THRESHOLDS.length) return;                      // out of chances
  const sum = (m.p || 0) + (m.d || 0) + (m.s || 0);
  if (sum < PROMOTE_THRESHOLDS[offers]) return;
  const declined = m.promoDeclined || [];
  const remaining = ["p","d","s"].filter(k => declined.indexOf(k) < 0);
  if (!remaining.length) return;
  let max = -1;
  remaining.forEach(k => { if ((m[k]||0) > max) max = (m[k]||0); });
  const stats = remaining.filter(k => (m[k]||0) === max);
  save._pendingPromos = save._pendingPromos || [];
  save._pendingPromos.push({ name: m.n, stats: stats });
}

/* ---- progression popups (unlocks + promotions) ----
   Triggered after fight (post fight-report) and after sail/rest. Skipped silently when nothing is pending. */
function showProgressPopups(save, done){ showUnlockPopup(save, () => showPromoPopup(save, done)); }

function showUnlockPopup(save, done){
  const list = save._pendingUnlocks || [];
  if (!list.length){ if (done) done(); return; }
  const byName = {};
  list.forEach(u => { (byName[u.name] = byName[u.name] || []).push(u.attack); });
  const rows = Object.keys(byName).map(name => {
    const newSet = {};
    byName[name].forEach(a => { newSet[a] = true; });
    const allSp = spByName(name);
    let sum = 0;
    if (name === save.captain){ const cs = save.captainStats; sum = (cs.p||0)+(cs.d||0)+(cs.s||0); }
    else { const m = (save.roster || []).find(x => x.n === name); if (m) sum = (m.p||0)+(m.d||0)+(m.s||0); }
    const pills = availableSp(allSp, sum).map(a => {
      const isNew = !!newSet[a];
      const bg = isNew ? "linear-gradient(180deg,#f4cf6a,#e7b94a)" : "#e9d8b2";
      const col = isNew ? "#3a2708" : "#9a7b4a";
      const br  = isNew ? "1.5px solid #9a6b1e" : "1px solid #b79a63";
      const star = isNew ? "&#9733; " : "";
      return '<span style="font-family:var(--display);font-size:13px;letter-spacing:.4px;padding:5px 12px;border-radius:14px;background:' + bg + ';color:' + col + ';border:' + br + ';display:inline-block;margin:2px 4px 2px 0">' + star + escapeHtml(a) + '</span>';
    }).join("");
    return '<div style="display:flex;align-items:flex-start;gap:12px;padding:10px 0;border-top:1px solid rgba(138,90,43,.25)">' +
      '<div style="width:38px;height:38px;border-radius:9px;background:' + colorFor(name) + ';display:flex;align-items:center;justify-content:center;color:#fff;font-family:var(--display);font-size:22px;box-shadow:inset 0 -3px 0 rgba(0,0,0,.22);flex:0 0 auto">' + initial(name) + '</div>' +
      '<div style="flex:1;min-width:0">' +
        '<div style="font-family:var(--display);font-size:18px;color:var(--ink);line-height:1.2;margin-bottom:6px;letter-spacing:.4px">' + escapeHtml(name) + '</div>' +
        '<div>' + pills + '</div>' +
      '</div></div>';
  }).join("");
  els.modalTitle.textContent = "New techniques!";
  els.modalMsg.innerHTML = '<p style="font-size:14px;color:var(--ink-2);margin:0 0 6px;font-style:italic">Day ' + (save.day || 1) + ' &mdash; your crew sharpened their skills</p>' + rows;
  els.modalConfirm.textContent = "Continue"; els.modalConfirm.className = "btn-gold-sm";
  els.modalCancel.style.display = "none";
  els.overlay.classList.add("is-open"); els.overlay.setAttribute("aria-hidden", "false");
  const _m = els.overlay.querySelector(".modal"); if (_m) _m.classList.add("wide");
  els.modalConfirm.onclick = () => {
    save._pendingUnlocks = [];
    persistSave(save);
    closeModal();
    if (done) done();
  };
  els.modalConfirm.focus();
}

function showPromoPopup(save, done){
  const list = save._pendingPromos || [];
  if (!list.length){ if (done) done(); return; }
  showPromoChoice(save, 0, done);
}
function showPromoChoice(save, idx, done){
  const list = save._pendingPromos || [];
  if (idx >= list.length){
    save._pendingPromos = [];
    persistSave(save);
    els.modalConfirm.style.display = "";       // restore default modal button visibility
    closeModal();
    if (done) done();
    return;
  }
  const promo = list[idx];
  const m = (save.roster || []).find(x => x.n === promo.name);
  if (!m){ showPromoChoice(save, idx + 1, done); return; }   // member no longer in crew
  const stats = (promo.stats && promo.stats.length) ? promo.stats : ["p","d","s"];   // fallback for legacy entries
  const roles = suggestRolesFor(stats);
  const offerStr = stats.map(s => s.toUpperCase()).join("/");
  const isFollowUp = !!(m.promoDeclined && m.promoDeclined.length);
  const subtitle = isFollowUp ? "They&rsquo;ve kept growing &mdash; another path opens up" : "They&rsquo;ve earned their stripes &mdash; choose a specialty";
  const counter = list.length > 1 ? ' <span style="font-family:var(--body);font-size:13px;color:var(--ink-2);font-weight:400;font-style:italic;letter-spacing:0">(' + (idx + 1) + ' of ' + list.length + ')</span>' : '';
  const cols = roles.length <= 2 ? "1fr 1fr" : (roles.length <= 4 ? "1fr 1fr" : "1fr 1fr 1fr");
  const roleBtns = roles.map(r => '<button class="pro-role" data-role="' + escapeHtml(r) + '" style="font-family:var(--display);font-weight:400;font-size:16px;letter-spacing:.5px;color:#3a2708;background:linear-gradient(180deg,#f4cf6a,#e7b94a);border:2px solid #9a6b1e;border-radius:9px;padding:10px 8px;cursor:pointer;box-shadow:0 4px 0 #9a6b1e;text-align:center">' + escapeHtml(r) + '</button>').join("");
  els.modalTitle.innerHTML = "A crewmate steps forward" + counter;
  els.modalMsg.innerHTML =
    '<p style="font-size:14px;color:var(--ink-2);margin:0 0 14px;font-style:italic">' + subtitle + '</p>' +
    '<div style="display:flex;align-items:center;gap:12px;padding:12px 14px;background:#f7ecca;border:1.5px solid #b79a63;border-radius:10px;margin-bottom:16px">' +
      '<div style="width:42px;height:42px;border-radius:9px;background:' + colorFor(m.n) + ';display:flex;align-items:center;justify-content:center;color:#fff;font-family:var(--display);font-size:24px;box-shadow:inset 0 -3px 0 rgba(0,0,0,.22);flex:0 0 auto">' + initial(m.n) + '</div>' +
      '<div style="flex:1;min-width:0">' +
        '<div style="font-family:var(--display);font-size:20px;color:var(--ink);line-height:1.1;letter-spacing:.4px">' + escapeHtml(m.n) + '</div>' +
        '<div style="font-size:12px;color:var(--ink-2);font-variant-numeric:tabular-nums;letter-spacing:.4px;margin-top:2px">P <b style="color:var(--ink)">' + (m.p||0) + '</b> &middot; D <b style="color:var(--ink)">' + (m.d||0) + '</b> &middot; S <b style="color:var(--ink)">' + (m.s||0) + '</b> &middot; offering: <b style="color:var(--ink)">' + offerStr + '</b></div>' +
      '</div>' +
    '</div>' +
    '<div style="font-family:var(--body);font-size:13px;font-weight:600;color:var(--ink-2);text-transform:uppercase;letter-spacing:.6px;margin:0 0 8px">Choose specialty</div>' +
    '<div style="display:grid;grid-template-columns:' + cols + ';gap:10px;margin-bottom:14px">' + roleBtns + '</div>' +
    '<div style="text-align:center;border-top:1px solid rgba(138,90,43,.25);padding-top:12px">' +
      '<button class="pro-keep" style="font-family:var(--display);font-weight:400;font-size:15px;letter-spacing:.4px;color:var(--ink-2);background:var(--parch-2);border:1.5px solid var(--line);border-radius:9px;padding:7px 18px;cursor:pointer">Keep as Crewmate</button>' +
    '</div>';
  els.modalConfirm.style.display = "none";
  els.modalCancel.style.display = "none";
  els.overlay.classList.add("is-open"); els.overlay.setAttribute("aria-hidden", "false");
  const _pm = els.overlay.querySelector(".modal"); if (_pm) _pm.classList.add("wide");
  els.modalMsg.querySelectorAll(".pro-role").forEach(btn => {
    btn.addEventListener("click", () => {
      const role = btn.dataset.role;
      m.r = role;
      if (!Array.isArray(m.alt)) m.alt = [];
      if (m.alt.indexOf("Crewmate") < 0) m.alt.push("Crewmate");   // still flexible: any Rest slot, no malus
      if (save.lineup) reconcileLineup(save);
      pushInbox(save, "info", "<b>" + escapeHtml(m.n) + "</b> graduated as a <b>" + escapeHtml(role) + "</b>!");
      persistSave(save);
      showPromoChoice(save, idx + 1, done);
    });
  });
  els.modalMsg.querySelector(".pro-keep").addEventListener("click", () => {
    m.promoCount = (m.promoCount || 0) + 1;
    m.promoDeclined = m.promoDeclined || [];
    (promo.stats || []).forEach(s => { if (m.promoDeclined.indexOf(s) < 0) m.promoDeclined.push(s); });
    pushInbox(save, "info", "You decided to keep <b>" + escapeHtml(m.n) + "</b> as a Crewmate.");
    persistSave(save);
    showPromoChoice(save, idx + 1, done);
  });
}
function logTransfer(save, day, buyer, seller, member, amount){
  save.transfers = save.transfers || [];
  save.transfers.unshift({ day:day || save.day || 1, buyer:buyer, seller:seller, member:member, amount:amount || 0 });
  if (save.transfers.length > 250) save.transfers.length = 250;
}
function renderMarketHistory(save){
  const list = save.transfers || [];
  if (!list.length) return '<div class="mk-empty">No transfers yet. Signings across the league will show up here, newest first.</div>';
  const days = [];
  list.forEach(t => { let g = days.find(d => d.day === t.day); if (!g){ g = { day:t.day, items:[] }; days.push(g); } g.items.push(t); });
  return '<div class="th-wrap">' + days.map(g =>
    '<div class="th-day"><div class="th-dayh">Day ' + g.day + '</div>' +
    g.items.map(t => {
      const you = (t.buyer === save.crew || t.seller === save.crew);
      const fromFree = !t.seller || t.seller === "free agent";
      return '<div class="th-row' + (you ? ' th-you' : '') + '">' +
        '<span class="mk-av" style="background:' + colorFor(t.buyer) + '">' + initial(t.buyer) + '</span>' +
        '<span class="th-txt"><b>' + escapeHtml(t.buyer) + '</b> signed ' + escapeHtml(t.member) +
          (fromFree ? ' <span class="th-free">(free agent)</span>' : ' from ' + escapeHtml(t.seller)) + '</span>' +
        '<span class="th-amt">' + fmtShort(t.amount) + '</span></div>';
    }).join("") + '</div>'
  ).join("") + '</div>';
}
function maybeAiBidOnYou(save){
  const roster = save.roster || [];
  if (roster.length < 2) return;
  if (Math.random() > 0.4) return;
  const crews = (save.league && save.league.crews) || [];
  let best = null;
  crews.forEach((c, idx) => { if ((c.roster || []).length < 13 && (!best || (c.berries || 0) > best.berries)) best = { name:c.name, ci:idx + 1, berries:c.berries || 0 }; });
  if (!best || best.berries < 8000000) return;
  let target = null;
  roster.forEach(m => { const v = memberBounty(m); if (!target || v > target.v) target = { m:m, v:v }; });
  if (!target) return;
  if ((save.inbox || []).some(x => x.type === "bid" && x.action && !x.action.resolved && x.action.member === target.m.n)) return;
  let amount = Math.round(target.v * (0.9 + Math.random() * 0.25) / 1e6) * 1e6;
  amount = Math.min(best.berries, amount);
  if (amount < Math.round(target.v * 0.6)) return;
  pushInbox(save, "bid", escapeHtml(best.name) + " want to sign " + escapeHtml(target.m.n) + " &mdash; they bid " + fmtShort(amount) + ".", { kind:"bid", member:target.m.n, ci:best.ci, amount:amount, resolved:false });
}
function openInbox(save){
  (save.inbox || []).forEach(x => x.read = true);
  renderInbox(save);
  persistSave(save);
}
function inboxTag(t){
  const map = { bid:["Bid","ib-bid"], accepted:["Signed","ib-ok"], rejected:["Rejected","ib-no"], sold:["Sold","ib-sold"], cancelled:["Cancelled","ib-grey"], info:["Note","ib-grey"] };
  const x = map[t] || map.info; return '<span class="ib-tag ' + x[1] + '">' + x[0] + '</span>';
}
function renderInbox(save){
  const list = save.inbox || [];
  let html;
  if (!list.length) html = '<div class="ib-empty">No messages yet. Offers, sales and rival bids show up here.</div>';
  else html = '<div class="ib-list">' + list.map(msg => {
    const open = msg.type === "bid" && msg.action && !msg.action.resolved;
    const act = open
      ? '<div class="ib-act"><button class="btn-gold-sm ib-accept" data-id="' + msg.id + '">Accept</button>' +
        '<button class="ib-decline" data-id="' + msg.id + '">Decline</button></div>' : '';
    return '<div class="ib-row">' + inboxTag(msg.type) +
      '<div class="ib-body"><div class="ib-txt">' + msg.text + '</div>' + act + '</div>' +
      '<span class="ib-day">Day ' + msg.day + '</span></div>';
  }).join("") + '</div>';
  els.modalTitle.textContent = "Inbox";
  els.modalMsg.innerHTML = html;
  els.modalConfirm.textContent = "Close"; els.modalConfirm.className = "btn-gold-sm";
  els.modalCancel.style.display = "none";
  els.overlay.classList.add("is-open"); els.overlay.setAttribute("aria-hidden", "false");
  const _ibm = els.overlay.querySelector(".modal"); if (_ibm) _ibm.classList.add("wide");
  els.modalConfirm.onclick = () => { closeModal(); goHome(save); };
  els.modalMsg.querySelectorAll(".ib-accept").forEach(b => b.addEventListener("click", () => inboxAccept(save, b.dataset.id)));
  els.modalMsg.querySelectorAll(".ib-decline").forEach(b => b.addEventListener("click", () => inboxDecline(save, b.dataset.id)));
  els.modalConfirm.focus();
}
function inboxFind(save, id){ return (save.inbox || []).find(x => x.id === id); }
function inboxAccept(save, id){
  const msg = inboxFind(save, id); if (!msg || !msg.action || msg.action.resolved) return;
  const a = msg.action;
  if (a.kind === "promote"){
    const m = (save.roster || []).find(x => x.n === a.member);
    if (!m){ a.resolved = true; msg.type = "info"; msg.text = a.member + " is no longer in your crew."; renderInbox(save); persistSave(save); return; }
    m.r = a.role;
    if (!Array.isArray(m.alt)) m.alt = [];
    if (m.alt.indexOf("Crewmate") < 0) m.alt.push("Crewmate");   // stays flexible: still fits any Rest slot
    a.resolved = true; msg.type = "info";
    msg.text = "<b>" + escapeHtml(m.n) + "</b> graduated as a <b>" + escapeHtml(a.role) + "</b>!";
    if (save.lineup) reconcileLineup(save);
    renderInbox(save); persistSave(save); return;
  }
  const idx = (save.roster || []).findIndex(m => m.n === a.member);
  if (idx < 0){ a.resolved = true; msg.type = "info"; msg.text = a.member + " already left your crew."; renderInbox(save); persistSave(save); return; }
  const crew = save.league.crews[a.ci - 1];
  const m = save.roster[idx];
  save.berries += a.amount;
  save.roster.splice(idx, 1);
  if (crew){ crew.berries = Math.max(0, (crew.berries || 0) - a.amount); crew.roster.push({ n:m.n, r:m.r, alt:m.alt || null, p:m.p, d:m.d, s:m.s, c:crew.name, sp:m.sp || [], cond:100 }); }
  if (save.lineup) reconcileLineup(save);
  a.resolved = true; msg.type = "sold";
  msg.text = "You sold " + m.n + " to " + (crew ? crew.name : "a rival") + " for " + fmtShort(a.amount) + ".";
  logTransfer(save, save.day, crew ? crew.name : "a rival", save.crew, m.n, a.amount);
  renderInbox(save); persistSave(save);
}
function inboxDecline(save, id){
  const msg = inboxFind(save, id); if (!msg || !msg.action || msg.action.resolved) return;
  const a = msg.action;
  a.resolved = true; msg.type = "info";
  if (a.kind === "promote") msg.text = "You decided to keep " + a.member + " as a Crewmate.";
  else msg.text = "You turned down the bid for " + a.member + ".";
  renderInbox(save); persistSave(save);
}
function cancelOffer(item){
  if (!item) return;
  const save = market.save;
  const i = (save.offers || []).findIndex(o => o.n === item.n);
  if (i < 0){ renderMarket(); return; }
  const o = save.offers[i]; save.offers.splice(i, 1);
  pushInbox(save, "cancelled", "You cancelled your offer for " + escapeHtml(item.n) + " (" + fmtShort(o.offer) + ").");
  persistSave(save); renderMarket();
}

/* ---- tournament victory celebration ---- */
function showVictory(save){
  els.modalTitle.textContent = "Champion";
  els.modalMsg.innerHTML =
    '<div class="vc-wrap">' +
      '<svg class="vc-crown" width="54" height="46" viewBox="0 0 24 24" fill="#e0a52a" aria-hidden="true"><path d="M2 7l4 3.2L12 3l6 7.2L22 7l-2 12H4L2 7z"/></svg>' +
      '<div class="vc-title">King of the Pirates!</div>' +
      '<div class="vc-sub">' + escapeHtml(save.crew) + ' conquered the Grand Tournament.</div>' +
      '<div class="vc-chips"><span class="vc-chip">30 days sailed</span><span class="vc-chip">Tournament won</span></div>' +
    '</div>';
  els.modalConfirm.textContent = "Glorious!"; els.modalConfirm.className = "btn-gold-sm";
  els.modalCancel.style.display = "none";
  els.overlay.classList.add("is-open"); els.overlay.setAttribute("aria-hidden", "false");
  els.modalConfirm.onclick = () => closeModal();
  els.modalConfirm.focus();
}

/* ============================================================
   Special-attack takeover (cinematic full-screen FX over the broadcast)
   - direction + tint follow the attacker's side: your crew runs gold/green
     from left to right, the opposition runs red from right to left
   - per-attack effect (fire / smoke / none) comes from window.SP_FX
   ============================================================ */
const SX_PAL = {
  you:{ name:"#f4cf6a", uses:"#8ee6b8", tgt:"#9fe7c0", beam:"rgba(244,207,106,.85)", glow:"rgba(201,169,110,.55)",
        flash:"radial-gradient(circle at 50% 48%,rgba(255,240,205,.85),transparent 62%)", dim:"rgba(5,18,16,.74)",
        fire:["#ffd24a","#ff9a1e"], smoke:"rgba(225,245,232,.66)" },
  opp:{ name:"#ff7a66", uses:"#f3a79a", tgt:"#f0a99c", beam:"rgba(226,75,74,.82)", glow:"rgba(226,75,74,.5)",
        flash:"radial-gradient(circle at 50% 48%,rgba(255,95,70,.6),transparent 62%)", dim:"rgba(20,5,7,.76)",
        fire:["#ff7a2a","#e23b2a"], smoke:"rgba(245,224,224,.66)" }
};
function ensureFxEl(){
  if (battle._fxEl && battle._fxEl.parentNode) return battle._fxEl;
  const ov = document.createElement("div");
  ov.id = "bt-spfx";
  ov.style.cssText = "position:absolute;inset:0;overflow:hidden;pointer-events:none;z-index:30;display:none";
  ov.innerHTML =
    '<div class="sx-dim" style="position:absolute;inset:0;opacity:0"></div>' +
    '<div class="sx-beam" style="position:absolute;top:0;width:45%;height:100%;opacity:0"></div>' +
    '<div class="sx-flash" style="position:absolute;inset:0;opacity:0"></div>' +
    '<div class="sx-att" style="position:absolute;top:calc(50% - 38px);text-align:center;opacity:0">' +
      '<div class="sx-av" style="width:52px;height:52px;border-radius:11px;display:flex;align-items:center;justify-content:center;color:#fff;font-family:var(--display);font-style:italic;font-size:27px;margin:0 auto;box-shadow:inset 0 -3px 0 rgba(0,0,0,.22)"></div>' +
      '<div class="sx-uses" style="margin-top:6px;font-family:var(--display);font-size:12px;font-style:italic;letter-spacing:.12em"></div>' +
    '</div>' +
    '<div class="sx-name" style="position:absolute;top:calc(50% - 24px);left:0;right:0;text-align:center;font-family:var(--display);font-style:italic;font-weight:400;font-size:38px;letter-spacing:.01em;opacity:0"></div>' +
    '<div class="sx-tgt" style="position:absolute;top:calc(50% + 36px);font-family:var(--display);font-size:14px;font-style:italic;opacity:0"></div>';
  els.battle.appendChild(ov);
  battle._fxEl = ov;
  return ov;
}
function clearSpecialFx(){
  (battle._fxTimers || []).forEach(clearTimeout); battle._fxTimers = [];
  hideMorgan();
  const ov = battle._fxEl; if (!ov) return;
  ov.querySelectorAll(".sx-pt").forEach(e => e.remove());
  ov.style.display = "none"; ov.style.pointerEvents = "none"; ov.onclick = null;
  ["sx-dim","sx-beam","sx-flash","sx-att","sx-name","sx-tgt"].forEach(c => { const e = ov.querySelector("." + c); if (e){ e.style.transition = "none"; e.style.opacity = 0; e.style.transform = ""; } });
}
function fxSpawn(ov, type, pal){
  const w = ov.clientWidth, h = ov.clientHeight, cx = w / 2, cy = h / 2;
  const n = type === "fire" ? 12 : 7;
  for (let i = 0; i < n; i++){
    const d = document.createElement("div"); d.className = "sx-pt";
    if (type === "fire"){
      const s = 6 + Math.random() * 10, col = pal.fire[Math.random() < 0.5 ? 0 : 1];
      d.style.cssText = "position:absolute;border-radius:50%;width:" + s + "px;height:" + s + "px;background:" + col + ";left:" + (cx - 34 + Math.random() * 68) + "px;top:" + (cy + 12) + "px;opacity:0;pointer-events:none";
      ov.appendChild(d);
      battle._fxTimers.push(setTimeout(() => { d.style.transition = "transform .8s ease-out,opacity .8s ease-out"; d.style.opacity = .95; d.style.transform = "translate(" + (-28 + Math.random() * 56) + "px," + (-70 - Math.random() * 75) + "px) scale(.3)"; }, 30 + i * 22));
      battle._fxTimers.push(setTimeout(() => { d.style.opacity = 0; }, 1380));
    } else {
      const s = 36 + Math.random() * 42;
      d.style.cssText = "position:absolute;border-radius:50%;width:" + s + "px;height:" + s + "px;background:radial-gradient(circle," + pal.smoke + ",transparent 70%);left:" + (cx - 54 + Math.random() * 108) + "px;top:" + (cy - 22 + Math.random() * 44) + "px;opacity:0;pointer-events:none";
      ov.appendChild(d);
      battle._fxTimers.push(setTimeout(() => { d.style.transition = "transform 1.1s ease-out,opacity 1.1s ease-out"; d.style.opacity = .6; d.style.transform = "translate(" + (-42 + Math.random() * 84) + "px,-30px) scale(1.7)"; }, 30 + i * 40));
      battle._fxTimers.push(setTimeout(() => { d.style.opacity = 0; }, 1480));
    }
  }
}
function playSpecialFx(info, done){
  const ov = ensureFxEl();
  clearSpecialFx();
  const pal = SX_PAL[info.fromYou ? "you" : "opp"], you = info.fromYou;
  const dim = ov.querySelector(".sx-dim"), beam = ov.querySelector(".sx-beam"), flash = ov.querySelector(".sx-flash");
  const att = ov.querySelector(".sx-att"), av = ov.querySelector(".sx-av"), uses = ov.querySelector(".sx-uses");
  const name = ov.querySelector(".sx-name"), tgt = ov.querySelector(".sx-tgt");

  av.textContent = initial(info.attacker); av.style.background = colorFor(info.attacker);
  uses.textContent = String(info.attacker).toUpperCase() + " USES"; uses.style.color = pal.uses;
  name.textContent = info.attack; name.style.color = pal.name; name.style.textShadow = "0 2px 22px " + pal.glow;
  tgt.textContent = info.target ? ("on " + info.target) : ""; tgt.style.color = pal.tgt;
  dim.style.background = pal.dim; flash.style.background = pal.flash;
  beam.style.background = "linear-gradient(100deg,transparent," + pal.beam + ",transparent)";

  if (you){ att.style.left = "24px"; att.style.right = "auto"; tgt.style.right = "24px"; tgt.style.left = "auto"; }
  else { att.style.left = "auto"; att.style.right = "24px"; tgt.style.left = "24px"; tgt.style.right = "auto"; }

  // initial states (offsets follow the direction of travel)
  name.style.transition = "none"; name.style.opacity = 0; name.style.transform = "translateX(" + (you ? "-30px" : "30px") + ")";
  beam.style.transition = "none"; beam.style.opacity = 0; beam.style.left = you ? "-45%" : "100%"; beam.style.transform = "skewX(" + (you ? "-16deg" : "16deg") + ")";

  ov.style.display = "block"; ov.style.pointerEvents = "auto";
  showMorgan(you ? "L" : "R", you ? "hype" : "arms");   // commentator slides in from the attacker's side
  void ov.offsetWidth;

  let finished = false;
  const finish = () => { if (finished) return; finished = true; clearSpecialFx(); if (done) done(); };
  ov.onclick = finish;   // tap anywhere on the battle screen to skip the takeover

  const T = battle._fxTimers;
  T.push(setTimeout(() => { dim.style.transition = "opacity .2s"; dim.style.opacity = 1; }, 0));
  T.push(setTimeout(() => { name.style.transition = "opacity .16s,transform .4s cubic-bezier(.2,1.5,.4,1)"; name.style.opacity = 1; name.style.transform = "translateX(0)"; }, 310));
  T.push(setTimeout(() => { beam.style.transition = "left .36s ease,opacity .1s"; beam.style.opacity = 1; beam.style.left = you ? "100%" : "-45%"; if (info.fx === "fire" || info.fx === "smoke") fxSpawn(ov, info.fx, pal); }, 540));
  T.push(setTimeout(() => { flash.style.transition = "opacity .08s"; flash.style.opacity = 1; }, 600));
  T.push(setTimeout(() => { tgt.style.transition = "opacity .3s"; tgt.style.opacity = 1; }, 640));
  T.push(setTimeout(() => { flash.style.transition = "opacity .45s"; flash.style.opacity = 0; }, 700));
  T.push(setTimeout(() => { [dim, name, tgt].forEach(e => { e.style.transition = "opacity .3s"; e.style.opacity = 0; }); }, 1500));
  T.push(setTimeout(finish, 1860));
}

/* ---- Big News Morgan commentator (slides in from the attacker's side) ----
   Three poses (your own transparent PNG cutouts in the repo root):
     morgan-open.png  hand raised   -> intro + final bell
     morgan-hype.png  fists up      -> your special
     morgan-arms.png  arms open     -> enemy special
   He's mirrored with scaleX(-1) when he comes from the right, so he always faces in. */
const MORGAN_POSE = { open:"morgan-open.png?v=1", hype:"morgan-hype.png?v=1", arms:"morgan-arms.png?v=1" };
function ensureMorganStyle(){
  if (document.getElementById("bt-morgan-style")) return;
  const st = document.createElement("style");
  st.id = "bt-morgan-style";
  st.textContent =
    "#screen-battle .bt-stage,#screen-battle .bt-feed{max-width:460px;margin-left:auto;margin-right:auto}" +
    "#screen-battle .bt-morgan-av{display:none}" +
    "#bt-morgan{position:absolute;bottom:0;width:190px;z-index:31;opacity:0;pointer-events:none;" +
      "transition:transform .42s cubic-bezier(.2,.9,.3,1),opacity .3s}" +
    "#bt-morgan img{display:block;width:100%;height:auto;" +
      "-webkit-mask-image:linear-gradient(to bottom,#000 80%,transparent);" +
      "mask-image:linear-gradient(to bottom,#000 80%,transparent)}" +
    "#bt-morgan .bt-morgan-floor{position:absolute;left:50%;bottom:0;transform:translateX(-50%);" +
      "width:112%;height:3px;border-radius:2px;" +
      "background:linear-gradient(90deg,transparent,#d6f1ff 22%,#d6f1ff 78%,transparent);" +
      "box-shadow:0 0 14px 4px rgba(45,140,200,.7),0 0 30px 10px rgba(45,140,200,.35)}";
  document.head.appendChild(st);
}
function ensureMorganEl(){
  if (battle._morganEl && battle._morganEl.parentNode) return battle._morganEl;
  const el = document.createElement("div");
  el.id = "bt-morgan";
  el.innerHTML = '<img alt="Big News Morgan"><div class="bt-morgan-floor"></div>';
  els.battle.appendChild(el);
  battle._morganEl = el;
  return el;
}
function showMorgan(side, pose, autoMs, cameo){
  const el = ensureMorganEl();
  if (battle._morganTimer){ clearTimeout(battle._morganTimer); battle._morganTimer = null; }
  const img = el.querySelector("img");
  const src = MORGAN_POSE[pose] || MORGAN_POSE.open;
  if (img.getAttribute("src") !== src) img.setAttribute("src", src);
  const left = side !== "R";
  const flip = left ? "" : " scaleX(-1)";
  const inset = (cameo ? -38 : 8) + "px";   // cameo shifts outward so he clears the card
  el.style.left = left ? inset : "auto";
  el.style.right = left ? "auto" : inset;
  el.style.zIndex = "31";
  el._left = left; el._flip = flip;
  el.style.transition = "none";
  el.style.transform = "translateX(" + (left ? "-150%" : "150%") + ")" + flip;
  void el.offsetWidth;
  el.style.transition = "transform .42s cubic-bezier(.2,.9,.3,1),opacity .3s";
  el.style.opacity = 1; el.style.transform = "translateX(0)" + flip;
  if (autoMs) battle._morganTimer = setTimeout(() => hideMorgan(), autoMs);
}
function hideMorgan(){
  if (battle._morganTimer){ clearTimeout(battle._morganTimer); battle._morganTimer = null; }
  const el = battle._morganEl; if (!el) return;
  const flip = el._flip || "";
  el.style.transition = "transform .42s cubic-bezier(.2,.9,.3,1),opacity .3s";
  el.style.opacity = 0;
  el.style.transform = "translateX(" + (el._left ? "-150%" : "150%") + ")" + flip;
}

function openBattle(save){
  const isl = islandFor(save.day);
  if (!save.matchday || save.matchday.day !== save.day){ save.matchday = { day:save.day, played:false, results:null }; }
  let _report = null;
  if (!save.matchday.played){ const _pre = capturePlayerFighters(save); resolveMatchday(save); _report = buildMatchReport(save, _pre); persistSave(save); }
  battle.report = _report;

  let res = "D", oppIndex = null, admiral = null;
  if (isl.type === "navy"){ const mine = save.matchday.results.find(r => r.team === 0); res = mine.res; admiral = mine.admiral; }
  else {
    const idx = fixturesForDay(save, save.day).findIndex(p => p[0] === 0 || p[1] === 0);
    const pr = fixturesForDay(save, save.day)[idx]; oppIndex = pr[0] === 0 ? pr[1] : pr[0];
    const r = save.matchday.results[idx]; res = pr[0] === 0 ? r.resA : invert(r.resA);
  }
  battle.save = save; battle.res = res; battle.onContinue = null;
  battle.beats = buildBattleScript({
    you: fightersOf(save, 0),
    opp: oppIndex !== null ? fightersOf(save, oppIndex) : [],
    isNavy: isl.type === "navy", admiral: admiral, island: isl.name,
    youName: save.crew, oppName: isl.type === "navy" ? ("Admiral " + admiral) : teamName(save, oppIndex), res: res
  });
  battle.idx = 0; battle.clock = 0;
  battle.lastMin = battle.beats[battle.beats.length - 1].minute || 90;
  battle.baseTick = Math.max(45, Math.min(420, Math.round(26000 / battle.lastMin)));  // ~26s playback regardless of length

  renderBattleFrame(isl, oppIndex, admiral);
  showScreen("screen-battle");
  battle.speed = 1;
  startBattleTimer();
}
function startBattleTimer(){
  if (battle.timer) clearInterval(battle.timer);
  battle.timer = setInterval(battleTick, Math.round(battle.baseTick / battle.speed));
}
function renderBattleFrame(isl, oppIndex, admiral){
  const save = battle.save;
  const oppName = isl.type === "navy" ? ("Admiral " + admiral) : teamName(save, oppIndex);
  const oppColor = isl.type === "navy" ? "#1565c0" : colorFor(oppName);
  els.battle.innerHTML =
    '<div class="bt-top">' +
      '<div class="bt-team"><span class="bt-av" style="background:' + colorFor(save.crew) + '">' + initial(save.crew) + '</span>' +
        '<span class="bt-nm">' + escapeHtml(save.crew) + '</span></div>' +
      '<div class="bt-live"><span class="bt-live-dot"></span>Live</div>' +
      '<div class="bt-team bt-team-r"><span class="bt-nm">' + escapeHtml(oppName) + '</span>' +
        '<span class="bt-av" style="background:' + oppColor + '">' + initial(oppName) + '</span></div>' +
    '</div>' +
    '<div class="bt-stage">' +
      '<div class="bt-morgan">' +
        '<div class="bt-morgan-av" id="morgan-av">M</div>' +
        '<div class="bt-morgan-nm">Big News Morgan</div>' +
      '</div>' +
      '<div class="bt-line" id="bt-line">&hellip;</div>' +
    '</div>' +
    '<div class="bt-feed" id="bt-feed"></div>' +
    '<div class="bt-result" id="bt-result" style="display:none"></div>' +
    '<div class="bt-action">' +
      '<button class="btn-ghost" id="bt-speed" type="button">x2</button>' +
      '<button class="btn-ghost" id="bt-skip" type="button">Skip &raquo;</button>' +
      '<button class="btn-gold bt-cont" id="bt-cont" type="button" style="display:none">Continue &#9654;</button>' +
    '</div>';
  els.battle.style.position = "relative";   // anchor the overlay + commentator
  ensureMorganStyle();
  battle._fxEl = null; battle._fxTimers = [];
  battle._morganEl = null; battle._morganTimer = null;
  $("bt-speed").addEventListener("click", () => {
    battle.speed = battle.speed === 1 ? 2 : 1;
    $("bt-speed").textContent = battle.speed === 1 ? "x2" : "x1";
    $("bt-speed").classList.toggle("on", battle.speed === 2);
    if (battle.timer) startBattleTimer();
  });
  $("bt-skip").addEventListener("click", battleSkip);
  $("bt-cont").addEventListener("click", () => {
    if (battle.onContinue){ const cb = battle.onContinue; battle.onContinue = null; cb(); }
    else {
      const rep = battle.report; battle.report = null;
      const go = () => { matchday.save = save; renderMatchday(); showScreen("screen-matchday"); };
      const next = () => showProgressPopups(save, go);
      if (rep) showMatchReport(save, rep, next); else next();
    }
  });
}
function emitBeat(b){
  const line = $("bt-line"); const feed = $("bt-feed");
  if (line.dataset.has === "1"){ const old = document.createElement("div"); old.className = "bt-feed-line"; old.innerHTML = line.innerHTML; feed.insertBefore(old, feed.firstChild); }
  line.innerHTML = b.text; line.dataset.has = "1";
  line.classList.toggle("bt-down", !!b.down);
}
function battleTick(){
  battle.clock += 1;
  pumpBeats();
}
/* Process every beat that's due. On a special-attack beat: emit the line, pause the
   timer, play the takeover, then resume from the callback. */
function pumpBeats(){
  while (battle.idx < battle.beats.length && battle.beats[battle.idx].minute <= battle.clock){
    const b = battle.beats[battle.idx]; battle.idx++;
    emitBeat(b);
    const sp = btSpecialInfo(b.text);
    if (!sp && (b.kind === "open" || b.kind === "close")) showMorgan("L", "open", 2600, true);   // intro / final-bell cameo
    if (sp){
      if (battle.timer){ clearInterval(battle.timer); battle.timer = null; }
      playSpecialFx(sp, () => {
        if (battle.idx < battle.beats.length) startBattleTimer();
        else battleFinish();
      });
      return;
    }
  }
  if (battle.idx >= battle.beats.length){ if (battle.timer){ clearInterval(battle.timer); battle.timer = null; } battleFinish(); }
}
function battleSkip(){
  if (battle.timer){ clearInterval(battle.timer); battle.timer = null; }
  clearSpecialFx();
  battle.clock = battle.lastMin;
  while (battle.idx < battle.beats.length){ emitBeat(battle.beats[battle.idx]); battle.idx++; }
  battleFinish();
}
function battleFinish(){
  const r = $("bt-result");
  const label = battle.res === "W" ? "Victory!" : battle.res === "L" ? "Defeat" : "Draw";
  r.className = "bt-result " + (battle.res === "W" ? "win" : battle.res === "L" ? "loss" : "draw");
  r.textContent = label; r.style.display = "block";
  $("bt-skip").style.display = "none";
  $("bt-speed").style.display = "none";
  $("bt-cont").style.display = "inline-block";
}