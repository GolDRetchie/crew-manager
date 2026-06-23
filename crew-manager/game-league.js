"use strict";

/* ====================================================================
   League world: schedule, AI crews, condition, matchday, day engine
   ==================================================================== */
const STAT_CAP        = 99;
const AI_COUNT        = 7;
const FIELD_STATS     = ["p", "d", "s"];
const FIELD_LABEL     = { p:"Power", d:"Defense", s:"Speed" };
const FIELD_SLOTS     = 2;             // 2 trainees per field per day -> 6 total
const TRAIN_GAIN      = 3;             // +3 to the field's stat per session
const BATTLE_COND     = 12;            // condition lost by a fighter per battle
const IDLE_RECOVER    = 20;            // condition regained per day when not fighting

const ISLANDS = [
  { d:1,  name:"Windmill Village", type:"normal" },
  { d:2,  name:"Shells Town",      type:"normal" },
  { d:3,  name:"Orange Town",      type:"normal" },
  { d:4,  name:"Syrup Village",    type:"normal" },
  { d:5,  name:"Baratie",          type:"normal" },
  { d:6,  name:"Arlong Park",      type:"rest"   },
  { d:7,  name:"Loguetown",        type:"navy", admiral:"Smoker"   },
  { d:8,  name:"Whisky Peak",      type:"normal" },
  { d:9,  name:"Little Garden",    type:"normal" },
  { d:10, name:"Drum Island",      type:"normal" },
  { d:11, name:"Alabasta",         type:"normal" },
  { d:12, name:"Jaya",             type:"rest"   },
  { d:13, name:"Skypiea",          type:"normal" },
  { d:14, name:"Water Seven",      type:"normal" },
  { d:15, name:"Enies Lobby",      type:"navy", admiral:"Kuzan"    },
  { d:16, name:"Thriller Bark",    type:"normal" },
  { d:17, name:"Sabaody",          type:"normal" },
  { d:18, name:"Amazon Lily",      type:"rest"   },
  { d:19, name:"Impel Down",       type:"normal" },
  { d:20, name:"Marineford",       type:"navy", admiral:"Akainu"   },
  { d:21, name:"Fish-Man Island",  type:"normal" },
  { d:22, name:"Punk Hazard",      type:"normal" },
  { d:23, name:"Dressrosa",        type:"normal" },
  { d:24, name:"Zou",              type:"rest"   },
  { d:25, name:"Whole Cake Island",type:"normal" },
  { d:26, name:"Wano",             type:"normal" },
  { d:27, name:"Egghead",          type:"navy", admiral:"Kizaru"   },
  { d:28, name:"Elbaf",            type:"normal" },
  { d:29, name:"Final Road",       type:"rest"   },
  { d:30, name:"Laugh Tale",       type:"final"  }
];
function islandFor(day){ return (day >= 1 && day <= ISLANDS.length) ? ISLANDS[day - 1] : null; }

/* ---- small utils ---- */
function captainStatsOf(save){ return save.captainStats || CAPTAIN_STATS; }
function condFactor(c){ const v = (typeof c === "number") ? c : 100; return 0.6 + 0.4 * (v / 100); }
function memCond(m){ return (m && typeof m.cond === "number") ? m.cond : 100; }
function growStats(t, dp, dd, ds){
  t.p = Math.min(STAT_CAP, (t.p || 0) + dp);
  t.d = Math.min(STAT_CAP, (t.d || 0) + dd);
  t.s = Math.min(STAT_CAP, (t.s || 0) + ds);
}
function cloneMember(m){ return { n:m.n, r:m.r, alt:m.alt || null, p:m.p, d:m.d, s:m.s, c:m.c, cond:100 }; }
function rngFor(seed){ return seededRng(hash(String(seed))); }
function shuffle(arr, rnd){ for (let i = arr.length - 1; i > 0; i--){ const j = Math.floor(rnd() * (i + 1)); const t = arr[i]; arr[i] = arr[j]; arr[j] = t; } return arr; }

