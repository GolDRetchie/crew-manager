"use strict";

/* ====================================================================
   Laugh Tale Grand Tournament (day 30) — single-elimination, top 8 by points
   ==================================================================== */
function playerQualifiesForTournament(save){
  const N = leagueSize(save);
  const order = []; for (let i = 0; i < N; i++) order.push(i);
  order.sort((a, b) => { const ra = teamRecord(save, a), rb = teamRecord(save, b); return (rb.pts - ra.pts) || (teamBounty(save, b) - teamBounty(save, a)); });
  return order.slice(0, Math.min(8, N)).indexOf(0) >= 0;
}
function seedTournament(save){
  const N = leagueSize(save);
  const order = []; for (let i = 0; i < N; i++) order.push(i);
  order.sort((a, b) => { const ra = teamRecord(save, a), rb = teamRecord(save, b); return (rb.pts - ra.pts) || (teamBounty(save, b) - teamBounty(save, a)); });
  const seeds = order.slice(0, Math.min(8, N));
  const qualified = seeds.indexOf(0) >= 0;
  while (seeds.length < 8) seeds.push(-1);
  const S = seeds;
  const r0 = [ { a:S[0], b:S[7], w:null }, { a:S[3], b:S[4], w:null }, { a:S[2], b:S[5], w:null }, { a:S[1], b:S[6], w:null } ];
  r0.forEach(m => { if (m.b === -1) m.w = m.a; else if (m.a === -1) m.w = m.b; });
  save.tournament = { rounds:[r0], round:0, done:false, champion:null, playerOut: !qualified, outRound: qualified ? null : "qualifiers" };
}
function tourResolveAi(save){
  save.tournament.rounds[save.tournament.round].forEach(m => {
    if (m.w == null && m.a !== 0 && m.b !== 0) m.w = (outcome(strengthOf(save, m.a), strengthOf(save, m.b)) === "W") ? m.a : m.b;
  });
}
function tourBuildNext(save){
  const t = save.tournament, rd = t.rounds[t.round];
  if (rd.length === 1){ t.done = true; t.champion = rd[0].w; return; }
  const next = []; for (let i = 0; i < rd.length; i += 2) next.push({ a:rd[i].w, b:rd[i + 1].w, w:null });
  t.rounds.push(next); t.round++; tourResolveAi(save);
}
const TOUR_ROUND_NAMES = ["Quarter-final", "Semi-final", "Final"];
function openTournament(save){
  // migrate stale tournaments seeded before the qualification fix (player was force-included)
  if (save.tournament && !save.tournament.playerOut && !playerQualifiesForTournament(save)) save.tournament = null;
  if (!save.tournament){
    seedTournament(save);
    tourResolveAi(save);
    if (save.tournament.playerOut) while (!save.tournament.done) tourBuildNext(save);   // didn't qualify: play it all out
    persistSave(save);
  }
  renderTournament(save);
}
function startTournamentMatch(save, oppIndex){
  const res = outcome(strengthOf(save, 0), strengthOf(save, oppIndex));
  battle.save = save; battle.res = res;
  battle.beats = buildBattleScript({
    you: fightersOf(save, 0), opp: fightersOf(save, oppIndex), isNavy:false,
    island:"Laugh Tale", youName: save.crew, oppName: teamName(save, oppIndex), res: res
  });
  battle.idx = 0; battle.clock = 0;
  battle.lastMin = battle.beats[battle.beats.length - 1].minute || 90;
  battle.baseTick = Math.max(45, Math.min(420, Math.round(26000 / battle.lastMin)));
  battle.onContinue = () => advanceTournamentAfterPlayer(save, res);
  renderBattleFrame(islandFor(save.day), oppIndex, null);
  showScreen("screen-battle"); battle.speed = 1; startBattleTimer();
}
function advanceTournamentAfterPlayer(save, res){
  const t = save.tournament, rd = t.rounds[t.round];
  const m = rd.find(x => x.a === 0 || x.b === 0);
  if (m && m.w == null) m.w = (res === "W") ? 0 : (m.a === 0 ? m.b : m.a);
  if (res !== "W"){ t.playerOut = true; t.outRound = TOUR_ROUND_NAMES[Math.min(t.round, 2)]; }
  tourBuildNext(save);
  if (t.playerOut) while (!t.done) tourBuildNext(save);   // no player left: play out to a champion
  persistSave(save);
  renderTournament(save);
  if (t.done && t.champion === 0 && !t._celebrated){ t._celebrated = true; persistSave(save); showVictory(save); }
}
function renderTournament(save){
  const t = save.tournament;
  const youName = save.crew;
  const matchHtml = (m, isPlayerMatch, hide) => {
    const row = (idx) => {
      const decided = m.w != null && !hide;
      const win = decided && m.w === idx;
      const lose = decided && m.w !== idx && idx >= 0;
      const you = idx === 0;
      const cls = "tn-row" + (win ? " tn-win" : "") + (lose ? " tn-lose" : "") + (you ? " tn-you" : "");
      const label = idx < 0 ? "&mdash;" : escapeHtml(teamName(save, idx));
      const av = idx < 0 ? "" : '<span class="mk-av" style="background:' + colorFor(teamName(save, idx)) + '">' + initial(teamName(save, idx)) + '</span>';
      return '<div class="' + cls + '">' + av + '<span>' + label + '</span>' + (win ? '<span class="tn-tick">&#10003;</span>' : (lose ? '<span class="tn-cross">&#10007;</span>' : '')) + '</div>';
    };
    return '<div class="tn-match' + (isPlayerMatch ? ' tn-match-you' : '') + '">' + row(m.a) + row(m.b) + '</div>';
  };
  let cols = "";
  for (let r = 0; r <= t.round; r++){
    const rd = t.rounds[r];
    const isCurrent = (r === t.round) && !t.done;
    const youPending = isCurrent && rd.some(m => (m.a === 0 || m.b === 0) && m.w == null);   // you haven't fought this round yet
    const rows = rd.map(m => {
      const isPlayerMatch = isCurrent && (m.a === 0 || m.b === 0);
      const hide = youPending && !isPlayerMatch;   // keep rival results secret until you've played your own
      return matchHtml(m, isPlayerMatch, hide);
    }).join("");
    cols += '<div class="tn-col"><div class="tn-col-h">' + TOUR_ROUND_NAMES[Math.min(r, 2)] + '</div>' + rows + '</div>';
  }
  if (t.done) cols += '<div class="tn-col"><div class="tn-col-h">Champion</div>' +
      '<div class="tn-champ"><span class="mk-av" style="background:' + colorFor(teamName(save, t.champion)) + '">' + initial(teamName(save, t.champion)) + '</span>' + escapeHtml(teamName(save, t.champion)) + '</div></div>';

  let banner;
  if (t.done){
    banner = (t.champion === 0)
      ? '<div class="tn-banner tn-banner-win">You are the King of the Pirates!</div>'
      : '<div class="tn-banner">' + escapeHtml(teamName(save, t.champion)) + ' win the Grand Tournament.' + (t.playerOut ? ' You went out in the ' + t.outRound + '.' : '') + '</div>';
  } else {
    const rd = t.rounds[t.round];
    const pm = rd.find(x => (x.a === 0 || x.b === 0) && x.w == null);
    banner = '<div class="tn-banner">' + TOUR_ROUND_NAMES[Math.min(t.round, 2)] + ' &mdash; ' + (pm ? 'your match is up!' : 'rivals are battling it out.') + '</div>';
  }

  let action;
  if (t.done) action = '<button class="btn-gold" id="tn-home" type="button">Back to hub</button>';
  else {
    const rd = t.rounds[t.round];
    const pm = rd.find(x => (x.a === 0 || x.b === 0) && x.w == null);
    if (pm) action = '<button class="btn-gold" id="tn-fight" type="button">Fight your ' + TOUR_ROUND_NAMES[Math.min(t.round, 2)].toLowerCase() + ' &#9654;</button>';
    else    action = '<button class="btn-gold" id="tn-next" type="button">Advance to the ' + TOUR_ROUND_NAMES[Math.min(t.round + 1, 2)].toLowerCase() + ' &#9654;</button>';
  }

  els.matchday.innerHTML =
    '<div class="md-top"><span class="md-title">Laugh Tale &mdash; Grand Tournament</span>' +
      '<button class="btn-ghost" id="tn-back" type="button" style="margin-left:auto">Back</button></div>' +
    banner +
    '<div class="tn-bracket">' + cols + '</div>' +
    '<div class="tn-actions">' + action + '</div>';

  $("tn-back").addEventListener("click", () => goHome(save));
  const fb = $("tn-fight");
  if (fb) fb.addEventListener("click", () => {
    const rd = t.rounds[t.round]; const pm = rd.find(x => (x.a === 0 || x.b === 0) && x.w == null);
    startTournamentMatch(save, pm.a === 0 ? pm.b : pm.a);
  });
  const nb = $("tn-next");
  if (nb) nb.addEventListener("click", () => { tourBuildNext(save); persistSave(save); renderTournament(save); });
  const hb = $("tn-home");
  if (hb) hb.addEventListener("click", () => goHome(save));
  showScreen("screen-matchday");
}