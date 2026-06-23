"use strict";

/* ====================================================================
   menu.js — post-login home (OSM-style landscape)
   - Builds the full home shell: Profile column (profile card + action
     cards + missions/news + 4 stat tiles) and Manager-slots column
     (numbered 2x2 crew grid: online leagues + single-player saves + "+").
   - Set Sail modal: Offline / Online Grand Line + join-by-code.
   - Keeps account / friends / settings wiring, logout, admin.

   NOTE: the action cards (Join crew / Free 50), Missions, News, the four
   stat tiles, and the level/XP/berries readout in the profile card are
   visual placeholders for features that don't exist yet — they are not
   wired to data on purpose. Wire them up once those systems land.
   ==================================================================== */
(function () {
  function el(id){ return document.getElementById(id); }
  function esc(s){ return (typeof escapeHtml === "function") ? escapeHtml(s) : String(s == null ? "" : s); }
  function initialOf(n){ return (typeof initial === "function") ? initial(n || "?") : ((n && n[0] ? n[0] : "?").toUpperCase()); }
  function colorOf(n){ return (typeof colorFor === "function") ? colorFor(n || "?") : "#8a5a2b"; }

  function activateScreen(id){
    try { if (typeof showScreen === "function") showScreen(id); } catch (e) {}
    var t = el(id);
    if (t && !t.classList.contains("is-active")) {
      document.querySelectorAll(".screen").forEach(function (s){ s.classList.remove("is-active"); });
      t.classList.add("is-active");
    }
  }

  function ordinal(n){
    n = Number(n) || 0;
    var s = ["th", "st", "nd", "rd"], v = n % 100;
    return n + (s[(v - 20) % 10] || s[v] || s[0]);
  }

  /* ---------------- home shell ----------------
     Rebuilds .hm-grid into the two-column OSM layout. #hm-account and
     #hm-slots are mount points that renderAccountHub / renderSlots fill. */
  function shellHtml(){
    return '' +
      '<section class="hm-col-prof">' +
        '<div class="hm-sec-label">Profile</div>' +
        '<div class="hm-prof-stack">' +

          '<div class="hm-rowA">' +
            '<div id="hm-account"></div>' +
            '<div class="hm-side">' +
              '<button class="hm-side-card" type="button" data-soon="join">' +
                '<span class="hm-side-dot"></span>' +
                '<span class="hm-side-emoji">🏴‍☠️</span>' +
                '<span class="hm-side-l">Join crew</span>' +
              '</button>' +
              '<button class="hm-side-card" type="button" data-soon="free">' +
                '<span class="hm-side-emoji">🎁</span>' +
                '<span class="hm-side-l">Free 50</span>' +
                '<span class="hm-side-sub">binnenkort</span>' +
              '</button>' +
            '</div>' +
          '</div>' +

          '<div class="hm-rowB">' +
            '<div class="hm-mission">' +
              '<span class="hm-box-tag">binnenkort</span>' +
              '<div class="hm-mission-h">Missions</div>' +
              '<div class="hm-mission-c">0 / 3</div>' +
              '<div class="hm-mission-s">Daily challenges</div>' +
            '</div>' +
            '<div class="hm-news">' +
              '<span class="hm-news-badge">📰 News</span>' +
              '<div class="hm-news-h">Newspaper by big news morgan</div>' +
            '</div>' +
          '</div>' +

          '<div class="hm-rowC">' +
            '<div class="hm-stat"><div class="hm-stat-h">Achievements</div><div class="hm-stat-v">0 / 68</div><div class="hm-stat-ic">🏅</div></div>' +
            '<div class="hm-stat"><div class="hm-stat-h">Domination</div><div class="hm-stat-v">0%</div><div class="hm-stat-ic">🌐</div></div>' +
            '<div class="hm-stat"><div class="hm-stat-h">Ranking</div><div class="hm-stat-v">–</div><div class="hm-stat-ic">🏆</div></div>' +
            '<div class="hm-stat"><div class="hm-stat-h">Prizes</div><div class="hm-stat-v">0</div><div class="hm-stat-ic">🏺</div></div>' +
          '</div>' +

        '</div>' +
      '</section>' +

      '<section class="hm-col-slots">' +
        '<div class="hm-sec-label">Manager slots</div>' +
        '<div class="hm-slots" id="hm-slots"></div>' +
      '</section>';
  }

  function ensureShell(){
    var grid = document.querySelector("#screen-newgame .hm-grid");
    if (!grid){
      var wrap = document.querySelector("#screen-newgame .hm-wrap") || el("screen-newgame");
      if (!wrap) return;
      grid = document.createElement("div");
      grid.className = "hm-grid";
      wrap.appendChild(grid);
    }
    grid.innerHTML = shellHtml();
  }

  /* ---------------- profile card (left) ---------------- */
  function renderAccountHub(){
    var box = el("hm-account");
    if (!box) return;
    var u = (typeof Auth !== "undefined" && Auth.getUser) ? Auth.getUser() : null;
    var name = u ? u.username : "Guest";

    box.innerHTML =
      '<div class="hm-prof">' +
        '<div class="hm-prof-top">' +
          '<div class="hm-prof-ic">' +
            '<button class="hm-ic" id="hm-settings" type="button" aria-label="Settings">' +
              '<svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round"><circle cx="12" cy="12" r="3"/><path d="M19.4 15a1.65 1.65 0 0 0 .33 1.82l.06.06a2 2 0 1 1-2.83 2.83l-.06-.06a1.65 1.65 0 0 0-1.82-.33 1.65 1.65 0 0 0-1 1.51V21a2 2 0 0 1-4 0v-.09A1.65 1.65 0 0 0 9 19.4a1.65 1.65 0 0 0-1.82.33l-.06.06a2 2 0 1 1-2.83-2.83l.06-.06a1.65 1.65 0 0 0 .33-1.82 1.65 1.65 0 0 0-1.51-1H3a2 2 0 0 1 0-4h.09A1.65 1.65 0 0 0 4.6 9a1.65 1.65 0 0 0-.33-1.82l-.06-.06a2 2 0 1 1 2.83-2.83l.06.06a1.65 1.65 0 0 0 1.82.33H9a1.65 1.65 0 0 0 1-1.51V3a2 2 0 0 1 4 0v.09a1.65 1.65 0 0 0 1 1.51 1.65 1.65 0 0 0 1.82-.33l.06-.06a2 2 0 1 1 2.83 2.83l-.06.06a1.65 1.65 0 0 0-.33 1.82V9a1.65 1.65 0 0 0 1.51 1H21a2 2 0 0 1 0 4h-.09a1.65 1.65 0 0 0-1.51 1z"/></svg>' +
            '</button>' +
            '<button class="hm-ic" id="hm-friends" type="button" aria-label="Friends">' +
              '<svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round"><path d="M21 15a2 2 0 0 1-2 2H7l-4 4V5a2 2 0 0 1 2-2h14a2 2 0 0 1 2 2z"/></svg>' +
            '</button>' +
          '</div>' +
          '<div class="hm-flag-nl" title="NL"><i class="r"></i><i class="w"></i><i class="b"></i></div>' +
        '</div>' +

        '<div class="hm-prof-mid" id="hm-account-btn" role="button" tabindex="0" title="Account">' +
          '<div class="hm-av" style="background:' + colorOf(name) + '">' + initialOf(name) + '</div>' +
          '<div class="hm-name">' + esc(name) + '</div>' +
        '</div>' +

        '<div class="hm-prof-bottom">' +
          '<div class="hm-shield">1</div>' +
          '<div class="hm-lvl">' +
            '<div class="hm-lvl-row">' +
              '<span class="hm-lvl-t">Rookie</span>' +
              '<span class="hm-berries"><span class="hm-coin"></span> 30.000.000</span>' +
            '</div>' +
            '<div class="hm-bar"><i></i></div>' +
          '</div>' +
        '</div>' +
      '</div>';

    var s = el("hm-settings");    if (s) s.addEventListener("click", function (){ activateScreen("screen-settings"); });
    var f = el("hm-friends");     if (f) f.addEventListener("click", function (){ activateScreen("screen-friends"); });
    var a = el("hm-account-btn");
    if (a){
      a.addEventListener("click", openAccount);
      a.addEventListener("keydown", function (e){ if (e.key === "Enter" || e.key === " "){ e.preventDefault(); openAccount(); } });
    }
  }

  /* ---------------- crew slots (right) ---------------- */
  function spSlot(s, num){
    var flag = colorOf(s.captain || s.crew);
    return '' +
      '<div class="hm-slot filled sp" data-sp="' + s.id + '">' +
        '<div class="hm-slot-num">' + num + '</div>' +
        '<span class="hm-strip" style="background:' + flag + '"></span>' +
        '<div class="hm-slot-body">' +
          '<div class="hm-slot-top">' +
            '<span class="hm-flag" style="background:' + flag + '">' + initialOf(s.captain || s.crew) + '</span>' +
            '<span class="hm-mode solo">SOLO</span>' +
          '</div>' +
          '<div class="hm-crew">' + esc(s.crew) + '</div>' +
          '<div class="hm-meta">Captain ' + esc(s.captain) + ' \u00b7 Day ' + (s.day || 1) + ' / 30</div>' +
          '<div class="hm-foot"><span></span><span class="hm-play">Continue</span></div>' +
        '</div>' +
        '<span class="hm-del" data-del="' + s.id + '" data-crew="' + esc(s.crew) + '" role="button" aria-label="Delete save">\u00d7</span>' +
      '</div>';
  }

  function onlineSlot(w, num){
    var flag = colorOf(w.captain || w.crewName);
    var meta, foot;
    if (w.status === "open"){
      meta = "Grand Line \u00b7 Preparation day";
      foot = '<span class="hm-rec">Recruiting</span><span class="hm-play">Open</span>';
    } else if (w.status === "finished"){
      meta = "Grand Line \u00b7 Season finished";
      foot = '<span class="hm-rec">' + (w.points || 0) + ' pts</span><span class="hm-play">Open</span>';
    } else {
      meta = "Grand Line \u00b7 Day " + (w.currentDay || 0) + " / " + (w.totalDays || 30) +
             (w.rank ? (" \u00b7 " + ordinal(w.rank)) : "");
      foot = '<span class="hm-rec">' + (w.points || 0) + ' pts</span><span class="hm-play">Open</span>';
    }
    return '' +
      '<div class="hm-slot filled online" data-online="' + esc(w.worldId) + '">' +
        '<div class="hm-slot-num">' + num + '</div>' +
        '<span class="hm-strip" style="background:' + flag + '"></span>' +
        '<div class="hm-slot-body">' +
          '<div class="hm-slot-top">' +
            '<span class="hm-flag" style="background:' + flag + '">' + initialOf(w.captain || w.crewName) + '</span>' +
            '<span class="hm-mode online">ONLINE</span>' +
          '</div>' +
          '<div class="hm-crew">' + esc(w.crewName || "Your crew") + '</div>' +
          '<div class="hm-meta">' + esc(meta) + '</div>' +
          '<div class="hm-foot">' + foot + '</div>' +
        '</div>' +
      '</div>';
  }

  function emptySlot(num){
    return '<div class="hm-slot empty" data-new="1">' +
             '<div class="hm-slot-num">' + num + '</div>' +
             '<div class="hm-plus">+</div>' +
             '<div class="hm-empty-l">New crew</div>' +
           '</div>';
  }

  async function renderSlots(){
    var box = el("hm-slots");
    if (!box) return;
    box.innerHTML = '<div class="hm-loading">Hoisting the sails\u2026</div>';

    var sp = [];
    try { sp = (Store.get(SAVES_KEY) || []).slice().reverse(); } catch (e) { sp = []; }

    var online = [];
    try {
      if (typeof Auth !== "undefined" && Auth.getToken && Auth.getToken() && Api.myLeagues){
        var r = await Api.myLeagues();
        online = (r && r.leagues) || [];
      }
    } catch (e) { online = []; }

    // The shell may have been rebuilt while we awaited; re-grab the mount.
    box = el("hm-slots");
    if (!box) return;

    var html = "", n = 0;
    online.forEach(function (w){ html += onlineSlot(w, ++n); });
    sp.forEach(function (s){ html += spSlot(s, ++n); });

    var filled = n;
    var empties = Math.max(1, 4 - filled);   // OSM-style: always at least one "+" and a full 2x2 when sparse
    for (var i = 0; i < empties; i++) html += emptySlot(++n);

    box.innerHTML = html;
    wireSlots();
  }

  function wireSlots(){
    var box = el("hm-slots");
    if (!box) return;

    box.querySelectorAll("[data-online]").forEach(function (s){
      s.addEventListener("click", function (){
        var id = s.getAttribute("data-online");
        if (typeof window.cmOpenLeague === "function") window.cmOpenLeague(id);
      });
    });

    box.querySelectorAll(".hm-slot.sp").forEach(function (s){
      s.addEventListener("click", function (e){
        if (e.target.closest(".hm-del")) return;
        var id = Number(s.getAttribute("data-sp"));
        if (typeof continueGame === "function") continueGame(id);
      });
    });

    box.querySelectorAll(".hm-del").forEach(function (d){
      d.addEventListener("click", function (e){
        e.stopPropagation();
        var id = Number(d.getAttribute("data-del"));
        var crew = d.getAttribute("data-crew");
        if (typeof deleteSave === "function") deleteSave(id, crew);  // showConfirm -> renderSavedGames() (= renderHome)
      });
    });

    box.querySelectorAll("[data-new]").forEach(function (s){
      s.addEventListener("click", openSetSail);
    });
  }

  /* ---------------- Set Sail modal ---------------- */
  function openSetSail(){
    var ov = document.createElement("div");
    ov.className = "hm-modal-ov";
    ov.innerHTML =
      '<div class="hm-modal">' +
        '<div class="hm-modal-head">' +
          '<div class="hm-modal-ttl">Set sail</div>' +
          '<button class="hm-modal-x" type="button" aria-label="Close">\u00d7</button>' +
        '</div>' +
        '<p class="hm-modal-sub">How should your new crew begin?</p>' +
        '<div class="hm-choices">' +
          '<button class="hm-choice" data-act="offline" type="button">' +
            '<div class="hm-choice-h">Offline Grand Line</div>' +
            '<div class="hm-choice-d">Sail solo against AI crews, at your own pace.</div>' +
          '</button>' +
          '<button class="hm-choice on" data-act="online" type="button">' +
            '<span class="hm-choice-tag">LIVE</span>' +
            '<div class="hm-choice-h">Online Grand Line</div>' +
            '<div class="hm-choice-d">Host a live league \u2014 friends sign on with your code.</div>' +
          '</button>' +
        '</div>' +
        '<div class="hm-modal-or"><span>or join a friend\u2019s voyage</span></div>' +
        '<div class="hm-join-row">' +
          '<input class="hm-join-in" data-code type="text" placeholder="GRD-A12" maxlength="10" />' +
          '<button class="hm-join-go" data-act="join" type="button">Sign on</button>' +
        '</div>' +
        '<div class="hm-modal-err" data-err></div>' +
      '</div>';

    document.body.appendChild(ov);

    function close(){ if (ov.parentNode) ov.parentNode.removeChild(ov); }
    function q(sel){ return ov.querySelector(sel); }
    function showErr(msg){ var e = q("[data-err]"); if (e){ e.textContent = msg || ""; e.style.display = msg ? "block" : "none"; } }

    ov.addEventListener("click", function (e){ if (e.target === ov) close(); });
    q(".hm-modal-x").addEventListener("click", close);
    document.addEventListener("keydown", function onEsc(e){
      if (e.key === "Escape"){ close(); document.removeEventListener("keydown", onEsc); }
    });

    q('[data-act="offline"]').addEventListener("click", function (){
      close();
      if (typeof showScreen === "function") showScreen("screen-create");
    });

    q('[data-act="online"]').addEventListener("click", function (){
      var b = this; b.disabled = true; showErr("");
      Api.createGrandLine().then(function (r){
        close();
        if (typeof window.cmOpenLeague === "function") window.cmOpenLeague(r.id);
      }).catch(function (e){ b.disabled = false; showErr(e.message); });
    });

    function join(){
      showErr("");
      var code = (q("[data-code]").value || "").trim();
      if (!code){ showErr("Enter a join code."); return; }
      var b = q('[data-act="join"]'); b.disabled = true;
      Api.findLeague(code).then(function (r){
        close();
        if (typeof window.cmOpenLeague === "function") window.cmOpenLeague(r.id);
      }).catch(function (e){ b.disabled = false; showErr(e.message); });
    }
    q('[data-act="join"]').addEventListener("click", join);
    q("[data-code]").addEventListener("keydown", function (e){ if (e.key === "Enter") join(); });
  }

  /* ---------------- account / friends / settings screens ---------------- */
  function renderAccount(){
    var u = (typeof Auth !== "undefined" && Auth.getUser) ? Auth.getUser() : null;
    if (!u) return;
    var av = el("ac-avatar"); if (av) av.textContent = initialOf(u.username);
    var nm = el("ac-name");   if (nm) nm.textContent = u.username;
    var em = el("ac-email");  if (em) em.textContent = u.email;
    var adminWrap = el("ac-admin-wrap"); if (adminWrap) adminWrap.style.display = u.isAdmin ? "" : "none";
  }
  function openAccount(){ renderAccount(); activateScreen("screen-account"); }

  /* ---------------- home render entry point ---------------- */
  function renderHome(){ ensureShell(); renderAccountHub(); renderSlots(); }

  /* ---------------- init ---------------- */
  function init(){
    var b;
    b = el("ac-back"); if (b) b.addEventListener("click", function (){ activateScreen("screen-newgame"); });
    b = el("fr-back"); if (b) b.addEventListener("click", function (){ activateScreen("screen-newgame"); });
    b = el("se-back"); if (b) b.addEventListener("click", function (){ activateScreen("screen-newgame"); });

    b = el("ac-admin-open");
    if (b) b.addEventListener("click", function (){
      if (typeof window.cmOpenAdmin === "function") window.cmOpenAdmin();
      else activateScreen("screen-admin");
    });

    b = el("ac-logout");
    if (b) b.addEventListener("click", function (){
      if (typeof window.cmLogout === "function") window.cmLogout();
    });

    // The slots home is now the saved-games view, so every "return to the menu"
    // path refreshes it: save & exit, delete, back buttons (renderSavedGames),
    // and post-login (cmRenderTopbar) all flow through renderHome.
    window.renderSavedGames = renderHome;
    window.cmRenderTopbar   = renderHome;
    window.cmRenderHome     = renderHome;

    renderHome();
  }

  document.addEventListener("DOMContentLoaded", init);
})();