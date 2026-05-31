import { initCalendarForm, renderCalendarsList } from "./config-calendars.js";
import { fetchCredentialsSettings } from "./credentials.js";
import { initMemories } from "./memories.js";
import { renderProfileDropdown } from "./auth.js";
import { toast } from "./toast.js";

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

    const urlInput = document.getElementById("bot-invite-url-input");
    if (urlInput) urlInput.value = data.config.botInviteUrl ?? "";
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
  loadInviteCodes();
}

async function loadGeminiForm() {
  try {
    const res = await fetch("/api/config/gemini");
    const data = await res.json();
    if (!data.success) return;
    const keyInput = document.getElementById("gemini-api-key");
    const keyHint = document.getElementById("gemini-api-key-hint");
    const modelSelect = document.getElementById("gemini-model-select");
    if (keyInput) {
      keyInput.placeholder = data.hasApiKey ? "変更する場合のみ入力" : "APIキーを入力してください";
    }
    if (keyHint) {
      keyHint.textContent = data.apiKeyPrefix ? `現在の設定: ${data.apiKeyPrefix}` : "";
    }
    if (modelSelect && data.model) modelSelect.value = data.model;
  } catch {}
}

async function loadInviteCodes() {
  const list = document.getElementById("invite-codes-list");
  if (!list) return;
  try {
    const res = await fetch("/api/invite-codes");
    const data = await res.json();
    if (!data.success) return;
    renderInviteCodes(data.codes);
  } catch {}
}

function renderInviteCodes(codes) {
  const list = document.getElementById("invite-codes-list");
  if (!list) return;
  list.replaceChildren();
  if (!codes.length) {
    const empty = document.createElement("p");
    empty.className = "description-text";
    empty.textContent = "招待コードはまだ発行されていません。";
    list.appendChild(empty);
    return;
  }
  codes.forEach(({ code, used_by, created_at }) => {
    const row = document.createElement("div");
    row.className = "invite-code-row";
    const codeSpan = document.createElement("span");
    codeSpan.className = "invite-code-value";
    codeSpan.textContent = code;
    const statusSpan = document.createElement("span");
    statusSpan.className = used_by ? "invite-code-used" : "invite-code-unused";
    statusSpan.textContent = used_by ? "使用済み" : "未使用";
    const copyBtn = document.createElement("button");
    copyBtn.className = "btn-icon-sm";
    copyBtn.title = "コピー";
    copyBtn.innerHTML = '<span class="material-symbols-outlined">content_copy</span>';
    copyBtn.addEventListener("click", () => {
      navigator.clipboard.writeText(code).then(() => toast.success("コピーしました"));
    });
    row.append(codeSpan, statusSpan, used_by ? document.createTextNode("") : copyBtn);
    list.appendChild(row);
  });
}

export function initConfig() {
  initCalendarForm(fetchConfigSettings);

  document.getElementById("btn-copy-invite-url")?.addEventListener("click", () => {
    const url = document.getElementById("bot-invite-url-input")?.value;
    if (!url) {
      toast.error("Bot起動後に取得できます。");
      return;
    }
    navigator.clipboard.writeText(url).then(() => toast.success("招待URLをコピーしました"));
  });

  document.getElementById("btn-generate-invite")?.addEventListener("click", async () => {
    try {
      const res = await fetch("/api/invite-codes", { method: "POST" });
      const data = await res.json();
      if (data.success) {
        toast.success(`招待コードを発行しました: ${data.code}`);
        loadInviteCodes();
      } else {
        toast.error("発行に失敗しました。");
      }
    } catch {
      toast.error("サーバー接続に失敗しました。");
    }
  });

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
        toast.success("Gemini設定を保存しました。");
      } else {
        toast.error(data.message || "保存に失敗しました。");
      }
    } catch {
      toast.error("サーバー接続に失敗しました。");
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
        toast.success(`表示名を「${data.username}」に変更しました。`);
      } else {
        toast.error(data.message || "保存に失敗しました。");
      }
    } catch {
      toast.error("サーバー接続に失敗しました。");
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
