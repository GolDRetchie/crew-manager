"use strict";

/* ====================================================================
   Crew & line-up  (ship slots + bench, drag & drop)
   ==================================================================== */
const crew = { save:null };
const DECK_ROLES = ["Swordsman","Sniper","Chef","Doctor","Archaeologist",
                    "Shipwright","Musician","Navigator","Helmsman"];
const BENCH_SIZE = 4;
const SLOT_POS = {
  "Swordsman":[27,22], "Sniper":[73,22],
  "Chef":[27,37], "Doctor":[73,37],
  "Archaeologist":[27,52], "Shipwright":[73,52],
  "Musician":[50,66],
  "Navigator":[30,84], "Helmsman":[70,84]
};
const SHIP_SVG =
  '<svg viewBox="0 0 360 500" preserveAspectRatio="none">' +
    '<defs>' +
      '<linearGradient id="wood" x1="0" y1="0" x2="1" y2="1"><stop offset="0" stop-color="#9c6a36"/><stop offset="1" stop-color="#74481f"/></linearGradient>' +
      '<linearGradient id="deck" x1="0" y1="0" x2="0" y2="1"><stop offset="0" stop-color="#d2ad72"/><stop offset="1" stop-color="#bd965f"/></linearGradient>' +
    '</defs>' +
    '<path d="M180,2 L171,22 L189,22 Z" fill="#e7b94a" stroke="#9a6b1e" stroke-width="1.5"/>' +
    '<path d="M180,18 C116,38 64,86 56,176 L56,402 C56,462 110,490 180,490 C250,490 304,462 304,402 L304,176 C296,86 244,38 180,18 Z" fill="var(--cs-hull, #8a5a2b)" stroke="var(--cs-trim, #5e3c1c)" stroke-width="6"/>' +
    '<path d="M180,30 C124,48 80,90 72,180 L72,398 C72,452 120,476 180,476 C240,476 288,452 288,398 L288,180 C280,90 236,48 180,30 Z" fill="var(--cs-deck, #cba066)" stroke="var(--cs-trim, #8a5a2b)" stroke-width="2"/>' +
    '<path d="M180,40 C130,56 90,96 83,182 L83,396 C83,446 126,468 180,468 C234,468 277,446 277,396 L277,182 C270,96 230,56 180,40 Z" fill="none" stroke="#a9824f" stroke-width="1.2" opacity="0.7"/>' +
    '<g stroke="#a9824f" stroke-width="1.3" opacity="0.55">' +
      '<line x1="110" y1="60" x2="110" y2="455"/><line x1="145" y1="48" x2="145" y2="466"/><line x1="180" y1="42" x2="180" y2="470"/><line x1="215" y1="48" x2="215" y2="466"/><line x1="250" y1="60" x2="250" y2="455"/>' +
    '</g>' +
    '<g stroke="#9a7038" stroke-width="1" opacity="0.32">' +
      '<line x1="80" y1="130" x2="280" y2="130"/><line x1="74" y1="210" x2="286" y2="210"/><line x1="74" y1="290" x2="286" y2="290"/><line x1="78" y1="378" x2="282" y2="378"/>' +
    '</g>' +
    '<g fill="#2e241a">' +
      '<rect x="42" y="198" width="20" height="9" rx="2"/><rect x="42" y="300" width="20" height="9" rx="2"/>' +
      '<rect x="298" y="198" width="20" height="9" rx="2"/><rect x="298" y="300" width="20" height="9" rx="2"/>' +
    '</g>' +
    '<g fill="#8a5a2b" opacity="0.7">' +
      '<circle cx="74" cy="225" r="3"/><circle cx="74" cy="285" r="3"/><circle cx="74" cy="345" r="3"/>' +
      '<circle cx="286" cy="225" r="3"/><circle cx="286" cy="285" r="3"/><circle cx="286" cy="345" r="3"/>' +
    '</g>' +
    '<g fill="none" stroke="#b88b54" stroke-width="2" opacity="0.7">' +
      '<circle cx="96" cy="432" r="9"/><circle cx="96" cy="432" r="4.5"/>' +
      '<circle cx="264" cy="432" r="9"/><circle cx="264" cy="432" r="4.5"/>' +
    '</g>' +
    '<g stroke="#6e451f" stroke-width="3" fill="none">' +
      '<circle cx="180" cy="450" r="19"/>' +
      '<line x1="161" y1="450" x2="199" y2="450"/><line x1="180" y1="431" x2="180" y2="469"/><line x1="167" y1="437" x2="193" y2="463"/><line x1="193" y1="437" x2="167" y2="463"/>' +
    '</g>' +
    '<circle cx="180" cy="450" r="6" fill="#6e451f"/>' +
  '</svg>';

function memberByName(save, name){ return (save.roster || []).find(m => m.n === name); }

function getPlace(save, type, key){ return type === "deck" ? save.lineup.deck[key] : save.lineup.bench[key]; }
function setPlace(save, type, key, name){ if (type === "deck") save.lineup.deck[key] = name; else save.lineup.bench[key] = name; }

