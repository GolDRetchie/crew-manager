"use strict";

/* ====================================================================
   Transfer market
   ==================================================================== */
const market = { save:null, tab:"buy", role:"All", q:"", sort:"bounty_desc", rendered:[] };
const ROLE_ORDER = ["Swordsman","Navigator","Sniper","Chef","Doctor",
                    "Archaeologist","Shipwright","Musician","Helmsman","Crewmate"];
const MARKET_SIZE = 12;   // OSM-style: only a handful of listings on the board at a time
/* Each listing gets its own stat bonus so the board always has a spread:
   plenty of bargains (well below average) plus a few above-average names. Drifts up slowly. */
function rollListingBonus(day){
  const d = day || 1;
  const drift = Math.floor((d - 1) * 0.10);
  const r = Math.random();
  // Days 1-2: narrow spread so 30M reliably lands 2 strong or 2-3 weaker recruits.
  if (d <= 2){
    if (r < 0.55) return -1 + drift;                                 // 55% cheap
    else          return Math.floor(Math.random() * 2) + drift;      // 45% average (0..1)
  }
  // Day 3+: three visible tiers - bargains, average, and already-trained names that cost more.
  if (r < 0.35)      return -1 + drift;                              // 35% cheap
  else if (r < 0.70) return Math.floor(Math.random() * 2) + drift;   // 35% average (0..1)
  else               return 2 + Math.floor(Math.random() * 3) + drift; // 30% trained-up (2..4)
}
function scaledMember(base, bonus){
  const a = bonus || 0;
  const b = enlistStats(base);                                 // start below their data potential
  return { n:base.n, r:base.r, alt:base.alt || null, c:base.c, sp:base.sp || [],
           p:Math.max(MEMBER_STAT_FLOOR, Math.min(STAT_CAP, b.p + a)), d:Math.max(MEMBER_STAT_FLOOR, Math.min(STAT_CAP, b.d + a)), s:Math.max(MEMBER_STAT_FLOOR, Math.min(STAT_CAP, b.s + a)) };
}

/* everyone who could ever be bought: not a reserved captain, not your captain, not owned */
function buyableFor(save){
  const owned = new Set((save.roster || []).map(m => m.n));
  const ai = aiOwnedNames(save);
  return PIRATES.filter(p => p.r !== "Captain" && !p.navy && p.n !== save.captain && !owned.has(p.n) && !ai.has(p.n));
}
function priceOf(ch){
  const base = memberBounty(ch);
  if (ch && ch._isSale && ch._saleDiscount > 0) return Math.round(base * (1 - ch._saleDiscount));
  return base;
}
/* OSM-style odds: cheaper asking price sells faster; a low bid is more likely refused */
function sellDayChance(ratio){ return Math.max(5, Math.min(95, Math.round(85 - 182.5 * (ratio - 0.8)))); }
function offerSailChance(ratio){ return Math.max(5, Math.min(92, Math.round((ratio - 0.78) / (1.0 - 0.78) * 100))); }
function hasRole(ch, role){ return ch.r === role || (Array.isArray(ch.alt) && ch.alt.indexOf(role) >= 0); }

/* seeded RNG so a day's listings are stable, but change when the day advances */
function seededRng(seed){
  let a = seed >>> 0;
  return function(){
    a = (a + 0x6D2B79F5) | 0;
    let t = Math.imul(a ^ (a >>> 15), 1 | a);
    t = (t + Math.imul(t ^ (t >>> 7), 61 | t)) ^ t;
    return ((t ^ (t >>> 14)) >>> 0) / 4294967296;
  };
}
/* Persistent board: members stay listed across days, rotate off after 2 unsold days,
   then return 2 days later (stronger + pricier because stats scale with the day). */
