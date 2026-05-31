import { closeModal, confirmModal, getModal, openModal } from "./modal.js";
import { toast } from "./toast.js";

export async function fetchCredentialsSettings() {
  const list = document.getElementById("config-credentials-list");
  if (!list) return;
  list.replaceChildren();

  try {
    const res = await fetch("/api/credentials");
    const data = await res.json();

    if (data.success && data.credentials.length > 0) {
      data.credentials.forEach((cred) => {
        list.appendChild(makeCredentialRow(cred));
      });
    } else {
      const tr = document.createElement("tr");
      const td = document.createElement("td");
      td.colSpan = 5;
      td.style.cssText = "padding:16px 10px;font-size:0.8rem;color:var(--color-zinc-muted);";
      td.textContent = "登録されている認証情報はありません。";
      tr.appendChild(td);
      list.appendChild(tr);
    }
  } catch (err) {
    console.error("認証情報の取得に失敗:", err);
  }
}

function makeCredentialRow(cred) {
  const tr = document.createElement("tr");
  tr.style.borderBottom = "1px solid var(--border-matte)";

  const mkTd = (text, styles = {}) => {
    const td = document.createElement("td");
    td.style.padding = "12px 10px";
    td.style.fontSize = "0.85rem";
    Object.assign(td.style, styles);
    td.textContent = text;
    return td;
  };

  tr.append(
    mkTd(cred.serviceName, { color: "var(--color-white)", fontWeight: "700" }),
    mkTd(cred.username, { fontFamily: "var(--font-family-mono)" }),
    mkTd("•••••••••••• (暗号化)", {
      color: "var(--color-zinc-muted)",
      fontFamily: "var(--font-family-mono)",
    }),
    mkTd(cred.updatedAt, { fontSize: "0.75rem", color: "var(--color-zinc-muted)" }),
  );

  const tdAction = document.createElement("td");
  tdAction.style.cssText =
    "padding:12px 10px;text-align:right;display:flex;gap:6px;justify-content:flex-end;";

  const btnEdit = document.createElement("button");
  btnEdit.className = "btn-credential-delete";
  btnEdit.type = "button";
  btnEdit.innerHTML = `<span class="material-symbols-outlined" style="font-size:0.95rem;">edit</span> 編集`;
  btnEdit.addEventListener("click", () => handleEditCredential(cred));

  const btnDelete = document.createElement("button");
  btnDelete.className = "btn-credential-delete";
  btnDelete.type = "button";
  btnDelete.innerHTML = `<span class="material-symbols-outlined" style="font-size:0.95rem;">delete</span> 削除`;
  btnDelete.addEventListener("click", () => handleDeleteCredential(cred.serviceName));

  tdAction.append(btnEdit, btnDelete);
  tr.appendChild(tdAction);
  return tr;
}

function handleEditCredential(cred) {
  const titleEl = document.getElementById("credential-modal-title");
  if (titleEl) titleEl.textContent = "認証情報の更新";
  document.getElementById("cred-service-name").value = cred.serviceName;
  document.getElementById("cred-service-name").readOnly = true;
  document.getElementById("cred-username").value = cred.username;
  document.getElementById("cred-password").value = "";
  document.getElementById("cred-password").placeholder = "新しいパスワード（変更する場合）";
  document.getElementById("cred-password").required = false;
  openModal(getModal("credential"));
}

async function handleDeleteCredential(serviceName) {
  if (!(await confirmModal(`本当にサービス "${serviceName}" の認証情報を削除しますか？`))) return;
  try {
    const res = await fetch("/api/credentials/delete", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ serviceName }),
    });
    const data = await res.json();
    if (data.success) fetchCredentialsSettings();
    else toast.error("削除に失敗しました。");
  } catch (err) {
    console.error(err);
    toast.error("通信エラーが発生しました。");
  }
}

export function initCredentials() {
  document.getElementById("btn-new-credential")?.addEventListener("click", () => {
    const titleEl = document.getElementById("credential-modal-title");
    if (titleEl) titleEl.textContent = "新規認証情報の登録";
    const svcInput = document.getElementById("cred-service-name");
    svcInput.value = "";
    svcInput.readOnly = false;
    document.getElementById("cred-username").value = "";
    document.getElementById("cred-password").value = "";
    document.getElementById("cred-password").placeholder = "••••••••••••";
    document.getElementById("cred-password").required = true;
  });

  document.getElementById("credential-form")?.addEventListener("submit", async (e) => {
    e.preventDefault();
    const serviceName = document.getElementById("cred-service-name").value.trim().toLowerCase();
    const username = document.getElementById("cred-username").value.trim();
    const password = document.getElementById("cred-password").value;
    try {
      const res = await fetch("/api/credentials/register", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ serviceName, username, password }),
      });
      const data = await res.json();
      if (data.success) {
        closeModal(getModal("credential"));
        document.getElementById("credential-form").reset();
        fetchCredentialsSettings();
      } else {
        toast.error(`登録に失敗しました: ${data.message}`);
      }
    } catch (err) {
      console.error(err);
      toast.error("通信エラーが発生しました。");
    }
  });
}
