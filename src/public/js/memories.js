import { state } from "./state.js";

export function initMemories() {
  fetchMemories();
  document.getElementById("memory-filter-module")?.addEventListener("change", fetchMemories);
  document.getElementById("btn-memory-reload")?.addEventListener("click", fetchMemories);
  document.getElementById("memory-add-form")?.addEventListener("submit", async (e) => {
    e.preventDefault();
    const content = document.getElementById("memory-new-content")?.value.trim();
    const module = document.getElementById("memory-new-module")?.value || "general";
    if (!content) return;

    try {
      const res = await fetch("/api/memories/add", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ userId: state.activeUserId, content, module }),
      });
      const data = await res.json();
      if (!data.success) return alert(`追加失敗: ${data.message}`);

      document.getElementById("memory-new-content").value = "";
      fetchMemories();
    } catch (e) {
      console.error(e);
      alert("通信エラーが発生しました。");
    }
  });
}

export async function fetchMemories() {
  const list = document.getElementById("config-memories-list");
  const module = document.getElementById("memory-filter-module")?.value || "";
  if (!list) return;
  list.replaceChildren();

  try {
    const params = new URLSearchParams({ userId: state.activeUserId });
    if (module) params.set("module", module);
    const res = await fetch(`/api/memories?${params}`);
    const data = await res.json();
    if (!data.success) return;
    renderMemories(list, data.memories);
  } catch (e) {
    console.error(e);
  }
}

function renderMemories(list, memories) {
  if (memories.length === 0) {
    const empty = document.createElement("div");
    empty.style.cssText = "font-size:0.8rem;color:var(--color-zinc-muted);";
    empty.textContent = "保存されている記憶はありません。";
    list.appendChild(empty);
    return;
  }

  memories.forEach((mem) => {
    list.appendChild(makeMemoryRow(mem));
  });
}

const moduleLabels = { expenses: "家計", schedules: "予定", tasks: "タスク", general: "汎用" };

function makeMemoryRow(mem) {
  const row = document.createElement("div");
  row.style.cssText =
    "display:flex;justify-content:space-between;align-items:flex-start;padding:8px 12px;border:1px solid var(--border-matte);border-radius:var(--radius);background:var(--card-matte);gap:8px;";

  const left = document.createElement("div");
  left.style.cssText = "display:flex;flex-direction:column;gap:4px;flex:1;min-width:0;";

  const content = document.createElement("span");
  content.textContent = mem.content;
  content.style.cssText = "font-size:0.85rem;color:var(--color-white);word-break:break-word;";

  const meta = document.createElement("span");
  const moduleLabel = moduleLabels[mem.module] || mem.module;
  meta.textContent = `[${moduleLabel}]  ${mem.created_at}`;
  meta.style.cssText =
    "font-size:0.68rem;color:var(--color-zinc-muted);font-family:var(--font-family-mono);";
  left.append(content, meta);

  const actions = document.createElement("div");
  actions.style.cssText = "display:flex;gap:4px;flex-shrink:0;";

  const btnEdit = document.createElement("button");
  btnEdit.className = "btn-trash";
  btnEdit.style.cssText = "width:28px;height:28px;";
  btnEdit.type = "button";
  const editIcon = document.createElement("span");
  editIcon.className = "material-symbols-outlined";
  editIcon.textContent = "edit";
  editIcon.style.fontSize = "1.0rem";
  btnEdit.appendChild(editIcon);
  btnEdit.addEventListener("click", () => startEditMemory(mem, row, content));

  const btnDel = document.createElement("button");
  btnDel.className = "btn-trash";
  btnDel.style.cssText = "width:28px;height:28px;";
  btnDel.type = "button";
  const trashIcon = document.createElement("span");
  trashIcon.className = "material-symbols-outlined";
  trashIcon.textContent = "delete";
  trashIcon.style.fontSize = "1.0rem";
  btnDel.appendChild(trashIcon);
  btnDel.addEventListener("click", () => handleDeleteMemory(mem.id));

  actions.append(btnEdit, btnDel);
  row.append(left, actions);
  return row;
}

function startEditMemory(mem, _row, contentEl) {
  const textarea = document.createElement("textarea");
  textarea.value = mem.content;
  textarea.style.cssText =
    "width:100%;font-size:0.85rem;background:var(--bg-primary);color:var(--color-white);border:1px solid var(--border-focus);border-radius:var(--radius);padding:6px 8px;resize:vertical;";
  textarea.rows = 3;

  const select = document.createElement("select");
  select.style.cssText =
    "font-size:0.75rem;background:var(--bg-primary);color:var(--color-white);border:1px solid var(--border-matte);border-radius:var(--radius);padding:4px 6px;";
  Object.entries(moduleLabels).forEach(([val, label]) => {
    const opt = document.createElement("option");
    opt.value = val;
    opt.textContent = label;
    if (val === mem.module) opt.selected = true;
    select.appendChild(opt);
  });

  const btnRow = document.createElement("div");
  btnRow.style.cssText = "display:flex;gap:6px;margin-top:4px;";

  const btnSave = document.createElement("button");
  btnSave.className = "btn btn-primary btn-sm";
  btnSave.type = "button";
  btnSave.textContent = "保存";
  btnSave.style.fontSize = "0.75rem";
  btnSave.addEventListener("click", async () => {
    const newContent = textarea.value.trim();
    if (!newContent) return;
    try {
      const res = await fetch("/api/memories/update", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          id: mem.id,
          userId: state.activeUserId,
          content: newContent,
          module: select.value,
        }),
      });
      const data = await res.json();
      if (data.success) fetchMemories();
    } catch (e) {
      console.error(e);
    }
  });

  const btnCancel = document.createElement("button");
  btnCancel.className = "btn btn-secondary btn-sm";
  btnCancel.type = "button";
  btnCancel.textContent = "キャンセル";
  btnCancel.style.fontSize = "0.75rem";
  btnCancel.addEventListener("click", fetchMemories);

  btnRow.append(btnSave, btnCancel);
  contentEl.replaceWith(textarea);
  textarea.after(select);
  select.after(btnRow);
}

async function handleDeleteMemory(id) {
  if (!confirm(`記憶ID:${id} を削除しますか？`)) return;
  try {
    const res = await fetch("/api/memories/delete", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ id, userId: state.activeUserId }),
    });
    const data = await res.json();
    if (data.success) fetchMemories();
    else alert(`削除失敗: ${data.message}`);
  } catch (e) {
    console.error(e);
    alert("通信エラーが発生しました。");
  }
}