function ensureMarket(save){
  if (!save.market || !Array.isArray(save.market.listings)){
    save.market = { listings:[], cooldown:[], day: save.day || 1 };
    refillMarket(save);
  }
  if (!Array.isArray(save.transferList)) save.transferList = [];   // your players put up for sale
  if (!Array.isArray(save.offers))       save.offers = [];         // your pending bids on rival players
}
function makeListing(name, day){
  // tenure: 2-4 days on the market before forced removal (30% / 50% / 20%)
  const r = Math.random();
  const tenure = r < 0.3 ? 2 : (r < 0.8 ? 3 : 4);
  // 65% of listings get a sale phase on their penultimate day; 15-30% off
  const hasSale = Math.random() < 0.65;
  const saleAt = hasSale ? Math.max(1, tenure - 1) : null;
  const saleDiscount = 0.15 + Math.random() * 0.15;
  return { n: name, since: day, bonus: rollListingBonus(day), tenure: tenure, saleAt: saleAt, saleDiscount: saleDiscount };
}
function refillMarket(save){
  const day = save.day || 1;
  const listed  = new Set(save.market.listings.map(L => L.n));
  const cooling = new Set(save.market.cooldown.filter(cd => cd.returnDay > day).map(cd => cd.n));
  const owned   = allOwnedNames(save);
  const pool = PIRATES.filter(p => p.r !== "Captain" && !p.navy && !owned.has(p.n) && !listed.has(p.n) && !cooling.has(p.n));
  shuffle(pool, Math.random);   // truly random board, different every game
  for (const p of pool){ if (save.market.listings.length >= MARKET_SIZE) break; save.market.listings.push(makeListing(p.n, day)); }
}
function refreshMarket(save){              // called once when the day advances
  ensureMarket(save);
  const day = save.day || 1;
  const owned = allOwnedNames(save);
  const kept = [];
  save.market.listings.forEach(L => {
    if (owned.has(L.n)) return;                                   // bought/claimed -> off the board
    const tenure = L.tenure || 2;
    if (day - L.since >= tenure) save.market.cooldown.push({ n:L.n, returnDay: day + 2 });
    else kept.push(L);
  });
  save.market.listings = kept;
  const due = save.market.cooldown.filter(cd => cd.returnDay <= day && !owned.has(cd.n));
  save.market.cooldown = save.market.cooldown.filter(cd => cd.returnDay > day);
  due.forEach(cd => { if (save.market.listings.length < MARKET_SIZE && !save.market.listings.some(L => L.n === cd.n)) save.market.listings.push(makeListing(cd.n, day)); });
  refillMarket(save);
  save.market.day = day;
}
/* the listings, as members scaled to the current day (bought/claimed ones drop off) */
function listedBuyable(save){
  ensureMarket(save);
  const day = save.day || 1;
  const owned = allOwnedNames(save);
  return save.market.listings
    .filter(L => !owned.has(L.n))
    .map(L => {
      const base = PIRATES.find(p => p.n === L.n);
      if (!base) return null;
      const mem = scaledMember(base, (typeof L.bonus === "number" ? L.bonus : rollListingBonus(day)));
      const age = day - (L.since || day);
      mem._age = age;
      mem._isNew = (age === 0);
      mem._isSale = (L.saleAt != null) && (age >= L.saleAt);
      mem._saleDiscount = L.saleDiscount || 0;
      return mem;
    })
    .filter(Boolean);
}

function openMarket(save){
  market.save = save;
  market.tab = "buy"; market.role = "All"; market.q = ""; market.sort = "bounty_desc";
  renderMarket();
  showScreen("screen-market");
}