/* ---- league / AI crews ---- */
function aiOwnedNames(save){
  const s = new Set();
  if (save.league && save.league.crews){
    save.league.crews.forEach(c => { s.add(c.captainName); c.roster.forEach(m => s.add(m.n)); });
  }
  return s;
}
function allOwnedNames(save){
  const s = aiOwnedNames(save);
  s.add(save.captain);
  (save.roster || []).forEach(m => s.add(m.n));
  return s;
}
function aiAffordable(save, crew){
  const owned = allOwnedNames(save);
  return PIRATES.filter(p => p.r !== "Captain" && !p.navy && !owned.has(p.n) &&
                             enlistPrice(p) <= crew.berries && crew.roster.length < 13);
}
function aiBuyOne(save, crew){
  const pool = aiAffordable(save, crew);
  if (!pool.length) return false;
  pool.sort((a, b) => enlistPrice(a) - enlistPrice(b));               // cheapest first: fill the crew, don't blow it on one star
  const idx = Math.floor(Math.pow(Math.random(), 1.3) * pool.length); // bias toward affordable bodies, occasionally reach higher
  const base = pool[Math.min(idx, pool.length - 1)];
  const st   = enlistStats(base);                                     // rivals enlist at the same scaled level you do
  const cost = baseBounty(st);
  crew.berries -= cost;
  crew.roster.push({ n:base.n, r:base.r, alt:base.alt || null, p:st.p, d:st.d, s:st.s, c:base.c, cond:100 });
  crew.bought = true;
  logTransfer(save, save.day, crew.name, "free agent", base.n, cost);
  return true;
}
function aiInitialReactiveBuys(save){
  if (!save.league || save.league.reactiveDone) return;
  save.league.crews.forEach(c => { if (!c.eager && !c.bought) aiBuyOne(save, c); });
  save.league.reactiveDone = true;
}
function aiRecruitGeneric(save, crew){
  // Rivals fill their ranks with their own rank-and-file (generic crewmates), so they never
  // drain the player's transfer market. They start modest and grow through training/battles.
  const rnd = rngFor(save.id + ":air:" + crew.name + ":" + crew.roster.length + ":" + save.day);
  const b   = () => 3 + Math.floor(rnd() * 4);   // 3-6 per stat (sum ~9-18); training/fights take it from there
  crew.roster.push({ n: crew.captainName + "'s crew", r:"Crewmate", alt:null, p:b(), d:b(), s:b(), c:crew.name, cond:100, generic:true });
  crew.bought = true;
}
function aiDailyBuys(save){
  if (!save.league) return;
  const day    = save.day || 1;
  const diff   = aiDifficulty(save);
  const target = Math.min(Math.round(AI_TARGET_SIZE * diff), 2 + Math.floor(day / AI_RAMP));   // slow ramp to a difficulty-scaled size
  save.league.crews.forEach(c => {
    let guard = 0;
    while ((c.roster || []).length < target && guard++ < 3){            // at most +2 members/day
      if (!aiBuyOne(save, c)) break;                                    // real characters from the shared pool; stop if broke / pool empty
    }
  });
}
function generateLeague(save){
  const rnd  = rngFor(save.id + ":league");
  const caps = captainPool().filter(c => c.n !== save.captain);
  shuffle(caps, rnd);
  const crews = [];
  for (let i = 0; i < caps.length; i++){
    const cap = caps[i];
    const name = (cap.c && cap.c !== "Free Agent") ? cap.c : cap.n + "'s Crew";
    crews.push({ name:name, captainName:cap.n, captainStats:{ p:8, d:8, s:8 }, captainCond:100, roster:[],
                 berries: STARTING_BERRIES, eager: rnd() < 0.45, bought:false,
                 growth: 0.85 + rnd() * 0.30, w:0, d:0, l:0, pts:0 });
  }
  save.league = { crews:crews, reactiveDone:false };
  crews.forEach(c => { if (c.eager) aiBuyOne(save, c); });   // eager crews grab one on day 1
}
function aiDifficulty(save){ return DIFFICULTY[(save && save.difficulty) || "normal"] || DIFFICULTY.normal; }
function aiDailyGrowth(save){
  // The AI trains by the same rules as you: each fighter at most once/day (+TRAIN_GAIN to one stat).
  // Captain first, then distinct members, up to 6 sessions/day (your max), scaled by crew form + difficulty.
  const diff = aiDifficulty(save);
  save.league.crews.forEach(c => {
    const cap   = Math.min(FIELD_SLOTS * FIELD_STATS.length, 1 + c.roster.length);   // FIELD_STATS.length=3 -> up to 6
    const slots = Math.max(1, Math.min(cap, Math.round(cap * c.growth * diff)));
    let left = slots;
    const stCap = FIELD_STATS[Math.floor(Math.random() * 3)];                         // captain trains first
    c.captainStats[stCap] = Math.min(STAT_CAP, (c.captainStats[stCap] || 0) + TRAIN_GAIN);
    left--;
    const idx = c.roster.map((_, k) => k); shuffle(idx, Math.random);                 // distinct members, no one twice
    for (let j = 0; j < Math.min(left, idx.length); j++){
      const m = c.roster[idx[j]];
      const stat = FIELD_STATS[Math.floor(Math.random() * 3)];
      m[stat] = Math.min(STAT_CAP, (m[stat] || 0) + TRAIN_GAIN);
    }
  });
}