function placeMember(save, name){
  const lu = save.lineup;
  for (const r of DECK_ROLES){ if (!lu.deck[r]){ lu.deck[r] = name; return; } }
  for (let i = 0; i < BENCH_SIZE; i++){ if (!lu.bench[i]){ lu.bench[i] = name; return; } }
}
function reconcileLineup(save){
  const lu = save.lineup;
  const owned = new Set((save.roster || []).map(m => m.n));
  const training = (typeof trainingNames === "function") ? trainingNames(save) : new Set();
  const blocked = (nm) => !owned.has(nm) || training.has(nm);
  DECK_ROLES.forEach(r => { if (lu.deck[r] && blocked(lu.deck[r])) lu.deck[r] = null; });
  for (let i = 0; i < BENCH_SIZE; i++){ if (lu.bench[i] && blocked(lu.bench[i])) lu.bench[i] = null; }
  const placed = new Set([].concat(DECK_ROLES.map(r => lu.deck[r]), lu.bench).filter(Boolean));
  (save.roster || []).forEach(m => { if (!placed.has(m.n) && !training.has(m.n)) placeMember(save, m.n); });
}
function findLineupSlot(save, name){
  const lu = save.lineup; if (!lu) return null;
  for (const r of DECK_ROLES){ if (lu.deck[r] === name) return { type:"deck", key:r }; }
  for (let i = 0; i < BENCH_SIZE; i++){ if (lu.bench[i] === name) return { type:"bench", key:i }; }
  return null;
}
function restoreFromTraining(save, name){
  const lu = save.lineup; if (!lu) return;
  const o = save.training && save.training.origin ? save.training.origin[name] : null;
  if (o && o.type === "deck" && DECK_ROLES.indexOf(o.key) >= 0 && !lu.deck[o.key]) lu.deck[o.key] = name;
  else if (o && o.type === "bench" && o.key < BENCH_SIZE && !lu.bench[o.key]) lu.bench[o.key] = name;
  else placeMember(save, name);
  if (save.training && save.training.origin) delete save.training.origin[name];
}
function ensureLineup(save){
  if (!save.lineup || !save.lineup.deck || !Array.isArray(save.lineup.bench)){
    const lu = { deck:{}, bench:[] };
    DECK_ROLES.forEach(r => lu.deck[r] = null);
    for (let i = 0; i < BENCH_SIZE; i++) lu.bench[i] = null;
    save.lineup = lu;
  }
  reconcileLineup(save);
  persistSave(save);
}

/* specialist in own slot -> bonus; Crewmate -> neutral; otherwise off-role */
function fitFor(member, role){
  if (!member) return null;
  if (member.r === role || (Array.isArray(member.alt) && member.alt.indexOf(role) >= 0)) return "bonus";
  if (member.r === "Crewmate") return "neutral";
  return "off";
}
function fitBadge(fit){
  if (fit === "bonus") return '<span class="fit fit-bonus" title="In their role">&#10003;</span>';
  if (fit === "off")   return '<span class="fit fit-off" title="Off-role (small malus)">&ndash;</span>';
  return "";
}

function openCrew(save){
  crew.save = save;
  ensureLineup(save);
  renderCrew();
  showScreen("screen-crew");
}

function deckSlotHtml(role){
  const save = crew.save;
  const pos  = SLOT_POS[role];
  const style = "left:" + pos[0] + "%; top:" + pos[1] + "%";
  const name = save.lineup.deck[role];
  if (name){
    const m = memberByName(save, name);
    return '<div class="slot filled" style="' + style + '" data-drop="deck:' + role + '" data-drag="deck:' + role + '">' +
        fitBadge(fitFor(m, role)) +
        '<div class="slot-nm"><span class="dot" style="background:' + colorFor(name) + '"></span>' + escapeHtml(name) + '</div>' +
        '<div class="slot-role">' + role + '</div>' +
      '</div>';
  }
  return '<div class="slot empty" style="' + style + '" data-drop="deck:' + role + '">' +
      '<div class="slot-plus">+</div><div class="slot-role">' + role + '</div>' +
    '</div>';
}
function benchSlotHtml(i){
  const save = crew.save;
  const name = save.lineup.bench[i];
  if (name){
    const m = memberByName(save, name);
    return '<div class="b-slot" data-drop="bench:' + i + '" data-drag="bench:' + i + '">' +
        '<div class="b-av" style="background:' + colorFor(name) + '">' + initial(name) + '</div>' +
        '<div><div class="b-nm">' + escapeHtml(name) + '</div><div class="b-role">' + escapeHtml(m ? m.r : "") + '</div></div>' +
      '</div>';
  }
  return '<div class="b-slot empty" data-drop="bench:' + i + '">Empty bench slot</div>';
}