function rivalMembers(save){
  const out = [];
  (save.league && save.league.crews ? save.league.crews : []).forEach((c, idx) => {
    (c.roster || []).forEach(m => out.push({ n:m.n, r:m.r, alt:m.alt || null, p:m.p, d:m.d, s:m.s, c:c.name, _ci: idx + 1 }));
  });
  return out;
}
function baseList(){
  const save = market.save;
  if (market.tab === "buy")   return listedBuyable(save);
  if (market.tab === "scout") return rivalMembers(save);
  return (save.roster || []).slice();
}
function applyFilters(list){
  if (market.role !== "All") list = list.filter(p => hasRole(p, market.role));
  if (market.q){
    const q = market.q.toLowerCase();
    list = list.filter(p => p.n.toLowerCase().indexOf(q) >= 0);
  }
  if (market.sort === "name")            list.sort((a,b) => a.n.localeCompare(b.n));
  else if (market.sort === "bounty_asc") list.sort((a,b) => priceOf(a) - priceOf(b));
  else                                   list.sort((a,b) => priceOf(b) - priceOf(a));
  return list;
}

function marketRow(p, i, mode, save){
  const value = (mode === "buy") ? priceOf(p) : memberBounty(p);
  const full  = (save.roster || []).length >= 13;
  let badge = "";
  if (mode === "buy" && p._isNew)       badge = '<span class="mk-badge mk-badge-new">New!</span>';
  else if (mode === "buy" && p._isSale) badge = '<span class="mk-badge mk-badge-sale">Sale</span>';
  const nameCell = '<span class="mk-name"><span class="mk-avwrap"><span class="mk-av" style="background:' + colorFor(p.n) + '">' + initial(p.n) + '</span>' + badge + '</span>' +
        '<span class="mk-nmcol"><b>' + escapeHtml(p.n) + '</b>' + (mode === "scout" ? '<span class="mk-sub">' + escapeHtml(p.c || "") + '</span>' : '') + '</span></span>';
  let act = "";
  if (mode === "buy"){
    const dis = full || save.berries < value;
    act = '<button class="mk-rowbtn is-buy" data-i="' + i + '"' + (dis ? ' disabled' : '') + '>Buy</button>';
  } else if (mode === "sell"){
    const L = (save.transferList || []).find(x => x.n === p.n);
    if (L){ const c = sellDayChance(L.ask / Math.max(1, value));
      act = '<span class="mk-listed">Listed ' + fmtShort(L.ask) + ' &middot; ' + c + '%/day</span>' +
            '<button class="mk-rowbtn is-unlist" data-i="' + i + '">Unlist</button>'; }
    else act = '<button class="mk-rowbtn is-list" data-i="' + i + '">List</button>';
  } else { // scout
    const pending = (save.offers || []).find(o => o.n === p.n);
    if (pending) act = '<span class="mk-listed">Offer in ' + fmtShort(pending.offer) + '</span>' +
                       '<button class="mk-rowbtn is-cancel" data-i="' + i + '">Cancel</button>';
    else { const dis = full || save.berries < value;
      act = '<button class="mk-rowbtn is-rbuy" data-i="' + i + '"' + (dis ? ' disabled' : '') + '>Buy</button>' +
            '<button class="mk-rowbtn is-offer" data-i="' + i + '">Offer</button>'; }
  }
  const priceCell = (mode === "buy" && p._isSale)
    ? '<td class="mk-bounty"><s style="color:var(--ink-2);opacity:.6;margin-right:5px">' + fmtShort(memberBounty(p)) + '</s>' + fmtShort(value) + '</td>'
    : '<td class="mk-bounty">' + fmtShort(value) + '</td>';
  return '<tr>' +
      '<td>' + nameCell + '</td>' +
      '<td>' + escapeHtml(p.r) + '</td>' +
      '<td class="mk-pds">' + p.p + '-' + p.d + '-' + p.s + '</td>' +
      priceCell +
      '<td class="mk-actcell">' + act + '</td>' +
    '</tr>';
}

