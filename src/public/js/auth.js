import { state } from "./state.js";
import { switchTab, loadDataForActiveTab } from "./router.js";

export async function loadUserProfiles() {
  try {
    const res  = await fetch("/api/users");
    const data = await res.json();
    if (data.success) {
      state.userProfiles = data.users;
      renderProfileDropdown();
    }
  } catch (err) {
    console.error("ユーザー情報の読み込みに失敗:", err);
  }
}

function renderProfileDropdown() {
  const select = document.getElementById("user-select");
  select.replaceChildren();
  state.userProfiles.forEach(uid => {
    const opt       = document.createElement("option");
    opt.value       = uid;
    opt.textContent = uid.length > 15 ? `${uid.substring(0, 8)}...` : uid;
    opt.selected    = uid === state.activeUserId;
    select.appendChild(opt);
  });
}

export function initAuth() {
  document.getElementById("user-select")?.addEventListener("change", e => {
    state.activeUserId = e.target.value;
    loadDataForActiveTab();
  });

  document.getElementById("login-form")?.addEventListener("submit", async e => {
    e.preventDefault();
    const errorEl  = document.getElementById("login-error");
    errorEl.textContent = "";
    const passcode = document.getElementById("passcode").value.trim();
    try {
      const res  = await fetch("/api/login", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ passcode }),
      });
      const data = await res.json();
      if (data.success) {
        document.getElementById("login-overlay").classList.remove("active");
        document.getElementById("app-container").classList.remove("hidden");
        await loadUserProfiles();
        if (state.userProfiles.length > 0) state.activeUserId = state.userProfiles[0];
        switchTab("dashboard");
      } else {
        errorEl.textContent = data.message;
      }
    } catch {
      document.getElementById("login-error").textContent = "サーバー接続に失敗しました。";
    }
  });

  document.getElementById("btn-logout")?.addEventListener("click", async () => {
    try { await fetch("/api/logout", { method: "POST" }); } catch {}
    document.getElementById("app-container").classList.add("hidden");
    document.getElementById("login-overlay").classList.add("active");
    document.getElementById("passcode").value = "";
    document.getElementById("login-error").textContent = "ログアウトしました。";
  });

  document.getElementById("profile-form")?.addEventListener("submit", e => {
    e.preventDefault();
    const newUid = document.getElementById("profile-user-id").value.trim();
    if (!newUid) return;
    if (!state.userProfiles.includes(newUid)) state.userProfiles.push(newUid);
    state.activeUserId = newUid;
    renderProfileDropdown();
    document.getElementById("modal-profile").classList.remove("active");
    document.getElementById("profile-user-id").value = "";
    loadDataForActiveTab();
  });
}

export async function checkSessionHandshake() {
  try {
    const res  = await fetch("/api/status");
    const data = await res.json();
    if (data.success) {
      document.getElementById("login-overlay").classList.remove("active");
      document.getElementById("app-container").classList.remove("hidden");
      await loadUserProfiles();
      if (state.userProfiles.length > 0) state.activeUserId = state.userProfiles[0];
      switchTab("dashboard");
    }
  } catch {}
}