/* ---- team abstraction (index 0 = you, 1..7 = AI) ---- */
function teamRecord(save, i){ return i === 0 ? save.record : save.league.crews[i - 1]; }
function teamName(save, i){ return i === 0 ? save.crew : save.league.crews[i - 1].name; }
function teamCaptain(save, i){ return i === 0 ? save.captain : save.league.crews[i - 1].captainName; }
function teamMembers(save, i){ return i === 0 ? (save.roster || []) : save.league.crews[i - 1].roster; }
function teamCapStats(save, i){ return i === 0 ? captainStatsOf(save) : save.league.crews[i - 1].captainStats; }
function teamBounty(save, i){
  let t = captainBounty(teamCapStats(save, i), teamMembers(save, i));
  teamMembers(save, i).forEach(m => t += baseBounty(m));
  return t;
}
function condBounty(stats, cond){ return baseBounty(stats) * condFactor(cond); }
function strengthOf(save, i){
  if (i === 0){
    let s = captainBounty(captainStatsOf(save), save.roster || []) * condFactor(save.captainCond);
    DECK_ROLES.forEach(r => { const nm = save.lineup.deck[r]; if (nm){ const m = memberByName(save, nm); if (m) s += condBounty(m, memCond(m)); } });
    return s;
  }
  const c = save.league.crews[i - 1];
  let s = captainBounty(c.captainStats, c.roster) * condFactor(c.captainCond);
  c.roster.forEach(m => s += condBounty(m, memCond(m)));
  return s * AI_STRENGTH;   // rivals punch a little above their bounty so a well-trained player still loses ~1 in 5
}
/* ---- battle resolution (auto for now) ---- */
function invert(res){ return res === "W" ? "L" : res === "L" ? "W" : "D"; }
function applyRecord(rec, res){ if (res === "W"){ rec.w++; rec.pts += 3; } else if (res === "D"){ rec.d++; rec.pts += 1; } else rec.l++; }
function outcome(aStr, bStr){ return (aStr * (0.78 + Math.random() * 0.44)) >= (bStr * (0.78 + Math.random() * 0.44)) ? "W" : "L"; }
function leagueSize(save){ return 1 + (save.league && save.league.crews ? save.league.crews.length : 0); }
function fixturesForDay(save, day){
  let idx = []; for (let i = 0; i < leagueSize(save); i++) idx.push(i);
  if (idx.length % 2) idx.push(-1);                       // odd count -> one crew gets a bye
  const n = idx.length, rot = idx.slice(1), k = (day - 1) % (n - 1);
  const arr = [idx[0]].concat(rot.slice(k)).concat(rot.slice(0, k));
  const pairs = [];
  for (let i = 0; i < n / 2; i++){ const a = arr[i], b = arr[n - 1 - i]; if (a !== -1 && b !== -1) pairs.push([a, b]); }
  return pairs;
}
function growYourFighters(save, won){
  const inc = 1;   // both sides grow equally from a fight; winning earns points + berries, not a stat snowball
  const cs  = save.captainStats, oldC = (cs.p||0)+(cs.d||0)+(cs.s||0);
  growStats(cs, inc, inc, inc);
  checkUnlocks(save, save.captain, oldC, oldC + 3);
  save.captainCond = Math.max(0, (save.captainCond || 100) - BATTLE_COND);
  DECK_ROLES.forEach(r => { const nm = save.lineup.deck[r]; if (nm){ const m = memberByName(save, nm); if (m){
    const oldS = (m.p||0)+(m.d||0)+(m.s||0);
    growStats(m, inc, inc, inc);
    checkUnlocks(save, m.n, oldS, oldS + 3);
    checkPromotion(save, m);
    m.cond = Math.max(0, memCond(m) - BATTLE_COND);
  } } });
}
function growTeamFighters(save, i, won){
  if (i === 0){ growYourFighters(save, won); return; }
  const c = save.league.crews[i - 1], inc = 1;
  growStats(c.captainStats, inc, inc, inc);
  c.captainCond = Math.max(0, (c.captainCond || 100) - BATTLE_COND);
  c.roster.forEach(m => { growStats(m, inc, inc, inc); m.cond = Math.max(0, memCond(m) - BATTLE_COND); });
}
function navyList(){ return PIRATES.filter(p => p.navy); }
function navyAdmiralsForDay(save){
  const list = navyList().slice();
  shuffle(list, rngFor(save.id + ":navy:" + save.day));
  const out = []; for (let i = 0; i < leagueSize(save); i++) out.push(list[i % list.length]);
  return out;
}
function playerMatchResult(save){
  const md = save.matchday; if (!md || !md.results) return null;
  for (const r of md.results){ if (r.navy){ if (r.team === 0) return r.res; } else { if (r.a === 0) return r.resA; if (r.b === 0) return invert(r.resA); } }
  return null;
}
function resolveMatchday(save){
  const isl = islandFor(save.day);
  const N = leagueSize(save);
  const results = [];
  if (isl.type === "navy"){
    const adms = navyAdmiralsForDay(save);
    let avg = 0; for (let i = 0; i < N; i++) avg += strengthOf(save, i); avg /= N;
    for (let i = 0; i < N; i++){
      const adm = adms[i] || adms[0];
      const wall = avg * ((adm.p + adm.d + adm.s) / 24) * 0.95;   // admirals are real walls; Garp/Akainu the toughest
      const str  = strengthOf(save, i) * (0.85 + Math.random() * 0.3);
      const res  = str > wall ? "W" : "L";
      applyRecord(teamRecord(save, i), res);
      growTeamFighters(save, i, res === "W");
      results.push({ navy:true, team:i, admiral:adm.n, res:res });
    }
  } else {
    fixturesForDay(save, save.day).forEach(([a, b]) => {
      const resA = outcome(strengthOf(save, a), strengthOf(save, b));
      applyRecord(teamRecord(save, a), resA);
      applyRecord(teamRecord(save, b), invert(resA));
      growTeamFighters(save, a, resA === "W");
      growTeamFighters(save, b, invert(resA) === "W");
      results.push({ a:a, b:b, resA:resA });
    });
  }
  save.matchday.results = results;
  save.matchday.played  = true;
  const youRes = playerMatchResult(save);
  save.berries += (youRes === "W") ? MATCH_YOU_WIN : MATCH_YOU_LOSS;   // non-win still pays a small purse; losing hurts in points, not bankruptcy
}