function renderMarket(){
  const save   = market.save;
  const roster = save.roster || [];
  const full   = roster.length >= 13;
  const isHistory = market.tab === "history";
  const base   = isHistory ? [] : baseList();
  const list   = isHistory ? [] : applyFilters(base.slice());
  market.rendered = list;

  // chips: only roles present in the current tab's base list
  const present = isHistory ? [] : ROLE_ORDER.filter(r => base.some(p => hasRole(p, r)));
  const chips = ["All"].concat(present).map(r =>
    '<span class="mk-chip' + (market.role === r ? ' is-on' : '') + '" data-role="' + r + '">' + r + '</span>'
  ).join("");

  let body;
  if (isHistory){
    body = renderMarketHistory(save);
  } else if (list.length === 0){
    body = '<div class="mk-empty">' + (
      market.tab === "buy"   ? "No listings match your filters." :
      market.tab === "scout" ? "No rival players match your filters." :
                               "Your crew is empty &mdash; recruit members on the Buy tab.") + '</div>';
  } else {
    const rows = list.map((p, i) => marketRow(p, i, market.tab, save)).join("");
    body = '<table class="mk-table"><thead><tr>' +
        '<th>Name</th><th>Role</th><th>P-D-S</th><th>Value</th><th class="mk-actcell"></th>' +
      '</tr></thead><tbody>' + rows + '</tbody></table>';
  }

  const dayNote =
    market.tab === "buy"   ? '<p class="mk-note">Day ' + (save.day || 1) + ' &middot; new faces arrive on the market each day.' +
        (full ? ' <b>Your crew is full (13 / 13) &mdash; sell someone to recruit.</b>' : '') + '</p>' :
    market.tab === "sell"  ? '<p class="mk-note">List a player around their value. They keep playing until sold &mdash; ask less to sell faster.</p>' :
    market.tab === "scout" ? '<p class="mk-note">Bid on rival players. Pay full value to sign instantly, or offer up to 20% less and wait for their answer.</p>' :
    market.tab === "history" ? '<p class="mk-note">Every signing across the league, newest first.</p>' : '';

  els.market.innerHTML =
    '<div class="mk-top">' +
      '<span class="mk-title">Transfer market</span>' +
      '<div class="mk-bal">' +
        miniStat("Berries", fmtShort(save.berries)) +
        miniStat("Crew", roster.length + " / 13") +
      '</div>' +
      '<button class="btn-ghost mk-back" id="mk-back" type="button">Back</button>' +
    '</div>' +
    '<div class="mk-tabs">' +
      '<div class="mk-tab' + (market.tab === "buy"     ? " is-on" : "") + '" data-tab="buy">Buy</div>' +
      '<div class="mk-tab' + (market.tab === "sell"    ? " is-on" : "") + '" data-tab="sell">Sell</div>' +
      '<div class="mk-tab' + (market.tab === "scout"   ? " is-on" : "") + '" data-tab="scout">Scout</div>' +
      '<div class="mk-tab' + (market.tab === "history" ? " is-on" : "") + '" data-tab="history">History</div>' +
    '</div>' +
    (isHistory ? '' :
    '<div class="mk-filters">' +
      '<input class="mk-search" id="mk-search" placeholder="Search by name" value="' + escapeHtml(market.q) + '" />' +
      '<div class="mk-chips">' + chips + '</div>' +
      '<select class="mk-sort" id="mk-sort">' +
        '<option value="bounty_desc"' + (market.sort === "bounty_desc" ? " selected" : "") + '>Bounty: high to low</option>' +
        '<option value="bounty_asc"'  + (market.sort === "bounty_asc"  ? " selected" : "") + '>Bounty: low to high</option>' +
        '<option value="name"'        + (market.sort === "name"        ? " selected" : "") + '>Name (A&ndash;Z)</option>' +
      '</select>' +
    '</div>') +
    dayNote +
    body;

  $("mk-back").addEventListener("click", () => goHome(save));
  els.market.querySelectorAll(".mk-tab").forEach(t =>
    t.addEventListener("click", () => { market.tab = t.dataset.tab; market.role = "All"; renderMarket(); }));
  els.market.querySelectorAll(".mk-chip").forEach(c =>
    c.addEventListener("click", () => { market.role = c.dataset.role; renderMarket(); }));
  const sortSel = $("mk-sort");
  if (sortSel) sortSel.addEventListener("change", () => { market.sort = sortSel.value; renderMarket(); });
  const search = $("mk-search");
  if (search) search.addEventListener("input", () => {
    market.q = search.value;
    renderMarket();
    const s = $("mk-search"); s.focus(); s.setSelectionRange(s.value.length, s.value.length);
  });
  els.market.querySelectorAll(".is-buy").forEach(b =>
    b.addEventListener("click", () => confirmBuy(market.rendered[+b.dataset.i])));
  els.market.querySelectorAll(".is-list").forEach(b =>
    b.addEventListener("click", () => openListModal(market.rendered[+b.dataset.i])));
  els.market.querySelectorAll(".is-unlist").forEach(b =>
    b.addEventListener("click", () => unlistMember(market.rendered[+b.dataset.i].n)));
  els.market.querySelectorAll(".is-rbuy").forEach(b =>
    b.addEventListener("click", () => buyFromRival(market.rendered[+b.dataset.i], 100)));
  els.market.querySelectorAll(".is-offer").forEach(b =>
    b.addEventListener("click", () => openOfferModal(market.rendered[+b.dataset.i])));
  els.market.querySelectorAll(".is-cancel").forEach(b =>
    b.addEventListener("click", () => cancelOffer(market.rendered[+b.dataset.i])));
}

