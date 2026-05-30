import { state } from "./state.js";

export function initMemories() {
  fetchMemories();
  document.getElementById("memory-filter-module")?.addEventListener("change", fetchMemories);
  document.getElementById("btn-memory-reload")?.addEventListener("click", fetchMemories);
  document.getElementById("memory-add-form")?.addEventListener("submit", async e => {
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

  memories.forEach(mem => list.appendChild(makeMemoryRow(mem)));
}

function makeMemoryRow(mem) {
  const row = document.createElement("div");
  row.style.cssText = "display:flex;justify-content:space-between;align-items:center;padding:8px 12px;border:1px solid var(--border-matte);border-radius:var(--radius);background:var(--card-matte);";

  const left = document.createElement("div");
  left.style.cssText = "display:flex;flex-direction:column;gap:2px;";
  const content = document.createElement("span");
  content.textContent = mem.content;
  content.style.cssText = "font-size:0.85rem;color:var(--color-white);";
  const meta = document.createElement("span");
  meta.textContent = `[${mem.module}]  ${mem.created_at}`;
  meta.style.cssText = "font-size:0.68rem;color:var(--color-zinc-muted);font-family:var(--font-family-mono);";
  left.append(content, meta);

  const btnDel = document.createElement("button");
  btnDel.className = "btn-trash";
  btnDel.style.cssText = "width:28px;height:28px;flex-shrink:0;";
  btnDel.type = "button";
  const trashIcon = document.createElement("span");
  trashIcon.className = "material-symbols-outlined";
  trashIcon.textContent = "delete";
  trashIcon.style.fontSize = "1.0rem";
  btnDel.appendChild(trashIcon);
  btnDel.addEventListener("click", () => handleDeleteMemory(mem.id));

  row.append(left, btnDel);
  return row;
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
