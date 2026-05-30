import { state } from "./state.js";
import { switchTab, loadDataForActiveTab } from "./router.js";

const SESSION_STORAGE_KEY = "yuuka-admin-session";
const nativeFetch = window.fetch.bind(window);

function readStoredSession() {
  try {
    const raw = localStorage.getItem(SESSION_STORAGE_KEY);
    if (!raw) return null;
    const session = JSON.parse(raw);
    if (!session.token || !session.expiresAt || Date.now() >= session.expiresAt) {
      localStorage.removeItem(SESSION_STORAGE_KEY);
      return null;
    }
    return session;
  } catch {
    localStorage.removeItem(SESSION_STORAGE_KEY);
    return null;
  }
}

function storeSession(data) {
  if (!data.sessionToken || !data.expiresAt) return;
  localStorage.setItem(SESSION_STORAGE_KEY, JSON.stringify({
    token: data.sessionToken,
    expiresAt: data.expiresAt,
  }));
}

function clearStoredSession() {
  localStorage.removeItem(SESSION_STORAGE_KEY);
}

function installAuthenticatedFetch() {
  window.fetch = (input, init = {}) => {
    const session = readStoredSession();
    if (!session) return nativeFetch(input, init);

    const url = typeof input === "string"
      ? input
      : input instanceof URL
        ? input.toString()
        : input.url;
    if (!url.startsWith("/api/") && !url.startsWith(window.location.origin + "/api/")) {
      return nativeFetch(input, init);
    }

    const headers = new Headers(init.headers || (input instanceof Request ? input.headers : undefined));
    headers.set("Authorization", `Bearer ${session.token}`);
    return nativeFetch(input, { ...init, headers });
  };
}

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
  const display = document.getElementById("current-user-display");
  if (display) display.textContent = state.activeUserId || "—";
}

export function initAuth() {
  installAuthenticatedFetch();

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
        storeSession(data);
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
    clearStoredSession();
    document.getElementById("app-container").classList.add("hidden");
    document.getElementById("login-overlay").classList.add("active");
    document.getElementById("passcode").value = "";
    document.getElementById("login-error").textContent = "ログアウトしました。";
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