function confirmBuy(ch){
  if (!ch) return;
  const save = market.save;
  const price = priceOf(ch);
  if ((save.roster || []).length >= 13){ showInfo("Your crew is full (13 / 13). Sell someone first."); return; }
  if (save.berries < price){ showInfo("Not enough Berries to recruit " + ch.n + "."); return; }
  openModal({
    title:"Confirm recruit", danger:false, showCancel:true, confirmLabel:"Recruit",
    message:"Are you sure you want to recruit " + ch.n + " (" + ch.r + ") for " + fmtBerries(price) + "?",
    onConfirm: () => {
      save.berries -= price;
      save.roster = save.roster || [];
      save.roster.push({ n:ch.n, r:ch.r, alt:ch.alt || null, p:ch.p, d:ch.d, s:ch.s, c:ch.c, sp:ch.sp || [], cond:100, bp:price });
      if (save.market && save.market.listings) save.market.listings = save.market.listings.filter(L => L.n !== ch.n);
      logTransfer(save, save.day, save.crew, "free agent", ch.n, price);
      aiInitialReactiveBuys(save);
      persistSave(save);
      renderMarket();
      openModal({
        title:"Recruited!", danger:false, showCancel:false, confirmLabel:"OK",
        message:ch.n + " has joined your crew and is waiting on the bench. Assign their spot on the Crew page."
      });
    }
  });
}

/* ---- slider modal (asking price / offer) ---- */
function openSliderModal(opt){
  els.modalTitle.textContent = opt.title;
  els.modalMsg.innerHTML =
    '<span style="display:block;margin:2px 0 12px;font-size:14px;color:var(--ink-2,#5a4632)">' + (opt.intro || "") + '</span>' +
    '<span style="display:flex;align-items:center;gap:10px">' +
      '<input id="sl-range" type="range" min="' + opt.minPct + '" max="' + opt.maxPct + '" value="' + opt.startPct + '" step="1" style="flex:1" />' +
      '<b id="sl-price" style="min-width:64px;text-align:right;font-size:18px"></b>' +
    '</span>' +
    '<span id="sl-note" style="display:block;margin-top:10px;font-size:13px;color:var(--ink-2,#5a4632)"></span>';
  els.modalConfirm.textContent = opt.confirmLabel || "Confirm";
  els.modalConfirm.className = "btn-gold-sm";
  els.modalCancel.style.display = "";
  els.overlay.classList.add("is-open");
  els.overlay.setAttribute("aria-hidden", "false");
  const range = $("sl-range");
  const upd = () => { const info = opt.dynamic(+range.value); $("sl-price").innerHTML = info.priceText; $("sl-note").innerHTML = info.noteText; };
  range.addEventListener("input", upd); upd();
  els.modalConfirm.onclick = () => { const pct = +range.value; closeModal(); if (opt.onConfirm) opt.onConfirm(pct); };
  els.modalConfirm.focus();
}

