import { initConfigAfterAuth } from "./config.js";
import { getModal, openModal } from "./modal.js";
import { switchTab } from "./router.js";
import { state } from "./state.js";

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
  localStorage.setItem(
    SESSION_STORAGE_KEY,
    JSON.stringify({
      token: data.sessionToken,
      expiresAt: data.expiresAt,
      discordId: data.discordId || "",
      username: data.username || "",
    }),
  );
}

function clearStoredSession() {
  localStorage.removeItem(SESSION_STORAGE_KEY);
}

function installAuthenticatedFetch() {
  window.fetch = (input, init = {}) => {
    const session = readStoredSession();
    if (!session) return nativeFetch(input, init);

    const url =
      typeof input === "string" ? input : input instanceof URL ? input.toString() : input.url;
    if (!url.startsWith("/api/") && !url.startsWith(`${window.location.origin}/api/`)) {
      return nativeFetch(input, init);
    }

    const headers = new Headers(
      init.headers || (input instanceof Request ? input.headers : undefined),
    );
    headers.set("Authorization", `Bearer ${session.token}`);
    return nativeFetch(input, { ...init, headers });
  };
}

export async function loadUserProfiles() {
  try {
    const res = await fetch("/api/users");
    const data = await res.json();
    if (data.success) {
      state.userProfiles = data.users;
      if (data.discordId) state.activeUserId = data.discordId;
      else if (data.users.length > 0) state.activeUserId = data.users[0];

      const displayName =
        data.username || readStoredSession()?.username || state.activeUserId || "—";
      renderProfileDropdown(displayName, data);
    }
  } catch (err) {
    console.error("ユーザー情報の読み込みに失敗:", err);
  }
}

export function renderProfileDropdown(displayName, userData = {}) {
  const display = document.getElementById("current-user-display");
  if (display) display.textContent = displayName || state.activeUserId || "—";

  const usernameEl = document.getElementById("profile-username");
  const discordIdEl = document.getElementById("profile-discord-id");
  const createdAtEl = document.getElementById("profile-created-at");
  if (usernameEl) usernameEl.textContent = userData.username || displayName || "—";
  if (discordIdEl) discordIdEl.textContent = userData.discordId || state.activeUserId || "—";
  if (createdAtEl && userData.createdAt) {
    const d = new Date(userData.createdAt);
    createdAtEl.textContent = `${d.getFullYear()}/${d.getMonth() + 1}/${d.getDate()}`;
  }
}

function initProfileDropdown() {
  document.getElementById("btn-user-profile")?.addEventListener("click", () => {
    openModal(getModal("profile"));
  });

  document.getElementById("btn-copy-discord-id")?.addEventListener("click", () => {
    const id = document.getElementById("profile-discord-id")?.textContent;
    if (!id || id === "—") return;
    const btn = document.getElementById("btn-copy-discord-id");
    navigator.clipboard.writeText(id).catch(() => {});
    btn.querySelector(".material-symbols-outlined").textContent = "check";
    setTimeout(() => {
      btn.querySelector(".material-symbols-outlined").textContent = "content_copy";
    }, 1500);
  });
}

function showLoginOverlay(msg = "") {
  document.getElementById("login-overlay").classList.add("active");
  document.getElementById("app-container").classList.add("hidden");
  if (msg) document.getElementById("login-error").textContent = msg;
}

function onLoginSuccess(data) {
  storeSession(data);
  document.getElementById("login-overlay").classList.remove("active");
  document.getElementById("app-container").classList.remove("hidden");
  loadUserProfiles().then(() => {
    if (state.userProfiles.length > 0 && !state.activeUserId) {
      state.activeUserId = state.userProfiles[0];
    }
  });
  initConfigAfterAuth();
  switchTab("dashboard");
}