function renderCrew(){
  const save = crew.save;
  const roster = save.roster || [];

  const captainSlot =
    '<div class="slot cap filled" style="left:50%; top:8%">' +
      '<div class="slot-av" style="background:' + colorFor(save.captain) + '">' + initial(save.captain) + '</div>' +
      '<div class="slot-nm">' + escapeHtml(save.captain) + '</div><div class="slot-role">Captain</div>' +
    '</div>';

  const note = roster.length === 0
    ? "Your crew is empty &mdash; recruit members on the transfer market, then drag them onto a post."
    : "Drag a crew member onto a post on the ship. Drop them on a filled post to swap.";

  els.crew.innerHTML =
    '<div class="cw-top">' +
      '<div class="cw-id">' +
        '<div class="cw-av" style="background:' + colorFor(save.captain) + '">' + initial(save.captain) + '</div>' +
        '<div><div class="cw-crew">' + escapeHtml(save.crew) + '</div>' +
        '<div class="cw-cap">Captain ' + escapeHtml(save.captain) + '</div></div>' +
      '</div>' +
      '<div class="cw-bal">' +
        miniStat("Bounty", fmtShort(totalCrewBounty(save))) +
        miniStat("Crew", roster.length + " / 13") +
      '</div>' +
      '<button class="btn-ghost cw-back" id="cw-back" type="button">Back</button>' +
    '</div>' +
    '<div class="cw-main">' +
      '<div class="ship-col">' + SHIP_SVG +
        '<span class="dir" style="top:-2px">&#9650; Bow</span>' +
        '<span class="dir" style="bottom:-4px">Stern / Wheel</span>' +
        captainSlot + DECK_ROLES.map(deckSlotHtml).join("") +
      '</div>' +
      '<div class="bench-col">' +
        '<div class="bench"><div class="bench-title">Bench</div>' +
          [0,1,2,3].map(benchSlotHtml).join("") +
        '</div>' +
        '<div class="bench-note">' + note + '</div>' +
      '</div>' +
    '</div>';

  $("cw-back").addEventListener("click", () => goHome(save));
  els.crew.querySelectorAll("[data-drag]").forEach(el => {
    el.addEventListener("pointerdown", onDragStart);
  });
}

/* ---- drag & drop (Pointer Events: works with mouse and touch) ---- */
let drag = null;

function dropTargetAt(x, y){
  const el = document.elementFromPoint(x, y);
  return el ? el.closest("[data-drop]") : null;
}
function moveGhost(x, y){ if (drag && drag.ghost){ drag.ghost.style.left = x + "px"; drag.ghost.style.top = y + "px"; } }

function onDragStart(e){
  if (e.button && e.button !== 0) return;
  const parts = e.currentTarget.dataset.drag.split(":");
  const type = parts[0];
  const key  = (type === "deck") ? parts[1] : parseInt(parts[1], 10);
  const name = getPlace(crew.save, type, key);
  if (!name) return;
  e.preventDefault();

  drag = { type:type, key:key, name:name, srcEl:e.currentTarget, ghost:null };
  e.currentTarget.classList.add("is-source");

  const g = document.createElement("div");
  g.className = "drag-ghost";
  g.innerHTML = '<div class="slot-nm"><span class="dot" style="background:' + colorFor(name) + '"></span>' + escapeHtml(name) + '</div>';
  document.body.appendChild(g);
  drag.ghost = g;
  moveGhost(e.clientX, e.clientY);

  document.body.classList.add("is-dragging");
  els.crew.querySelectorAll("[data-drop]").forEach(d => d.classList.add("droppable"));

  window.addEventListener("pointermove", onDragMove);
  window.addEventListener("pointerup", onDragUp);
  window.addEventListener("pointercancel", onDragCancel);
}
function onDragMove(e){
  if (!drag) return;
  e.preventDefault();
  moveGhost(e.clientX, e.clientY);
  const t = dropTargetAt(e.clientX, e.clientY);
  els.crew.querySelectorAll("[data-drop]").forEach(d => d.classList.toggle("drop-hover", d === t));
}
function onDragUp(e){ endDrag(true, e.clientX, e.clientY); }
function onDragCancel(){ endDrag(false, 0, 0); }

function applyDrop(tType, tKey){
  const save = crew.save;
  const occupant = getPlace(save, tType, tKey);
  if (occupant === drag.name) return;             // dropped on own post
  setPlace(save, tType, tKey, drag.name);
  setPlace(save, drag.type, drag.key, occupant);  // occupant (or null) goes to old spot = move/swap
  persistSave(save);
}
function endDrag(apply, x, y){
  window.removeEventListener("pointermove", onDragMove);
  window.removeEventListener("pointerup", onDragUp);
  window.removeEventListener("pointercancel", onDragCancel);
  if (apply && drag){
    const t = dropTargetAt(x, y);
    if (t){
      const parts = t.dataset.drop.split(":");
      applyDrop(parts[0], parts[0] === "deck" ? parts[1] : parseInt(parts[1], 10));
    }
  }
  if (drag){
    if (drag.srcEl) drag.srcEl.classList.remove("is-source");
    if (drag.ghost) drag.ghost.remove();
  }
  document.body.classList.remove("is-dragging");
  drag = null;
  renderCrew();
}