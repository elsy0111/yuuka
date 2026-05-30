export function renderCalendarsList(calendars, onChanged) {
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

  calendars.forEach((cal) => list.appendChild(makeCalendarRow(cal, onChanged)));
}

export function initCalendarForm(onChanged) {
  document.getElementById("config-calendar-form")?.addEventListener("submit", async (e) => {
    e.preventDefault();
    const input = document.getElementById("config-new-calendar-id");
    const calendarId = input.value.trim();
    if (!calendarId) return;

    try {
      const res = await fetch("/api/config/calendars/add", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ calendarId }),
      });
      const data = await res.json();
      if (data.success) {
        input.value = "";
        onChanged();
      } else {
        alert(`追加に失敗しました: ${data.message}`);
      }
    } catch (e) {
      console.error(e);
      alert("通信エラーが発生しました。");
    }
  });
}

function makeCalendarRow(cal, onChanged) {
  const row = document.createElement("div");
  row.style.cssText =
    "display:flex;justify-content:space-between;align-items:center;padding:10px 14px;border:1px solid var(--border-matte);border-radius:var(--radius);background:var(--card-matte);";

  const left = document.createElement("div");
  left.style.cssText = "display:flex;flex-direction:column;gap:2px;";
  const summary = document.createElement("span");
  summary.textContent = cal.summary || "外部連携カレンダー";
  summary.style.cssText = "font-size:0.85rem;font-weight:700;color:var(--color-white);";
  const calId = document.createElement("span");
  calId.textContent = cal.id;
  calId.style.cssText =
    "font-size:0.7rem;color:var(--color-zinc-muted);font-family:var(--font-family-mono);";
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
  btnDel.addEventListener("click", () => handleDeleteCalendarId(cal.id, onChanged));

  row.append(left, btnDel);
  return row;
}

async function handleDeleteCalendarId(calendarId, onChanged) {
  if (!confirm(`本当にカレンダーID "${calendarId}" を同期一覧から削除しますか？`)) return;
  try {
    const res = await fetch("/api/config/calendars/delete", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ calendarId }),
    });
    const data = await res.json();
    if (data.success) onChanged();
    else alert(`削除に失敗しました: ${data.message}`);
  } catch (e) {
    console.error(e);
    alert("通信エラーが発生しました。");
  }
}
