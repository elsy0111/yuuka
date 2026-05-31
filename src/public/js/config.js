import { initCalendarForm, renderCalendarsList } from "./config-calendars.js";
import { fetchCredentialsSettings } from "./credentials.js";
import { initMemories } from "./memories.js";
import { renderProfileDropdown } from "./auth.js";

export async function fetchConfigSettings() {
  const grid = document.getElementById("config-settings-grid");
  grid.replaceChildren();

  try {
    const res = await fetch("/api/status");
    const data = await res.json();
    if (!data.success) return;

    renderConfigEntries(grid, data.config);
    renderCalendarsList(data.config.googleCalendars || [], fetchConfigSettings);
    fetchCredentialsSettings();
  } catch (e) {
    console.error(e);
  }
}

async function loadProfileForm() {
  try {
    const res = await fetch("/api/users");
    const data = await res.json();
    if (data.success && data.username) {
      const input = document.getElementById("config-profile-username");
      if (input) input.value = data.username;
    }
  } catch {}
}

export function initConfigAfterAuth() {
  initMemories();
  loadProfileForm();
  loadGeminiForm();
}

async function loadGeminiForm() {
  try {
    const res = await fetch("/api/config/gemini");
    const data = await res.json();
    if (!data.success) return;
    const keyInput = document.getElementById("gemini-api-key");
    const modelSelect = document.getElementById("gemini-model-select");
    if (keyInput) {
      keyInput.placeholder = data.hasApiKey
        ? "設定済み（変更する場合のみ入力）"
        : "APIキーを入力してください";
    }
    if (modelSelect && data.model) modelSelect.value = data.model;
  } catch {}
}

export function initConfig() {
  initCalendarForm(fetchConfigSettings);

  document.getElementById("gemini-config-form")?.addEventListener("submit", async (e) => {
    e.preventDefault();
    const apiKey = document.getElementById("gemini-api-key").value;
    const model = document.getElementById("gemini-model-select").value;
    try {
      const res = await fetch("/api/config/gemini", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ apiKey, model }),
      });
      const data = await res.json();
      if (data.success) {
        document.getElementById("gemini-api-key").value = "";
        await loadGeminiForm();
        alert("Gemini設定を保存しました。");
      } else {
        alert(data.message || "保存に失敗しました。");
      }
    } catch {
      alert("サーバー接続に失敗しました。");
    }
  });

  document.getElementById("profile-config-form")?.addEventListener("submit", async (e) => {
    e.preventDefault();
    const username = document.getElementById("config-profile-username").value.trim();
    if (!username) return;

    try {
      const res = await fetch("/api/profile", {
        method: "PATCH",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ username }),
      });
      const data = await res.json();
      if (data.success) {
        renderProfileDropdown(data.username);
        alert(`表示名を「${data.username}」に変更しました。`);
      } else {
        alert(data.message || "保存に失敗しました。");
      }
    } catch {
      alert("サーバー接続に失敗しました。");
    }
  });
}

function renderConfigEntries(grid, config) {
  const entries = [
    { label: "データベースファイルのパス (DB Path)", value: config.dbPath },
    { label: "リマインダーチェック実行Cron (Reminder Cron)", value: config.reminderCron },
    {
      label: "GoogleカレンダーID (Google Calendar ID)",
      value: config.googleCalendarId || "未設定 (カレンダー同期なし)",
    },
    { label: "サービスアカウントEmail", value: config.googleServiceAccountEmail },
    { label: "OAuth2 クライアントID", value: config.googleClientId },
  ];

  entries.forEach(({ label, value }) => {
    const box = document.createElement("div");
    box.className = "config-item-box";
    const lbl = document.createElement("div");
    lbl.className = "config-item-label";
    lbl.textContent = label;
    const val = document.createElement("div");
    val.className = "config-item-value";
    val.textContent = value;
    box.append(lbl, val);
    grid.appendChild(box);
  });
}
