"use strict";

(function () {
  function el(id){ return document.getElementById(id); }

  function esc(s){
    return String(s == null ? "" : s).replace(/[&<>"']/g, function (c){
      return ({ "&":"&amp;", "<":"&lt;", ">":"&gt;", '"':"&quot;", "'":"&#39;" })[c];
    });
  }

  function activateScreen(id){
    try { if (typeof showScreen === "function") showScreen(id); } catch (e) {}
    var t = el(id);
    if (t && !t.classList.contains("is-active")) {
      document.querySelectorAll(".screen").forEach(function (s){ s.classList.remove("is-active"); });
      t.classList.add("is-active");
    }
  }

  function avatarColor(s){
    var colors = ["#c0492f", "#1d9e75", "#7a5bbd", "#2f6f96", "#b07a1e", "#a33a6b"];
    var h = 0; s = String(s || "");
    for (var i = 0; i < s.length; i++) h = (h * 31 + s.charCodeAt(i)) >>> 0;
    return colors[h % colors.length];
  }

  function initial(s){ s = String(s || ""); return (s[0] || "?").toUpperCase(); }

  var ICON = {
    edit: '<svg viewBox="0 0 24 24" width="16" height="16" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round"><path d="M4 20h4l10-10-4-4L4 16v4z"/><path d="M13.5 6.5l4 4"/></svg>',
    trash: '<svg viewBox="0 0 24 24" width="16" height="16" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round"><path d="M4 7h16M9 7V5h6v2M6 7l1 13h10l1-13"/></svg>'
  };

  var state = { section: "overview", characters: [], charView: "list", editingId: null, search: "" };

  function content(){ return el("adm-content"); }
  function loadingBox(){ return '<div class="adm-loading">Loading…</div>'; }
  function errorBox(msg){ return '<div class="adm-err">' + esc(msg) + '</div>'; }

  function fmtDate(iso){
    if (!iso) return "";
    try { return new Date(iso).toLocaleDateString(); } catch (e) { return ""; }
  }

  // ---------- Navigatie ----------
  function setSection(name){
    state.section = name;
    document.querySelectorAll("#screen-admin .adm-nav[data-section]").forEach(function (b){
      b.classList.toggle("active", b.getAttribute("data-section") === name);
    });
    if (name === "overview") renderOverview();
    else if (name === "users") renderUsers();
    else if (name === "characters") { state.charView = "list"; state.editingId = null; renderCharacters(); }
    else if (name === "worlds") renderWorlds();
    else if (name === "settings") renderAdminSettings();
    else renderPlaceholder(name);
  }

  function renderPlaceholder(name){
    var title = name === "worlds" ? "Worlds" : "Settings";
    var txt = name === "worlds"
      ? "Coming soon — shared competitions and standings."
      : "Coming soon — global game settings.";
    content().innerHTML = '<div class="adm-h">' + title + '</div><div class="adm-soon">' + esc(txt) + '</div>';
  }

  // ---------- Overview ----------
  function statCard(num, label){
    return '<div class="adm-stat"><div class="adm-stat-num">' + (num == null ? 0 : num) +
           '</div><div class="adm-stat-lbl">' + esc(label) + '</div></div>';
  }

  async function renderOverview(){
    content().innerHTML = '<div class="adm-h">Overview</div>' + loadingBox();
    try {
      var data = await Api.adminStats();
      var s = data.stats || {};
      var html = '<div class="adm-h">Overview</div><div class="adm-stat-grid">';
      html += statCard(s.users, "Users");
      html += statCard(s.characters, "Characters");
      html += statCard(s.worlds, "Worlds");
      html += statCard(s.managers, "Managers");
      html += '</div><div class="adm-panel"><div class="adm-panel-h">Recent sign-ups</div>';
      var list = data.recentUsers || [];
      if (!list.length) html += '<div class="adm-muted">No users yet.</div>';
      list.forEach(function (u){ html += userRow(u, false); });
      html += '</div>';
      content().innerHTML = html;
    } catch (e) {
      content().innerHTML = '<div class="adm-h">Overview</div>' + errorBox(e.message);
    }
  }

  function userRow(u, withActions){
    var badge = u.isAdmin ? '<span class="adm-tag">Admin</span>' : '';
    var actions = "";
    if (withActions){
      actions =
        '<button class="adm-mini" data-act="toggle-admin" data-id="' + esc(u.id) + '" data-admin="' + (u.isAdmin ? "1" : "0") + '">' +
          (u.isAdmin ? "Remove admin" : "Make admin") + '</button>' +
        '<button class="adm-mini del" data-act="del-user" data-id="' + esc(u.id) + '" data-name="' + esc(u.username) + '">Delete</button>';
    }
    return '<div class="adm-urow">' +
      '<div class="adm-uav" style="background:' + avatarColor(u.username) + ';color:#fff;">' + esc(initial(u.username)) + '</div>' +
      '<div style="flex:1; min-width:0;"><div class="adm-uname">' + esc(u.username) + '</div>' +
      '<div class="adm-umail">' + esc(u.email) + '</div></div>' +
      badge +
      '<span class="adm-date">' + esc(fmtDate(u.createdAt)) + '</span>' +
      actions + '</div>';
  }

  // ---------- Users ----------
  async function renderUsers(){
    content().innerHTML = '<div class="adm-h">Users</div>' + loadingBox();
    try {
      var data = await Api.adminUsers();
      var html = '<div class="adm-h">Users</div><div class="adm-panel">';
      var list = data.users || [];
      if (!list.length) html += '<div class="adm-muted">No users yet.</div>';
      list.forEach(function (u){ html += userRow(u, true); });
      html += '</div>';
      content().innerHTML = html;

      content().querySelectorAll('[data-act="toggle-admin"]').forEach(function (b){
        b.addEventListener("click", function (){ toggleAdmin(b.getAttribute("data-id"), b.getAttribute("data-admin") !== "1"); });
      });
      content().querySelectorAll('[data-act="del-user"]').forEach(function (b){
        b.addEventListener("click", function (){ delUser(b.getAttribute("data-id"), b.getAttribute("data-name")); });
      });
    } catch (e) {
      content().innerHTML = '<div class="adm-h">Users</div>' + errorBox(e.message);
    }
  }

  async function toggleAdmin(id, makeAdmin){
    try { await Api.setUserAdmin(id, makeAdmin); renderUsers(); }
    catch (e) { alert(e.message); }
  }

  async function delUser(id, name){
    if (!confirm('Delete account "' + name + '"? This cannot be undone.')) return;
    try { await Api.deleteUser(id); renderUsers(); }
    catch (e) { alert(e.message); }
  }

  // ---------- Characters ----------
  async function renderCharacters(){
    if (state.charView === "form") { renderCharacterForm(); return; }
    content().innerHTML = '<div class="adm-h">Characters</div>' + loadingBox();
    try {
      var data = await Api.adminCharacters(state.search);
      state.characters = data.characters || [];
      var html = '<div class="adm-h">Characters</div>';
      html += '<div class="adm-toolbar">' +
        '<input id="adm-search" class="adm-search-input" type="text" placeholder="Search characters…" value="' + esc(state.search) + '" />' +
        '<button id="adm-add" class="adm-add">+ Add character</button></div>';
      html += '<div class="adm-panel">';
      if (!state.characters.length) html += '<div class="adm-muted">No characters found.</div>';
      state.characters.forEach(function (c){ html += charRow(c); });
      html += '</div>';
      content().innerHTML = html;

      var search = el("adm-search");
      if (search) search.addEventListener("keydown", function (e){ if (e.key === "Enter"){ state.search = search.value.trim(); renderCharacters(); } });
      var add = el("adm-add");
      if (add) add.addEventListener("click", function (){ openForm(null); });
      content().querySelectorAll('[data-act="edit"]').forEach(function (b){
        b.addEventListener("click", function (){ openForm(b.getAttribute("data-id")); });
      });
      content().querySelectorAll('[data-act="del"]').forEach(function (b){
        b.addEventListener("click", function (){ delCharacter(b.getAttribute("data-id"), b.getAttribute("data-name")); });
      });
    } catch (e) {
      content().innerHTML = '<div class="adm-h">Characters</div>' + errorBox(e.message);
    }
  }

  function charRow(c){
    var badge = c.role ? '<span class="adm-badge">' + esc(c.role) + '</span>' : '';
    var av = c.imageUrl
      ? '<div class="adm-cav" style="background-image:url(\'' + esc(c.imageUrl) + '\');"></div>'
      : '<div class="adm-cav" style="background:' + avatarColor(c.name) + ';color:#fff;">' + esc(initial(c.name)) + '</div>';
    return '<div class="adm-crow">' + av +
      '<div style="flex:1; min-width:0;"><div class="adm-cname">' + esc(c.name) + '</div>' + badge +
      '<div class="adm-cstats">P ' + (c.power || 0) + ' · D ' + (c.defense || 0) + ' · S ' + (c.speed || 0) +
      (c.crew ? ' · ' + esc(c.crew) : '') + '</div></div>' +
      '<button class="adm-ico" data-act="edit" data-id="' + esc(c.id) + '" aria-label="Edit">' + ICON.edit + '</button>' +
      '<button class="adm-ico del" data-act="del" data-id="' + esc(c.id) + '" data-name="' + esc(c.name) + '" aria-label="Delete">' + ICON.trash + '</button>' +
      '</div>';
  }

  function findChar(id){
    for (var i = 0; i < state.characters.length; i++) if (state.characters[i].id === id) return state.characters[i];
    return null;
  }

  function uniqueValues(key){
    var set = {};
    state.characters.forEach(function (c){ if (c[key]) set[c[key]] = true; });
    return Object.keys(set).sort();
  }

  function openForm(id){
    state.charView = "form";
    state.editingId = id;
    renderCharacterForm();
  }

  function statInput(id, label, val){
    return '<div><label class="adm-label">' + label + '</label>' +
      '<input id="' + id + '" class="adm-field2" type="number" min="0" max="100" value="' + (val === "" || val == null ? "" : val) + '" placeholder="0" /></div>';
  }

  function datalist(id, values){
    return '<datalist id="' + id + '">' + values.map(function (v){ return '<option value="' + esc(v) + '"></option>'; }).join("") + '</datalist>';
  }

  function renderCharacterForm(){
    var c = state.editingId ? findChar(state.editingId) : null;
    var title = c ? "Edit character" : "New character";

    var html = '<div class="adm-h">' + title + '</div><div class="adm-panel">';
    html += '<div id="cf-error" class="adm-err" style="display:none;"></div>';

    html += '<div class="adm-form-top">';
    html += '<div class="cf-photo-wrap"><label class="adm-label">Photo</label>' +
            '<div id="cf-preview" class="cf-preview"' + (c && c.imageUrl ? ' style="background-image:url(\'' + esc(c.imageUrl) + '\');"' : '') + '>' +
            (c && c.imageUrl ? '' : '<span>No image</span>') + '</div></div>';
    html += '<div style="flex:1; min-width:0;">' +
            '<label class="adm-label">Name</label>' +
            '<input id="cf-name" class="adm-field2" type="text" maxlength="60" value="' + esc(c ? c.name : "") + '" placeholder="Character name" />' +
            '<label class="adm-label">Image URL (optional)</label>' +
            '<input id="cf-image" class="adm-field2" type="text" value="' + esc(c && c.imageUrl ? c.imageUrl : "") + '" placeholder="https://…" /></div>';
    html += '</div>';

    html += '<div class="adm-form-grid2">' +
            '<div><label class="adm-label">Role</label><input id="cf-role" class="adm-field2" type="text" list="cf-roles" value="' + esc(c ? c.role : "") + '" placeholder="e.g. Striker" />' + datalist("cf-roles", uniqueValues("role")) + '</div>' +
            '<div><label class="adm-label">Crew</label><input id="cf-crew" class="adm-field2" type="text" list="cf-crews" value="' + esc(c ? c.crew : "") + '" placeholder="e.g. Sunrise Pirates" />' + datalist("cf-crews", uniqueValues("crew")) + '</div></div>';

    html += '<label class="adm-label">Alt roles (optional, comma-separated)</label>' +
            '<input id="cf-altroles" class="adm-field2" type="text" value="' + esc(c && c.altRoles ? c.altRoles.join(", ") : "") + '" placeholder="e.g. Captain, Midfielder" />';

    html += '<div class="adm-form-grid3">' +
            statInput("cf-power", "Power", c ? c.power : "") +
            statInput("cf-defense", "Defense", c ? c.defense : "") +
            statInput("cf-speed", "Speed", c ? c.speed : "") + '</div>';

    html += '<label class="adm-label">Attacks (optional, one per line)</label>' +
            '<textarea id="cf-attacks" class="adm-field2" rows="3" placeholder="One attack per line">' + esc(c && c.attacks ? c.attacks.join("\n") : "") + '</textarea>';

    html += '<div class="adm-form-grid2" style="margin-top:4px;">' +
            '<label class="adm-check"><input id="cf-captain" type="checkbox"' + (c && c.isCaptain ? " checked" : "") + ' /> Captain</label>' +
            '<label class="adm-check"><input id="cf-navy" type="checkbox"' + (c && c.isNavy ? " checked" : "") + ' /> Marine</label></div>';

    html += '<div class="adm-form-actions">' +
            '<button id="cf-cancel" class="adm-cancel">Cancel</button>' +
            '<button id="cf-save" class="adm-save">' + (c ? "Save changes" : "Save character") + '</button></div>';

    html += '</div>';
    content().innerHTML = html;

    el("cf-cancel").addEventListener("click", function (){ state.charView = "list"; state.editingId = null; renderCharacters(); });
    el("cf-save").addEventListener("click", saveCharacter);
    el("cf-image").addEventListener("input", function (){
      var url = el("cf-image").value.trim();
      var p = el("cf-preview");
      if (url){ p.style.backgroundImage = "url('" + url + "')"; p.innerHTML = ""; }
      else { p.style.backgroundImage = ""; p.innerHTML = "<span>No image</span>"; }
    });
  }

  function showFormError(msg){
    var e = el("cf-error");
    if (e){ e.textContent = msg; e.style.display = msg ? "block" : "none"; }
  }

  async function saveCharacter(){
    showFormError("");
    var name = el("cf-name").value.trim();
    if (!name){ showFormError("Name is required."); return; }
    var role = el("cf-role").value.trim();
    if (!role){ showFormError("Role is required."); return; }

    var body = {
      name: name,
      role: role,
      altRoles: el("cf-altroles").value.split(",").map(function (s){ return s.trim(); }).filter(Boolean),
      power: Number(el("cf-power").value) || 0,
      defense: Number(el("cf-defense").value) || 0,
      speed: Number(el("cf-speed").value) || 0,
      crew: el("cf-crew").value.trim(),
      imageUrl: el("cf-image").value.trim(),
      attacks: el("cf-attacks").value.split("\n").map(function (s){ return s.trim(); }).filter(Boolean),
      isCaptain: el("cf-captain").checked,
      isNavy: el("cf-navy").checked
    };

    var btn = el("cf-save");
    var label = btn.textContent;
    btn.disabled = true; btn.textContent = "Saving…";
    try {
      if (state.editingId) await Api.updateCharacter(state.editingId, body);
      else await Api.createCharacter(body);
      state.charView = "list"; state.editingId = null; state.search = "";
      await renderCharacters();
    } catch (e) {
      showFormError(e.message);
      btn.disabled = false; btn.textContent = label;
    }
  }

  async function delCharacter(id, name){
    if (!confirm('Delete "' + name + '"? This cannot be undone.')) return;
    try { await Api.deleteCharacter(id); await renderCharacters(); }
    catch (e) { alert(e.message); }
  }

  // ---------- Worlds ----------
  function worldBadge(status){
    if (status === "active") return '<span class="wl-badge act">Active</span>';
    if (status === "finished") return '<span class="wl-badge fin">Finished</span>';
    return '<span class="wl-badge open">Open</span>';
  }

  function worldRow(w){
    var sub = (w.players || 0) + '/' + (w.maxPlayers || 0) + ' players';
    if (w.status === "active") sub += ' \u00b7 Day ' + w.currentDay + (w.totalDays ? (' of ' + w.totalDays) : '');
    else if (w.status === "open") sub += ' \u00b7 waiting to start';
    var btns = '';
    if (w.status === "open") btns += '<button class="adm-mini" data-act="start-world" data-id="' + esc(w.id) + '">Start</button>';
    btns += '<button class="adm-mini del" data-act="del-world" data-id="' + esc(w.id) + '" data-name="' + esc(w.name) + '">Delete</button>';
    return '<div class="adm-wrow">' +
      '<div style="flex:1;min-width:0"><div class="adm-wname">' + esc(w.name) + '</div>' +
      '<div class="adm-wsub">Code <span class="adm-wcode">' + esc(w.joinCode) + '</span> \u00b7 ' + esc(sub) + '</div></div>' +
      worldBadge(w.status) + '<div class="adm-wbtns">' + btns + '</div></div>';
  }

  function bindWorldRowActions(){
    content().querySelectorAll('[data-act="start-world"]').forEach(function (b){
      b.addEventListener("click", function (){ startWorld(b.getAttribute("data-id")); });
    });
    content().querySelectorAll('[data-act="del-world"]').forEach(function (b){
      b.addEventListener("click", function (){ delWorld(b.getAttribute("data-id"), b.getAttribute("data-name")); });
    });
  }

  async function renderWorlds(){
    content().innerHTML = '<div class="adm-h">Worlds</div>' + loadingBox();
    try {
      var data = await Api.adminWorlds();
      var list = data.worlds || [];
      var html = '<div class="adm-h">Worlds</div>';
      html += '<div class="adm-toolbar"><div style="flex:1"></div><button id="aw-new" class="adm-add">+ Create world</button></div>';
      html += '<div id="aw-form"></div>';
      html += '<div class="adm-panel">';
      if (!list.length) html += '<div class="adm-muted">No worlds yet. Create one to get started.</div>';
      list.forEach(function (w){ html += worldRow(w); });
      html += '</div>';
      content().innerHTML = html;
      el("aw-new").addEventListener("click", toggleWorldForm);
      bindWorldRowActions();
    } catch (e) {
      content().innerHTML = '<div class="adm-h">Worlds</div>' + errorBox(e.message);
    }
  }

  function toggleWorldForm(){
    var box = el("aw-form");
    if (!box) return;
    if (box.innerHTML){ box.innerHTML = ""; return; }
    box.innerHTML =
      '<div class="adm-panel" style="margin-bottom:12px">' +
      '<div id="aw-error" class="adm-err" style="display:none"></div>' +
      '<label class="adm-label">World name</label>' +
      '<input id="aw-name" class="adm-field2" type="text" maxlength="40" placeholder="e.g. Grand Line" />' +
      '<div class="adm-form-grid2">' +
      '<div><label class="adm-label">Difficulty</label>' +
      '<select id="aw-diff" class="adm-field2"><option value="easy">Easy</option><option value="normal" selected>Normal</option><option value="hard">Hard</option></select></div>' +
      '<div><label class="adm-label">Max players</label>' +
      '<input id="aw-max" class="adm-field2" type="number" min="2" max="32" value="16" /></div></div>' +
      '<div class="adm-form-actions"><button id="aw-cancel" class="adm-cancel">Cancel</button>' +
      '<button id="aw-save" class="adm-save">Create world</button></div></div>';
    el("aw-cancel").addEventListener("click", function (){ box.innerHTML = ""; });
    el("aw-save").addEventListener("click", createWorld);
  }

  async function createWorld(){
    var errBox = el("aw-error");
    function showErr(m){ if (errBox){ errBox.textContent = m; errBox.style.display = m ? "block" : "none"; } }
    showErr("");
    var name = el("aw-name").value.trim();
    if (!name){ showErr("World name is required."); return; }
    var body = { name: name, difficulty: el("aw-diff").value, maxPlayers: Number(el("aw-max").value) || 16 };
    var btn = el("aw-save");
    btn.disabled = true; btn.textContent = "Creating\u2026";
    try { await Api.createWorld(body); await renderWorlds(); }
    catch (e){ showErr(e.message); btn.disabled = false; btn.textContent = "Create world"; }
  }

  async function startWorld(id){
    if (!confirm("Start this world now? Players can no longer join after it starts.")) return;
    try { await Api.startWorld(id); await renderWorlds(); }
    catch (e){ alert(e.message); }
  }

  async function delWorld(id, name){
    if (!confirm('Delete world "' + name + '"? This removes all its players and matches.')) return;
    try { await Api.deleteWorld(id); await renderWorlds(); }
    catch (e){ alert(e.message); }
  }

  // ---------- Global settings ----------
  async function renderAdminSettings(){
    content().innerHTML = '<div class="adm-h">Settings</div>' + loadingBox();
    try {
      var data = await Api.adminGetSettings();
      var s = data.settings || {};
      var html = '<div class="adm-h">Settings</div>';
      html += '<div id="as-error" class="adm-err" style="display:none"></div>';
      html += '<div class="adm-panel" style="margin-bottom:12px"><div class="adm-panel-h">Economy</div>' +
        '<label class="adm-label">Starting funds (\u0243)</label>' +
        '<input id="as-funds" class="adm-field2" type="number" min="0" step="1" value="' + (s.startingFunds || 0) + '" /></div>';
      html += '<div class="adm-panel" style="margin-bottom:12px"><div class="adm-panel-h">Access</div>' +
        '<label class="adm-check"><input id="as-reg" type="checkbox"' + (s.registrationOpen !== false ? " checked" : "") + ' /> Registration open</label>' +
        '<label class="adm-check"><input id="as-maint" type="checkbox"' + (s.maintenanceMode === true ? " checked" : "") + ' /> Maintenance mode</label></div>';
      html += '<div class="adm-panel" style="margin-bottom:12px"><div class="adm-panel-h">Broadcast</div>' +
        '<textarea id="as-broadcast" class="adm-field2" rows="2" placeholder="Message shown to all players\u2026">' + esc(s.broadcast || "") + '</textarea></div>';
      html += '<div class="adm-form-actions"><button id="as-save" class="adm-save">Save settings</button></div>';
      content().innerHTML = html;
      el("as-save").addEventListener("click", saveAdminSettings);
    } catch (e) {
      content().innerHTML = '<div class="adm-h">Settings</div>' + errorBox(e.message);
    }
  }

  async function saveAdminSettings(){
    var errBox = el("as-error");
    function showErr(m){ if (errBox){ errBox.textContent = m; errBox.style.display = m ? "block" : "none"; } }
    showErr("");
    var body = {
      startingFunds: Number(el("as-funds").value) || 0,
      registrationOpen: el("as-reg").checked,
      maintenanceMode: el("as-maint").checked,
      broadcast: el("as-broadcast").value
    };
    var btn = el("as-save");
    var label = btn.textContent;
    btn.disabled = true; btn.textContent = "Saving\u2026";
    try {
      await Api.adminSaveSettings(body);
      btn.disabled = false; btn.textContent = "Saved \u2713";
      setTimeout(function (){ if (el("as-save")) el("as-save").textContent = label; }, 1500);
    } catch (e){ showErr(e.message); btn.disabled = false; btn.textContent = label; }
  }

  // ---------- Init ----------
  window.cmOpenAdmin = function (){
    activateScreen("screen-admin");
    setSection("overview");
  };

  function init(){
    document.querySelectorAll("#screen-admin .adm-nav[data-section]").forEach(function (b){
      b.addEventListener("click", function (){ setSection(b.getAttribute("data-section")); });
    });
    var back = el("adm-to-game");
    if (back) back.addEventListener("click", function (){ activateScreen("screen-newgame"); });
  }

  document.addEventListener("DOMContentLoaded", init);
})();