/* ---- day engine ---- */
function recoverConditions(save, full){
  const deck = new Set(DECK_ROLES.map(r => save.lineup.deck[r]).filter(Boolean));
  (save.roster || []).forEach(m => {
    if (full) m.cond = 100;
    else if (!deck.has(m.n)) m.cond = Math.min(100, memCond(m) + IDLE_RECOVER);
  });
  if (full) save.captainCond = 100;
  if (save.league && full) save.league.crews.forEach(c => { c.captainCond = 100; c.roster.forEach(m => m.cond = 100); });
}
const MATCH_INCOME_BASE = 4000000;   // berries every crew earns on a fight day
const MATCH_INCOME_WIN  = 3000000;   // extra for the winner (kept small to avoid market inflation)
const MATCH_YOU_WIN     = 3500000;   // near-flat purse: winning earns points, not a berry snowball
const MATCH_YOU_LOSS    = 3000000;   // loss still pays well -> every crew grows at a similar rate, no body-count runaway
const AI_STRENGTH       = 1.0;       // neutral: difficulty now comes from real AI growth, not a combat fudge
const DIFFICULTY        = { easy:0.7, normal:0.9, hard:1.1 };   // AI development rate (sim-tuned)
const AI_TARGET_SIZE    = 11;        // rivals build toward a near-full crew (members are cheap now); berry-gated in practice
const AI_RAMP           = 2;         // build up quickly toward target
function addBerries(save, i, amt){ if (i === 0) save.berries += amt; else save.league.crews[i - 1].berries += amt; }
function grantMatchIncome(save){
  const md = save.matchday;
  if (!md || !md.results) return;
  const won = new Array(leagueSize(save)).fill(false);
  md.results.forEach(r => { if (r.navy) won[r.team] = r.res === "W"; else { won[r.a] = r.resA === "W"; won[r.b] = invert(r.resA) === "W"; } });
  for (let i = 1; i < leagueSize(save); i++){   // i=0 (you) handled in resolveMatchday; rivals use the same +/-1M rule
    const c = save.league.crews[i - 1];
    c.berries = Math.max(0, (c.berries || 0) + (won[i] ? MATCH_YOU_WIN : MATCH_YOU_LOSS));
  }
}
function endOfDay(save, restful){
  if (!restful) grantMatchIncome(save);
  resolveTraining(save);
  aiDailyGrowth(save);
  aiDailyBuys(save);
  resolveTransfers(save);
  recoverConditions(save, !!restful);
  save.day = (save.day || 1) + 1;
  save.matchday = null;
  refreshMarket(save);
  persistSave(save);
}
function doRestDay(save){
  endOfDay(save, true);
  showProgressPopups(save, () => goHome(save));
}

