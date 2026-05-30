import { fetchCredentialsSettings } from "./credentials.js";

export async function fetchConfigSettings() {
  const grid = document.getElementById("config-settings-grid");
  grid.replaceChildren();

  try {
    const res  = await fetch("/api/status");
    const data = await res.json();
    if (!data.success) return;

    const entries = [
      { label: "データベースファイルのパス (DB Path)",                  value: data.config.dbPath },
      { label: "リマインダーチェック実行Cron (Reminder Cron)",          value: data.config.reminderCron },
      { label: "GoogleカレンダーID (Google Calendar ID)",               value: data.config.googleCalendarId || "未設定 (カレンダー同期なし)" },
      { label: "サービスアカウントEmail",                                 value: data.config.googleServiceAccountEmail },
      { label: "OAuth2 クライアントID",                                   value: data.config.googleClientId },
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

    renderCalendarsList(data.config.googleCalendars || []);
    fetchCredentialsSettings();
  } catch (e) {
    console.error(e);
  }
}

function renderCalendarsList(calendars) {
  const list = document.getElementById("config-calendars-list");
  if (!list) return;
  list.replaceChildren();

  if (calendars.length === 0) {
    const empty = document.createElement("div");
    empty.style.cssText = "font-size:0.8rem;color:var(--color-zinc-muted);";
    empty.textContent = "登録されている外部連携カレンダーはありません。";
    list.appendChild(empty);
    return;
  }

  calendars.forEach(cal => {
    const row = document.createElement("div");
    row.style.cssText = "display:flex;justify-content:space-between;align-items:center;padding:10px 14px;border:1px solid var(--border-matte);border-radius:var(--radius);background:var(--card-matte);";

    const left = document.createElement("div");
    left.style.cssText = "display:flex;flex-direction:column;gap:2px;";

    const summary = document.createElement("span");
    summary.textContent = cal.summary || "外部連携カレンダー";
    summary.style.cssText = "font-size:0.85rem;font-weight:700;color:var(--color-white);";

    const calId = document.createElement("span");
    calId.textContent = cal.id;
    calId.style.cssText = "font-size:0.7rem;color:var(--color-zinc-muted);font-family:var(--font-family-mono);";

    left.append(summary, calId);

    const btnDel = document.createElement("button");
    btnDel.className = "btn-trash";
    btnDel.style.cssText = "width:28px;height:28px;";
    btnDel.type = "button";
    const trashIcon = document.createElement("span");
    trashIcon.className = "material-symbols-outlined";
    trashIcon.textContent = "delete";
    trashIcon.style.fontSize = "1.0rem";
    btnDel.appendChild(trashIcon);
    btnDel.addEventListener("click", () => handleDeleteCalendarId(cal.id));

    row.append(left, btnDel);
    list.appendChild(row);
  });
}

async function handleDeleteCalendarId(calendarId) {
  if (!confirm(`本当にカレンダーID "${calendarId}" を同期一覧から削除しますか？`)) return;
  try {
    const res  = await fetch("/api/config/calendars/delete", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ calendarId }),
    });
    const data = await res.json();
    if (data.success) fetchConfigSettings();
    else alert(`削除に失敗しました: ${data.message}`);
  } catch (e) {
    console.error(e);
    alert("通信エラーが発生しました。");
  }
}

export function initConfig() {
  document.getElementById("config-calendar-form")?.addEventListener("submit", async e => {
    e.preventDefault();
    const input      = document.getElementById("config-new-calendar-id");
    const calendarId = input.value.trim();
    if (!calendarId) return;
    try {
      const res  = await fetch("/api/config/calendars/add", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ calendarId }),
      });
      const data = await res.json();
      if (data.success) { input.value = ""; fetchConfigSettings(); }
      else alert(`追加に失敗しました: ${data.message}`);
    } catch (e) {
      console.error(e);
      alert("通信エラーが発生しました。");
    }
  });
}
