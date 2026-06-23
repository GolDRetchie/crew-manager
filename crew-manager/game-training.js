"use strict";

/* ====================================================================
   Training grounds  (Power / Defense / Speed fields, day-based)
   ==================================================================== */
const training = { save:null, pending:null };

function trainingNames(save){
  const s = new Set();
  if (save.training){ FIELD_STATS.forEach(f => (save.training[f] || []).forEach(n => { if (n) s.add(n); })); }
  return s;
}
function ensureTraining(save){
  if (!save.training || !Array.isArray(save.training.p)){
    save.training = { p:[null, null], d:[null, null], s:[null, null] };
  }
  if (!save.training.origin) save.training.origin = {};
  const owned = new Set((save.roster || []).map(m => m.n));
  owned.add(save.captain);
  FIELD_STATS.forEach(f => { for (let i = 0; i < FIELD_SLOTS; i++){ const nm = save.training[f][i]; if (nm && !owned.has(nm)) save.training[f][i] = null; } });
}
function availableForTraining(save){
  const busy = trainingNames(save);
  const list = [{ n:save.captain, role:"Captain", stats:captainStatsOf(save), cap:true }];
  (save.roster || []).forEach(m => list.push({ n:m.n, role:m.r, stats:m, cap:false }));
  return list.filter(x => !busy.has(x.n));
}
function resolveTraining(save){
  const done = [];
  FIELD_STATS.forEach(f => {
    for (let i = 0; i < FIELD_SLOTS; i++){
      const nm = save.training[f][i];
      if (!nm) continue;
      const inc = { p:0, d:0, s:0 }; inc[f] = TRAIN_GAIN;
      if (nm === save.captain){
        const cs = save.captainStats, old = (cs.p||0)+(cs.d||0)+(cs.s||0);
        growStats(cs, inc.p, inc.d, inc.s);
        checkUnlocks(save, save.captain, old, old + TRAIN_GAIN);
      } else {
        const m = memberByName(save, nm);
        if (m){
          const old = (m.p||0)+(m.d||0)+(m.s||0);
          growStats(m, inc.p, inc.d, inc.s);
          checkUnlocks(save, m.n, old, old + TRAIN_GAIN);
          checkPromotion(save, m);
        }
        if (done.indexOf(nm) < 0) done.push(nm);
      }
      save.training[f][i] = null;
    }
  });
  if (save.lineup){ done.forEach(nm => restoreFromTraining(save, nm)); reconcileLineup(save); }
}

function openTraining(save){ training.save = save; ensureTraining(save); training.pending = null; renderTraining(); showScreen("screen-training"); }

function placeTrainee(f, i, name){
  const save = training.save;
  const slot = findLineupSlot(save, name);
  FIELD_STATS.forEach(ff => { for (let k = 0; k < FIELD_SLOTS; k++) if (save.training[ff][k] === name) save.training[ff][k] = null; });
  save.training[f][i] = name;
  training.pending = null;
  save.training.origin = save.training.origin || {};
  if (slot) save.training.origin[name] = slot;
  if (save.lineup) reconcileLineup(save);
  persistSave(save);
  renderTraining();
}
function removeTrainee(f, i){
  const save = training.save;
  const nm = save.training[f][i];
  save.training[f][i] = null;
  if (save.lineup){ if (nm && nm !== save.captain) restoreFromTraining(save, nm); reconcileLineup(save); }
  persistSave(save);
  renderTraining();
}
function autoFillTraining(save){
  ensureTraining(save);
  const open = {}; FIELD_STATS.forEach(f => { open[f] = 0; for (let i = 0; i < FIELD_SLOTS; i++) if (!save.training[f][i]) open[f]++; });
  let totalOpen = 0; FIELD_STATS.forEach(f => totalOpen += open[f]);
  if (totalOpen === 0) return 0;
  // each available crewmate, with their stats ranked lowest -> highest (ties keep P,D,S order)
  const ranked = availableForTraining(save).map(x => ({
    name: x.n,
    order: FIELD_STATS.slice().sort((a, b) => (x.stats[a] - x.stats[b]) || (FIELD_STATS.indexOf(a) - FIELD_STATS.indexOf(b))),
    done: false
  }));
  save.training.origin = save.training.origin || {};
  let placed = 0;
  const assign = (name, f) => {
    for (let i = 0; i < FIELD_SLOTS; i++){
      if (!save.training[f][i]){
        const slot = findLineupSlot(save, name);
        save.training[f][i] = name;
        if (slot) save.training.origin[name] = slot;
        open[f]--; placed++;
        return true;
      }
    }
    return false;
  };
  // Pass 1: everyone into their single lowest stat (where there's room)
  ranked.forEach(r => { if (!r.done && open[r.order[0]] > 0 && assign(r.name, r.order[0])) r.done = true; });
  // Pass 2: overflow into the next-lowest stat that still has room
  ranked.forEach(r => { if (r.done) return; for (let k = 1; k < r.order.length; k++){ if (open[r.order[k]] > 0 && assign(r.name, r.order[k])){ r.done = true; break; } } });
  if (placed > 0){ if (save.lineup) reconcileLineup(save); persistSave(save); }
  return placed;
}