/* ====================================================================
   Matchday screen (OSM-style fixture blocks)
   ==================================================================== */
const matchday = { save:null };

function openMatchday(save){
  matchday.save = save;
  if (!save.matchday || save.matchday.day !== save.day){
    save.matchday = { day:save.day, played:false, results:null };
    persistSave(save);
  }
  renderMatchday();
  showScreen("screen-matchday");
}
function blockHtml(label, vs, resTxt, you){
  return '<div class="md-block' + (you ? " you" : "") + '">' +
      '<div class="md-side">' + escapeHtml(label) + '</div>' +
      '<div class="md-vs">' + (resTxt || "vs") + '</div>' +
      '<div class="md-side md-side-r">' + escapeHtml(vs) + '</div>' +
    '</div>';
}
function renderMatchday(){
  const save = matchday.save;
  const isl  = islandFor(save.day);
  const md   = save.matchday;
  let blocks = "";

  if (isl.type === "navy"){
    if (!md.played){
      for (let i = 0; i < leagueSize(save); i++) blocks += blockHtml(teamName(save, i), "the Navy", "vs &#9883;", i === 0);
    } else {
      md.results.forEach(rr => blocks += blockHtml(teamName(save, rr.team), rr.admiral, rr.res === "W" ? "WON" : "LOST", rr.team === 0));
    }
  } else {
    const pairs = md.played ? md.results.map(r => [r.a, r.b]) : fixturesForDay(save, save.day);
    pairs.forEach((pr, idx) => {
      const a = pr[0], b = pr[1], you = (a === 0 || b === 0);
      let res = null;
      if (md.played){ const r = md.results[idx]; res = r.resA + " - " + invert(r.resA); }
      blocks += blockHtml(teamName(save, a), teamName(save, b), res, you);
    });
  }

  const action = !md.played
    ? '<button class="btn-gold md-go" id="md-start" type="button">Start battle</button>'
    : '<button class="btn-gold md-go" id="md-hub" type="button">Back to hub &#9654;</button>';

  const warn = (!md.played && trainingNames(save).size > 0)
    ? '<p class="md-warn">Heads up: ' + trainingNames(save).size + ' crew member(s) are still in training and will sit this fight out.</p>'
    : (md.played ? '<p class="md-warn" style="background:rgba(47,143,83,.16);border-color:#2f8f53;color:#cfeede">Matchday done. Train your crew if you like, then sail to the next island from the hub.</p>' : '');

  els.matchday.innerHTML =
    '<div class="md-top">' +
      '<div><div class="md-title">Day ' + save.day + ' &middot; ' + escapeHtml(isl.name) + '</div>' +
      '<div class="md-sub">' + (isl.type === "navy" ? "Marine base &mdash; each crew faces their own Admiral" : "Matchday fixtures") + '</div></div>' +
      '<button class="btn-ghost" id="md-back" type="button">Back</button>' +
    '</div>' +
    warn +
    '<div class="md-grid">' + blocks + '</div>' +
    '<div class="md-action">' + action + '</div>';

  $("md-back").addEventListener("click", () => goHome(save));
  const st = $("md-start");
  if (st) st.addEventListener("click", () => openBattle(save));
  const hb = $("md-hub");
  if (hb) hb.addEventListener("click", () => goHome(save));
}

/* ====================================================================
   League screen (read-only standings + crew inspection)
   ==================================================================== */
const league = { save:null, sort:"pts", view:null };

