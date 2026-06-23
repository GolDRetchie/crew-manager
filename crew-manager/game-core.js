/* ====================================================================
   Crew Manager — game.js  (New Game + Saves + Home + modal)
   ==================================================================== */

"use strict";

/* ---- configurable ---- */
const STARTING_BERRIES = 30000000;     // both you and rivals: enough to field a small crew, then build via match income
const MAX_SAVES        = 10;
const PREVIEW_SAVES    = 3;
const CAPTAIN_STATS    = { p:8, d:8, s:8 };  // equal baseline for every captain
const SAVES_KEY   = "cm_saves_v1";
const CURRENT_KEY = "cm_current_v1";

/* ---- safe storage ---- */
const Store = {
  get(k){ try { return JSON.parse(localStorage.getItem(k)); } catch(e){ return null; } },
  set(k,v){ try { localStorage.setItem(k, JSON.stringify(v)); return true; } catch(e){ return false; } }
};

/* ---- helpers ---- */
const AV_COLORS = ["#c0392b","#c9920f","#6c3483","#a93226","#0f766e","#2c2c2a",
                   "#be185d","#1565c0","#db2777","#d35400","#166534","#0e7490",
                   "#9d174d","#7c3aed","#b45309"];
function hash(str){ let h=0; for(let i=0;i<str.length;i++){ h=(h*31 + str.charCodeAt(i))|0; } return Math.abs(h); }
function colorFor(name){ return AV_COLORS[ hash(name) % AV_COLORS.length ]; }
function initial(name){ const m = name.match(/[a-z0-9]/i); return (m ? m[0] : "?").toUpperCase(); }
function fmtBerries(n){ return n.toLocaleString("en-US") + " Berries"; }
function fmtShort(n){
  if (n >= 1e9) return (Math.round(n / 1e6) / 1e3).toLocaleString("en-US") + "B";
  if (n >= 1e6) return (Math.round(n / 1e4) / 1e2).toLocaleString("en-US") + "M";
  if (n >= 1e3) return Math.round(n / 1e3) + "K";
  return String(n);
}
function escapeHtml(s){
  return String(s).replace(/[&<>"']/g, c => (
    {"&":"&amp;","<":"&lt;",">":"&gt;",'"':"&quot;","'":"&#39;"}[c]
  ));
}

/* start bounty: stat sum (3..30) -> 10M..30M, whole millions */
function baseBounty(stats){
  const sum = (stats.p || 0) + (stats.d || 0) + (stats.s || 0);
  return Math.max(1, sum) * 1000000;   // linear: each stat point = 1M (8-8-8 -> 24M, 2-2-2 -> 6M)
}
/* a member's current bounty: stored value if grown (training/battles), else its base */
function memberBounty(m){ return baseBounty(m); }
/* Members enter play BELOW their data stats (their "potential") and grow into it via training/fights.
   Captains are exempt (always 8-8-8). This keeps recruiting affordable: with 30M you can sign
   ~2 strong members or ~3-4 rookies, instead of one overpriced star. */
const MEMBER_START_SCALE = 0.62;
const MEMBER_STAT_FLOOR  = 2;
function enlistStat(v){ return Math.max(MEMBER_STAT_FLOOR, Math.round((v || 0) * MEMBER_START_SCALE)); }
function enlistStats(b){ return { p:enlistStat(b.p), d:enlistStat(b.d), s:enlistStat(b.s) }; }
function enlistPrice(b){ return baseBounty(enlistStats(b)); }
const CAPTAIN_PREMIUM = 1.6;   // captains are the crew's most-wanted face
function captainBounty(capStats, members){
  const base  = Math.round(baseBounty(capStats) * CAPTAIN_PREMIUM / 1e6) * 1e6;
  let top = 0; (members || []).forEach(m => { const b = baseBounty(m); if (b > top) top = b; });
  const floor = Math.round(top * 1.10 / 1e6) * 1e6;   // always at least 10% above the best crewmate
  return Math.max(base, floor);
}
function totalCrewBounty(save){
  let total = captainBounty(captainStatsOf(save), save.roster || []);
  (save.roster || []).forEach(m => { total += baseBounty(m); });
  return total;
}

/* TODO: true once new characters appear on the market; placeholder for now */
function marketHasNew(save){
  if (!save || !save.market || !Array.isArray(save.market.listings)) return false;
  const day = save.day || 1;
  return save.market.listings.some(L => (day - (L.since || day)) === 0);
}

/* captains you may pick: r==="Captain" OR cap===true; fixed captains first */
function captainPool(){
  if (typeof PIRATES === "undefined") { console.error("data-pirates.js not loaded"); return []; }
  return PIRATES.filter(p => p.r === "Captain" || p.cap === true)
                .sort((a,b) => (a.r === "Captain" ? 0 : 1) - (b.r === "Captain" ? 0 : 1));
}

const state = { captain: null };
const els = {};
function $(id){ return document.getElementById(id); }

/* ====================================================================
   Modal (confirm / info) — replaces window.confirm
   ==================================================================== */
function openModal(opt){
  els.modalTitle.textContent    = opt.title;
  els.modalMsg.textContent      = opt.message;
  els.modalConfirm.textContent  = opt.confirmLabel || "OK";
  els.modalConfirm.className     = opt.danger ? "btn-danger" : "btn-gold-sm";
  els.modalCancel.style.display  = opt.showCancel ? "" : "none";
  els.overlay.classList.add("is-open");
  els.overlay.setAttribute("aria-hidden", "false");
  els.modalConfirm.onclick = () => { closeModal(); if (opt.onConfirm) opt.onConfirm(); };
  els.modalConfirm.focus();
}
function closeModal(){
  els.overlay.classList.remove("is-open");
  els.overlay.setAttribute("aria-hidden", "true");
  const m = els.overlay.querySelector(".modal"); if (m) m.classList.remove("wide");
}
function showConfirm(message, onConfirm){
  openModal({ title:"Confirm", message, confirmLabel:"Delete", danger:true, showCancel:true, onConfirm });
}
function showInfo(message){
  openModal({ title:"Coming soon", message, confirmLabel:"OK", danger:false, showCancel:false });
}