function trainSlotHtml(f, i){
  const save = training.save;
  const nm = save.training[f][i];
  const p = training.pending;
  const pendSlot = p && p.kind === "slot" && p.f === f && p.i === i;
  const wantSlot = p && p.kind === "trainee";
  if (nm){
    return '<div class="ts filled" data-rm="' + f + ':' + i + '">' +
        '<span class="ts-dot" style="background:' + colorFor(nm) + '"></span><span class="ts-nm">' + escapeHtml(nm) + '</span>' +
        '<span class="ts-x">&times;</span>' +
      '</div>';
  }
  return '<div class="ts empty' + (pendSlot ? " pend" : "") + (wantSlot ? " ready" : "") + '" data-slot="' + f + ':' + i + '">' +
    (pendSlot ? "pick a crewmate &darr;" : wantSlot ? "place here &uarr;" : "+ add") + '</div>';
}
function renderTraining(){
  const save = training.save;
  const avail = availableForTraining(save);
  const cols = FIELD_STATS.map(f =>
    '<div class="tcol"><div class="tcol-h tcol-' + f + '">' + FIELD_LABEL[f] + '</div>' +
      [0, 1].map(i => trainSlotHtml(f, i)).join("") +
    '</div>'
  ).join("");
  const chips = avail.length === 0
    ? '<div class="tg-empty">Everyone is already training.</div>'
    : avail.map(x => {
        const isPend = training.pending && training.pending.kind === "trainee" && training.pending.name === x.n;
        return '<button class="av-chip' + (isPend ? " pend" : "") + '" data-train="' + escapeHtml(x.n) + '">' +
          '<span class="av-dot" style="background:' + colorFor(x.n) + '"></span>' +
          '<span class="av-nm">' + escapeHtml(x.n) + (x.cap ? " (Cpt)" : "") + '</span>' +
          '<span class="av-by">' + x.stats.p + "-" + x.stats.d + "-" + x.stats.s + '</span>' +
        '</button>';
      }).join("");

  els.training.innerHTML =
    '<div class="tg-top">' +
      '<div class="tg-id"><div class="tg-av" style="background:' + colorFor(save.captain) + '">' + initial(save.captain) + '</div>' +
        '<div><div class="tg-crew">' + escapeHtml(save.crew) + '</div><div class="tg-cap">Captain ' + escapeHtml(save.captain) + '</div></div></div>' +
      '<div class="tg-bal">' + miniStat("Bounty", fmtShort(totalCrewBounty(save))) + miniStat("Day", String(save.day || 1)) + '</div>' +
      '<div class="tg-actions"><button class="btn-gold-sm" id="tr-auto" type="button">Auto</button>' +
        '<button class="btn-ghost" id="tr-back" type="button">Back</button></div>' +
    '</div>' +
    '<p class="tg-intro">Tap a field slot then a crewmate &mdash; or a crewmate then a slot. Or hit <b>Auto</b> to put each crewmate in their lowest stat. Each session gives +' + TRAIN_GAIN + '; up to 6 per day. Trainees skip the next fight and finish when you sail on.</p>' +
    '<div class="tcols">' + cols + '</div>' +
    '<div class="tg-avail-t">Available crew</div>' +
    '<div class="tg-avail">' + chips + '</div>';

  $("tr-back").addEventListener("click", () => goHome(save));
  $("tr-auto").addEventListener("click", () => {
    const n = autoFillTraining(save);
    renderTraining();
    if (!n) showInfo(availableForTraining(save).length === 0 ? "Everyone is already training." : "No open training slots &mdash; remove someone first.");
  });
  els.training.querySelectorAll("[data-slot]").forEach(el => el.addEventListener("click", () => {
    const p = el.dataset.slot.split(":"); const f = p[0], i = +p[1];
    if (training.pending && training.pending.kind === "trainee") placeTrainee(f, i, training.pending.name);
    else { training.pending = { kind:"slot", f:f, i:i }; renderTraining(); }
  }));
  els.training.querySelectorAll("[data-rm]").forEach(el => el.addEventListener("click", () => {
    const p = el.dataset.rm.split(":"); removeTrainee(p[0], +p[1]);
  }));
  els.training.querySelectorAll("[data-train]").forEach(el => el.addEventListener("click", () => {
    const name = el.dataset.train;
    if (training.pending && training.pending.kind === "slot") placeTrainee(training.pending.f, training.pending.i, name);
    else { training.pending = { kind:"trainee", name:name }; renderTraining(); }
  }));
}