function openLeague(save){ league.save = save; league.sort = "pts"; league.view = null; renderLeague(); showScreen("screen-league"); }

function standingsRows(save){
  const rows = [];
  for (let i = 0; i < leagueSize(save); i++){
    const rec = teamRecord(save, i);
    rows.push({ i:i, name:teamName(save, i), w:rec.w, d:rec.d, l:rec.l, pts:rec.pts,
                bounty:teamBounty(save, i), count:teamMembers(save, i).length, you:i === 0 });
  }
  if (league.sort === "bounty")      rows.sort((a, b) => b.bounty - a.bounty);
  else if (league.sort === "members") rows.sort((a, b) => b.count - a.count);
  else                                rows.sort((a, b) => b.pts - a.pts || b.bounty - a.bounty);
  return rows;
}
function renderLeague(){
  const save = league.save;
  if (league.view !== null){ renderCrewDetail(save, league.view); return; }
  const rows = standingsRows(save);
  const body = rows.map((r, n) =>
    '<tr class="' + (r.you ? "you" : "") + '" data-crew="' + r.i + '">' +
      '<td class="lg-pos">' + (n + 1) + '</td>' +
      '<td class="l lg-name">' + escapeHtml(r.name) + '</td>' +
      '<td>' + r.w + '</td><td>' + r.l + '</td>' +
      '<td class="lg-pts">' + r.pts + '</td>' +
      '<td>' + r.count + '</td>' +
      '<td>' + fmtShort(r.bounty) + '</td>' +
    '</tr>'
  ).join("");

  const sortBtn = (key, lbl) => '<button class="lg-sort' + (league.sort === key ? " on" : "") + '" data-sort="' + key + '">' + lbl + '</button>';

  els.league.innerHTML =
    '<div class="lg-top">' +
      '<span class="lg-h">League &mdash; Day ' + save.day + ' / 30</span>' +
      '<button class="btn-ghost" id="lg-back" type="button" style="margin-left:auto">Back</button>' +
    '</div>' +
    '<div class="lg-sortbar">Sort: ' + sortBtn("pts", "Points") + sortBtn("bounty", "Bounty") + sortBtn("members", "Crew size") + '</div>' +
    '<table class="lg-table"><thead><tr>' +
      '<th>#</th><th class="l">Crew</th><th>W</th><th>L</th><th>Pts</th><th>Sz</th><th>Bounty</th>' +
    '</tr></thead><tbody>' + body + '</tbody></table>' +
    '<p class="lg-hint">Tap a crew to inspect their full roster.</p>';

  $("lg-back").addEventListener("click", () => goHome(save));
  els.league.querySelectorAll(".lg-sort").forEach(b => b.addEventListener("click", () => { league.sort = b.dataset.sort; renderLeague(); }));
  els.league.querySelectorAll("[data-crew]").forEach(tr => tr.addEventListener("click", () => { league.view = +tr.dataset.crew; renderLeague(); }));
}
function renderCrewDetail(save, i){
  const cap = teamCaptain(save, i), cs = teamCapStats(save, i);
  const rowFor = (nm, role, st, bounty) =>
    '<tr><td class="l"><span class="mk-name"><span class="mk-av" style="background:' + colorFor(nm) + '">' + initial(nm) + '</span><b>' + escapeHtml(nm) + '</b></span></td>' +
    '<td>' + escapeHtml(role) + '</td><td class="mk-pds">' + st.p + '-' + st.d + '-' + st.s + '</td>' +
    '<td class="mk-bounty">' + fmtShort(bounty) + '</td></tr>';
  const rows = [ rowFor(cap, "Captain", cs, captainBounty(cs, teamMembers(save, i))) ]
    .concat(teamMembers(save, i).map(m => rowFor(m.n, m.r, m, baseBounty(m)))).join("");
  els.league.innerHTML =
    '<div class="lg-top">' +
      '<span class="lg-h">' + escapeHtml(teamName(save, i)) + '</span>' +
      '<button class="btn-ghost" id="lg-toback" type="button" style="margin-left:auto">Back to standings</button>' +
    '</div>' +
    '<table class="mk-table"><thead><tr><th class="l">Name</th><th>Role</th><th>P-D-S</th><th>Bounty</th></tr></thead>' +
    '<tbody>' + rows + '</tbody></table>';
  $("lg-toback").addEventListener("click", () => { league.view = null; renderLeague(); });
}