"use strict";

/* ---- game setup / migration ---- */
function ensureGame(save){
  if (!save.captainStats) save.captainStats = { p:8, d:8, s:8 };
  if (typeof save.captainCond !== "number") save.captainCond = 100;
  if (!save.record) save.record = { w:0, d:0, l:0, pts:0 };
  const oldFormat = save.league && save.league.crews && save.league.crews[0] &&
                    typeof save.league.crews[0].berries !== "number";
  if (!save.league || !save.league.crews || oldFormat) generateLeague(save);
  ensureTraining(save);
  ensureLineup(save);
  if (!save.market || !Array.isArray(save.market.listings)){ save.market = null; }
  ensureMarket(save);
  persistSave(save);
}


/* ====================================================================
   Init
   ==================================================================== */
function init(){
  els.carousel     = $("captain-carousel");
  els.carouselWrap = $("carousel-wrap");
  els.crewName     = $("crew-name");
  els.startBtn     = $("start-btn");
  els.hint         = $("form-hint");
  els.savedList    = $("saved-list");
  els.savesAll     = $("saves-all");
  els.savesCount   = $("saves-count");
  els.home         = $("home-content");
  els.market       = $("market-content");
  els.crew         = $("crew-content");
  els.training     = $("training-content");
  els.league       = $("league-content");
  els.matchday     = $("matchday-content");
  els.battle       = $("battle-content");
  els.berries      = $("start-berries");

  els.overlay      = $("modal-overlay");
  els.modalTitle   = $("modal-title");
  els.modalMsg     = $("modal-msg");
  els.modalConfirm = $("modal-confirm");
  els.modalCancel  = $("modal-cancel");

  els.berries.textContent = fmtBerries(STARTING_BERRIES);

  renderCaptains();
  setupCarousel();
  setupDifficulty();
  renderSavedGames();

  els.crewName.addEventListener("input", validate);
  els.startBtn.addEventListener("click", onStart);
  $("new-game-btn").addEventListener("click", () => showScreen("screen-create"));
  $("create-back").addEventListener("click", () => { showScreen("screen-newgame"); renderSavedGames(); });
  $("saves-back").addEventListener("click", () => { showScreen("screen-newgame"); renderSavedGames(); });

  els.modalCancel.addEventListener("click", closeModal);
  els.overlay.addEventListener("click", (e) => { if (e.target === els.overlay) closeModal(); });
  document.addEventListener("keydown", (e) => { if (e.key === "Escape") closeModal(); });

  // close the save-dropdown when clicking anywhere else
  document.addEventListener("click", () => {
    const d = $("save-dropdown");
    if (d) d.classList.remove("is-open");
  });

  validate();
}

document.addEventListener("DOMContentLoaded", init);