/* ---- sell your own player: list it around its value, sells over time ---- */
function openListModal(m){
  if (!m) return;
  const save = market.save;
  const base = memberBounty(m);
  openSliderModal({
    title:"List " + m.n + " for sale",
    intro: m.n + " &middot; value <b>" + fmtShort(base) + "</b>. Set your asking price (&minus;20% to +20%).",
    minPct:80, maxPct:120, startPct:100, confirmLabel:"List for sale",
    dynamic:(pct) => {
      const price = Math.round(pct / 100 * base / 1e6) * 1e6;
      const c = sellDayChance(pct / 100);
      const lab = c >= 80 ? "fast sale" : c >= 50 ? "fair" : c >= 25 ? "patient" : "ambitious";
      return { priceText: fmtShort(price), noteText: "Sells per day: <b>" + c + "%</b> &middot; " + lab + " &middot; " + pct + "% of value" };
    },
    onConfirm:(pct) => {
      const price = Math.round(pct / 100 * base / 1e6) * 1e6;
      save.transferList = (save.transferList || []).filter(L => L.n !== m.n);
      save.transferList.push({ n:m.n, ask:price });
      persistSave(save); renderMarket();
    }
  });
}
function unlistMember(name){
  const save = market.save;
  save.transferList = (save.transferList || []).filter(L => L.n !== name);
  persistSave(save); renderMarket();
}

/* ---- bid on a rival's player: full price = instant, lower = they decide over days ---- */
function buyFromRival(item, pct){
  if (!item) return;
  const save = market.save;
  const crew = save.league.crews[item._ci - 1];
  if (!crew) return;
  const idx = crew.roster.findIndex(m => m.n === item.n);
  if (idx < 0){ showInfo(item.n + " is no longer with that crew."); renderMarket(); return; }
  const m = crew.roster[idx];
  const value = memberBounty(m);
  const price = Math.round(pct / 100 * value / 1e6) * 1e6;
  if ((save.roster || []).length >= 13){ showInfo("Your crew is full (13 / 13). Sell someone first."); return; }
  if (save.berries < price){ showInfo("Not enough Berries to bid that much for " + m.n + "."); return; }
  if (pct >= 100){
    save.berries -= price; crew.berries = (crew.berries || 0) + price; crew.roster.splice(idx, 1);
    save.roster = save.roster || [];
    save.roster.push({ n:m.n, r:m.r, alt:m.alt || null, p:m.p, d:m.d, s:m.s, c:m.c, sp:m.sp || [], cond:100, bp:price });
    logTransfer(save, save.day, save.crew, crew.name, m.n, price);
    reconcileLineup(save); persistSave(save); renderMarket();
    openModal({ title:"Signed!", confirmLabel:"OK", message: m.n + " joins your crew for " + fmtBerries(price) + ". Assign their spot on the Crew page." });
  } else {
    save.offers = save.offers || [];
    if (save.offers.some(o => o.n === item.n)){ showInfo("You already have an offer in for " + m.n + "."); return; }
    save.offers.push({ ci:item._ci, n:item.n, offer:price, wait:0, max:3 });
    persistSave(save); renderMarket();
    openModal({ title:"Offer submitted", confirmLabel:"OK",
      message:"You offered " + fmtBerries(price) + " for " + m.n + ". " + crew.name + " will think it over &mdash; check back after you sail." });
  }
}
function openOfferModal(item){
  if (!item) return;
  const save = market.save;
  const crew = save.league.crews[item._ci - 1];
  const m = crew && crew.roster.find(x => x.n === item.n);
  if (!m){ showInfo(item.n + " is no longer available."); renderMarket(); return; }
  const base = memberBounty(m);
  openSliderModal({
    title:"Offer for " + m.n,
    intro: m.n + " (" + escapeHtml(crew.name) + ") &middot; value <b>" + fmtShort(base) + "</b>.",
    minPct:80, maxPct:100, startPct:95, confirmLabel:"Submit offer",
    dynamic:(pct) => {
      const price = Math.round(pct / 100 * base / 1e6) * 1e6;
      const note = pct >= 100
        ? "Full price &mdash; the deal goes through <b>immediately</b>."
        : "Accepted each sail: <b>" + offerSailChance(pct / 100) + "%</b> &middot; a low offer may be turned down after a few days.";
      return { priceText: fmtShort(price), noteText: note + " &middot; " + pct + "% of value" };
    },
    onConfirm:(pct) => buyFromRival(item, pct)
  });
}

