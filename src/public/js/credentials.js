import { closeModal, getModal } from "./modal.js";

export async function fetchCredentialsSettings() {
  const list = document.getElementById("config-credentials-list");
  if (!list) return;
  list.replaceChildren();

  try {
    const res  = await fetch("/api/credentials");
    const data = await res.json();

    if (data.success && data.credentials.length > 0) {
      data.credentials.forEach(cred => list.appendChild(makeCredentialRow(cred)));
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
    mkTd("•••••••••••• (暗号化)", { color: "var(--color-zinc-muted)", fontFamily: "var(--font-family-mono)" }),
    mkTd(cred.updatedAt, { fontSize: "0.75rem", color: "var(--color-zinc-muted)" }),
  );

  const tdAction = document.createElement("td");
  tdAction.style.cssText = "padding:12px 10px;text-align:right;";
  const btnDelete = document.createElement("button");
  btnDelete.className = "btn-credential-delete";
  btnDelete.type = "button";
  btnDelete.innerHTML = `<span class="material-symbols-outlined" style="font-size:0.95rem;">delete</span> 削除`;
  btnDelete.addEventListener("click", () => handleDeleteCredential(cred.serviceName));
  tdAction.appendChild(btnDelete);
  tr.appendChild(tdAction);
  return tr;
}

async function handleDeleteCredential(serviceName) {
  if (!confirm(`本当にサービス "${serviceName}" の認証情報を削除しますか？`)) return;
  try {
    const res  = await fetch("/api/credentials/delete", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ serviceName }),
    });
    const data = await res.json();
    if (data.success) fetchCredentialsSettings();
    else alert("削除に失敗しました。");
  } catch (err) {
    console.error(err);
    alert("通信エラーが発生しました。");
  }
}

export function initCredentials() {
  document.getElementById("credential-form")?.addEventListener("submit", async e => {
    e.preventDefault();
    const serviceName = document.getElementById("cred-service-name").value.trim().toLowerCase();
    const username    = document.getElementById("cred-username").value.trim();
    const password    = document.getElementById("cred-password").value;
    try {
      const res  = await fetch("/api/credentials/register", {
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
        alert(`登録に失敗しました: ${data.message}`);
      }
    } catch (err) {
      console.error(err);
      alert("通信エラーが発生しました。");
    }
  });
}
