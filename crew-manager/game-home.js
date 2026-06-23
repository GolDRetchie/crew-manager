"use strict";

/* ====================================================================
   Screen switching + Home / hub
   ==================================================================== */
function showScreen(id){
  document.querySelectorAll(".screen").forEach(s => s.classList.remove("is-active"));
  $(id).classList.add("is-active");
  document.body.dataset.screen = id;
  window.scrollTo(0, 0);
}

function miniStat(label, val){
  return '<div class="mini-stat"><span class="mini-stat__label">' + label + '</span>' +
         '<span class="mini-stat__val">' + val + '</span></div>';
}
function comingSoon(label){ showInfo('"' + label + '" is coming next.'); }

function goHome(save){
  ensureGame(save);
  const crewCount = save.roster ? save.roster.length : 0;
  const isl = islandFor(save.day);
  const trainingCount = trainingNames(save).size;
  const unread = (save.inbox || []).filter(x => !x.read).length;

  let fightInner;
  if (!isl){
    fightInner = '<span class="battle-block__label">Journey complete</span>' +
                 '<span class="battle-block__opp">Laugh Tale reached</span>' +
                 '<span class="battle-block__note">see the final standings in the League</span>';
  } else if (isl.type === "rest"){
    fightInner = '<span class="battle-block__label">Rest day</span>' +
                 '<span class="battle-block__opp">' + escapeHtml(isl.name) + '</span>' +
                 '<span class="battle-block__note">your crew recovers &mdash; no battle today</span>' +
                 '<button class="btn-gold home-go" id="home-fight" data-fight="rest" type="button">Sail on &#9654;</button>';
  } else if (isl.type === "final"){
    const t = save.tournament;
    if (t && t.done){
      fightInner = '<span class="battle-block__label">Laugh Tale</span>' +
                   '<span class="battle-block__opp">' + (t.champion === 0 ? "King of the Pirates!" : escapeHtml(teamName(save, t.champion)) + " won") + '</span>' +
                   '<span class="battle-block__note">' + (t.champion === 0 ? "you conquered the Grand Line &mdash; the journey is complete" : "the Grand Tournament is over") + '</span>' +
                   '<button class="btn-gold home-go" id="home-fight" data-fight="final" type="button">View bracket</button>';
    } else {
      const qualifies = save.tournament ? !save.tournament.playerOut : playerQualifiesForTournament(save);
      if (qualifies){
        fightInner = '<span class="battle-block__label">Laugh Tale</span>' +
                     '<span class="battle-block__opp">Grand Tournament</span>' +
                     '<span class="battle-block__note">the finale &mdash; top 8 crews, single elimination</span>' +
                     '<button class="btn-gold home-go" id="home-fight" data-fight="final" type="button">Enter</button>';
      } else {
        fightInner = '<span class="battle-block__label">Laugh Tale</span>' +
                     '<span class="battle-block__opp">You didn\'t qualify</span>' +
                     '<span class="battle-block__note">the top 8 crews fight for the title &mdash; watch the finale</span>' +
                     '<button class="btn-gold home-go" id="home-fight" data-fight="final" type="button">Watch</button>';
      }
    }
  } else {
    const played = save.matchday && save.matchday.day === save.day && save.matchday.played;
    let opp = null;
    if (isl.type === "navy") opp = "the Navy";
    else { const pr = fixturesForDay(save, save.day).find(p => p[0] === 0 || p[1] === 0); if (pr) opp = teamName(save, pr[0] === 0 ? pr[1] : pr[0]); }
    if (!opp){
      fightInner = '<span class="battle-block__label">Day ' + save.day + ' &middot; ' + escapeHtml(isl.name) + '</span>' +
                   '<span class="battle-block__opp">No fixture today</span>' +
                   '<span class="battle-block__note">your crew has a bye &mdash; sail on when ready</span>' +
                   '<button class="btn-gold home-go" id="home-fight" data-fight="rest" type="button">Sail on &#9654;</button>';
    } else if (played){
      fightInner = '<span class="battle-block__label">Day ' + save.day + ' &middot; ' + escapeHtml(isl.name) + '</span>' +
                   '<span class="battle-block__opp">Matchday done</span>' +
                   '<span class="battle-block__note">train your crew if you like, then set sail</span>' +
                   '<button class="btn-gold home-go" id="home-fight" data-fight="sail" type="button">Sail to next island &#9654;</button>';
    } else {
      fightInner = '<span class="battle-block__label">Day ' + save.day + ' &middot; ' + escapeHtml(isl.name) + '</span>' +
                   '<span class="battle-block__opp">vs ' + escapeHtml(opp) + '</span>' +
                   '<span class="battle-block__note">' + (isl.type === "navy" ? "Marine base &mdash; full crew vs an Admiral" : "rival crew battle") + '</span>' +
                   '<button class="btn-gold home-go" id="home-fight" data-fight="go" type="button">Start matchday</button>';
    }
  }

  const hasFixture = isl && (isl.type === "navy" ||
                     (isl.type === "normal" && !!fixturesForDay(save, save.day).find(p => p[0] === 0 || p[1] === 0)));
  const matchReady = hasFixture &&
                     !(save.matchday && save.matchday.day === save.day && save.matchday.played);
  const leftBox = matchReady
    ? '<button class="side-box' + (trainingCount > 0 ? " warn" : "") + '" data-act="training" type="button">' +
        '<span class="side-box__title">Did you pull everyone out of training?</span>' +
        '<span class="side-box__sub">' + (trainingCount > 0 ? (trainingCount + " still training &mdash; they will sit out") : "trainees can\u2019t join the fight") + '</span>' +
      '</button>'
    : '<button class="side-box" data-act="crew" type="button">' +
        '<span class="side-box__title">See how your crew is doing</span>' +
        '<span class="side-box__sub">line-up &amp; stats</span>' +
      '</button>';
  const newBadge = marketHasNew(save) ? '<span class="new-badge">New!</span>' : '';

  els.home.innerHTML =
    '<div class="home-top">' +
      '<div class="home-top__id">' +
        '<div class="home-top__av" style="background:' + colorFor(save.captain) + '">' + initial(save.captain) + '</div>' +
        '<div><div class="home-top__crew">' + escapeHtml(save.crew) + '</div>' +
        '<div class="home-top__cap">Captain ' + escapeHtml(save.captain) + '</div></div>' +
      '</div>' +
      '<div class="home-top__stats">' +
        miniStat("Berries", fmtShort(save.berries)) +
        miniStat("Bounty", fmtShort(totalCrewBounty(save))) +
        miniStat("Crew", crewCount + " / 13") +
        miniStat("Day", (save.day || 1) + " / 30") +
      '</div>' +
      '<div class="home-top__actions" style="display:flex;align-items:center;gap:8px;margin-left:auto">' +
        '<button class="save-btn home-inbox-btn" id="inbox-btn" data-act="inbox" type="button" style="position:relative">' +
          'Inbox' + (unread > 0 ? ' <span class="nav-badge" style="position:absolute;top:-7px;right:-7px;margin:0;border:1.5px solid #0b2533">' + unread + '</span>' : '') +
        '</button>' +
        '<div class="save-menu">' +
          '<button class="save-btn" id="save-btn" type="button">Save <span class="save-btn__car">&#9662;</span></button>' +
          '<div class="save-dropdown" id="save-dropdown">' +
            '<button class="save-dropdown__item" id="save-exit" type="button">Save &amp; exit</button>' +
          '</div>' +
        '</div>' +
      '</div>' +
    '</div>' +

    '<nav class="home-nav">' +
      '<button class="nav-btn" data-act="crew" type="button">Crew</button>' +
      '<button class="nav-btn" data-act="market" type="button">Transfer market</button>' +
      '<button class="nav-btn" data-act="training" type="button">Training</button>' +
      '<button class="nav-btn" data-act="league" type="button">League</button>' +
    '</nav>' +

    '<div class="home-battle">' +
      '<div class="battle-block">' + fightInner + '</div>' +
      '<div class="battle-side">' + leftBox +
        '<button class="side-box" data-act="market" type="button">' + newBadge +
          '<span class="side-box__title">Take a look at the transfer market</span>' +
          '<span class="side-box__sub">recruit new crew</span>' +
        '</button>' +
      '</div>' +
    '</div>';

  els.home.querySelectorAll("[data-act]").forEach(b => {
    b.addEventListener("click", () => {
      const a = b.dataset.act;
      if (a === "market") openMarket(save);
      else if (a === "crew") openCrew(save);
      else if (a === "training") openTraining(save);
      else if (a === "league") openLeague(save);
      else if (a === "inbox") openInbox(save);
    });
  });
  const fb = $("home-fight");
  if (fb) fb.addEventListener("click", () => {
    const f = fb.dataset.fight;
    if (f === "go") openMatchday(save);
    else if (f === "sail"){ endOfDay(save, false); showProgressPopups(save, () => goHome(save)); }
    else if (f === "rest"){ doRestDay(save); }
    else if (f === "final") openTournament(save);
  });

  const sBtn = $("save-btn"), sDrop = $("save-dropdown");
  sBtn.addEventListener("click", (e) => { e.stopPropagation(); sDrop.classList.toggle("is-open"); });
  $("save-exit").addEventListener("click", () => {
    persistSave(save);
    showScreen("screen-newgame");
    renderSavedGames();
  });

  showScreen("screen-home");
}