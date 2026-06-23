"use strict";

(function () {
  function el(id){ return document.getElementById(id); }

  function showError(which, msg){
    const box = el(which === "register" ? "auth-reg-error" : "auth-login-error");
    if (!box) return;
    box.textContent = msg || "";
    box.style.display = msg ? "block" : "none";
  }

  function setBusy(btn, busy, idleLabel){
    if (!btn) return;
    btn.disabled = busy;
    btn.textContent = busy ? "Please wait…" : idleLabel;
  }

  function activateScreen(id){
    try { if (typeof showScreen === "function") showScreen(id); } catch (e) {}
    const target = el(id);
    if (target && !target.classList.contains("is-active")) {
      document.querySelectorAll(".screen").forEach(function (s){ s.classList.remove("is-active"); });
      target.classList.add("is-active");
    }
  }

  function enterGame(){
    activateScreen("screen-newgame");
    if (typeof cmRenderTopbar === "function") cmRenderTopbar();
  }

  async function handleRegister(){
    showError("register", "");
    const username = el("auth-reg-username").value.trim();
    const email    = el("auth-reg-email").value.trim();
    const password = el("auth-reg-password").value;
    const confirm  = el("auth-reg-confirm").value;

    if (!username || !email || !password) { showError("register", "Please fill in all fields."); return; }
    if (password !== confirm)             { showError("register", "Passwords do not match."); return; }
    if (password.length < 8)              { showError("register", "Password must be at least 8 characters."); return; }

    const btn = el("auth-reg-btn");
    setBusy(btn, true, "Create account");
    try {
      const data = await Api.register(username, email, password);
      Auth.setToken(data.token);
      Auth.setUser(data.user);
      enterGame();
    } catch (err) {
      showError("register", err.message);
    } finally {
      setBusy(btn, false, "Create account");
    }
  }

  async function handleLogin(){
    showError("login", "");
    const email    = el("auth-login-email").value.trim();
    const password = el("auth-login-password").value;

    if (!email || !password) { showError("login", "Please enter your email and password."); return; }

    const btn = el("auth-login-btn");
    setBusy(btn, true, "Log in");
    try {
      const data = await Api.login(email, password);
      Auth.setToken(data.token);
      Auth.setUser(data.user);
      enterGame();
    } catch (err) {
      showError("login", err.message);
    } finally {
      setBusy(btn, false, "Log in");
    }
  }

  function switchForm(which){
    const reg = el("auth-form-register"), log = el("auth-form-login");
    if (which === "register") { reg.style.display = ""; log.style.display = "none"; }
    else                      { reg.style.display = "none"; log.style.display = ""; }
    showError("register", ""); showError("login", "");
  }

  async function initAuth(){
    el("auth-login-btn")?.addEventListener("click", handleLogin);
    el("auth-reg-btn")?.addEventListener("click", handleRegister);
    el("auth-to-register")?.addEventListener("click", function (e){ e.preventDefault(); switchForm("register"); });
    el("auth-to-login")?.addEventListener("click", function (e){ e.preventDefault(); switchForm("login"); });

    ["auth-login-email", "auth-login-password"].forEach(function (id){
      el(id)?.addEventListener("keydown", function (e){ if (e.key === "Enter") handleLogin(); });
    });
    ["auth-reg-username", "auth-reg-email", "auth-reg-password", "auth-reg-confirm"].forEach(function (id){
      el(id)?.addEventListener("keydown", function (e){ if (e.key === "Enter") handleRegister(); });
    });

    switchForm("login");

    if (Auth.getToken()) {
      try {
        const data = await Api.me();
        Auth.setUser(data.user);
        enterGame();
        return;
      } catch (e) {
        Auth.clear();
      }
    }
  }

  document.addEventListener("DOMContentLoaded", initAuth);

  window.cmLogout = function (){
    Auth.clear();
    activateScreen("screen-auth");
  };
})();