function initInfoPopovers() {
  const modal = document.getElementById("modal-field-info");
  const titleEl = document.getElementById("field-info-modal-title");
  const bodyEl = document.getElementById("field-info-modal-body");

  document.querySelectorAll(".btn-field-info").forEach((btn) => {
    btn.addEventListener("click", () => {
      titleEl.textContent = btn.dataset.infoTitle || "";
      bodyEl.textContent = btn.dataset.infoBody || "";
      modal.classList.add("active");
    });
  });

  modal?.addEventListener("click", (e) => {
    if (e.target === modal) modal.classList.remove("active");
  });

  modal?.querySelector(".btn-close")?.addEventListener("click", () => {
    modal.classList.remove("active");
  });
}

export function initAuth() {
  installAuthenticatedFetch();
  initInfoPopovers();
  initProfileDropdown();

  // タブ切り替え
  document.getElementById("btn-tab-login")?.addEventListener("click", () => {
    document.getElementById("btn-tab-login").classList.add("active");
    document.getElementById("btn-tab-register").classList.remove("active");
    document.getElementById("login-tab-content").classList.add("active");
    document.getElementById("register-tab-content").classList.remove("active");
    document.getElementById("login-error").textContent = "";
  });

  document.getElementById("btn-tab-register")?.addEventListener("click", () => {
    document.getElementById("btn-tab-register").classList.add("active");
    document.getElementById("btn-tab-login").classList.remove("active");
    document.getElementById("register-tab-content").classList.add("active");
    document.getElementById("login-tab-content").classList.remove("active");
    document.getElementById("login-error").textContent = "";
  });

  // ログインフォーム
  document.getElementById("login-form")?.addEventListener("submit", async (e) => {
    e.preventDefault();
    const errorEl = document.getElementById("login-error");
    errorEl.textContent = "";
    const discordId = document.getElementById("login-discord-id").value.trim();
    const password = document.getElementById("login-password").value;
    try {
      const res = await nativeFetch("/api/login", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ discordId, password }),
      });
      const data = await res.json();
      if (data.success) {
        if (window.PasswordCredential) {
          const cred = new window.PasswordCredential({ id: discordId, password });
          navigator.credentials.store(cred).catch(() => {});
        }
        onLoginSuccess(data);
      } else {
        errorEl.textContent = data.message || "ログインに失敗しました。";
      }
    } catch {
      errorEl.textContent = "サーバー接続に失敗しました。";
    }
  });

  // アカウント作成フォーム
  document.getElementById("register-form")?.addEventListener("submit", async (e) => {
    e.preventDefault();
    const errorEl = document.getElementById("login-error");
    errorEl.textContent = "";
    const discordId = document.getElementById("reg-discord-id").value.trim();
    const username = document.getElementById("reg-username").value.trim();
    const password = document.getElementById("reg-password").value;
    const inviteCode = document.getElementById("reg-invite-code").value.trim();
    try {
      const res = await nativeFetch("/api/register", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ discordId, username, password, inviteCode }),
      });
      const data = await res.json();
      if (data.success) {
        onLoginSuccess(data);
      } else {
        errorEl.textContent = data.message || "登録に失敗しました。";
      }
    } catch {
      errorEl.textContent = "サーバー接続に失敗しました。";
    }
  });

  // ログアウト
  document.getElementById("btn-logout")?.addEventListener("click", async () => {
    try {
      await fetch("/api/logout", { method: "POST" });
    } catch {}
    clearStoredSession();
    showLoginOverlay("ログアウトしました。");
    document.getElementById("login-discord-id").value = "";
    document.getElementById("login-password").value = "";
  });
}

export async function checkSessionHandshake() {
  try {
    const res = await fetch("/api/status");
    const data = await res.json();
    if (data.success) {
      document.getElementById("login-overlay").classList.remove("active");
      document.getElementById("app-container").classList.remove("hidden");
      await loadUserProfiles();
      if (state.userProfiles.length > 0 && !state.activeUserId) {
        state.activeUserId = state.userProfiles[0];
      }
      initConfigAfterAuth();
      switchTab("dashboard");
    }
  } catch {}
}