/* ---- resolved once per day, when you sail ---- */
function resolveTransfers(save){
  if (Array.isArray(save.transferList) && save.transferList.length){
    const kept = [];
    save.transferList.forEach(L => {
      const idx = (save.roster || []).findIndex(m => m.n === L.n);
      if (idx < 0) return;                                            // already gone
      const ratio = L.ask / Math.max(1, memberBounty(save.roster[idx]));
      if (Math.random() * 100 < sellDayChance(ratio)){ save.berries += L.ask; save.roster.splice(idx, 1); pushInbox(save, "sold", L.n + " sold for " + fmtShort(L.ask) + "."); logTransfer(save, save.day, "a rival", save.crew, L.n, L.ask); }
      else kept.push(L);
    });
    save.transferList = kept;
  }
  if (Array.isArray(save.offers) && save.offers.length){
    const kept = [];
    save.offers.forEach(o => {
      const crew = save.league.crews[o.ci - 1]; if (!crew) return;
      const idx = crew.roster.findIndex(m => m.n === o.n); if (idx < 0){ pushInbox(save, "info", "Your offer for " + o.n + " fell through &mdash; they already left."); return; }
      const m = crew.roster[idx];
      const ratio = o.offer / Math.max(1, memberBounty(m));
      if (Math.random() * 100 < offerSailChance(ratio)){
        if ((save.roster || []).length < 13 && save.berries >= o.offer){
          save.berries -= o.offer; crew.berries = (crew.berries || 0) + o.offer; crew.roster.splice(idx, 1);
          (save.roster = save.roster || []).push({ n:m.n, r:m.r, alt:m.alt || null, p:m.p, d:m.d, s:m.s, c:m.c, sp:m.sp || [], cond:100, bp:o.offer });
          pushInbox(save, "accepted", m.n + " accepted your offer of " + fmtShort(o.offer) + " &mdash; signed!");
          logTransfer(save, save.day, save.crew, crew.name, m.n, o.offer);
        } else pushInbox(save, "info", m.n + " accepted, but you couldn't complete the deal (crew full or short on Berries).");
      } else { o.wait++; if (o.wait < o.max) kept.push(o); else pushInbox(save, "rejected", crew.name + " rejected your offer for " + m.n + "."); }
    });
    save.offers = kept;
  }
  maybeAiBidOnYou(save);
  if (save.lineup) reconcileLineup(save);
}
function showNews(save){
  if (!save._news || !save._news.length) return;
  const items = save._news.slice(); save._news = [];
  els.modalMsg.innerHTML = items.map(t => '<span style="display:block;margin:4px 0">&bull; ' + t + '</span>').join("");
  els.modalTitle.textContent = "Transfer news";
  els.modalConfirm.textContent = "OK"; els.modalConfirm.className = "btn-gold-sm";
  els.modalCancel.style.display = "none";
  els.overlay.classList.add("is-open"); els.overlay.setAttribute("aria-hidden", "false");
  els.modalConfirm.onclick = () => closeModal();
  els.modalConfirm.focus();
}