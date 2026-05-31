let modals = {};
let confirmResolver = null;

function resetConfirmModal() {
  const modal = modals.confirm;
  if (!modal) return;
  modal.querySelector("#confirm-modal-title").textContent = "確認";
  modal.querySelector("#confirm-modal-message").textContent = "";
  modal.querySelector("#confirm-modal-cancel").textContent = "キャンセル";
  modal.querySelector("#confirm-modal-ok").textContent = "実行";
  modal.querySelector("#confirm-modal-ok").classList.add("btn-danger");
}

function resolveConfirm(result) {
  const resolver = confirmResolver;
  confirmResolver = null;
  closeModal(modals.confirm);
  if (resolver) resolver(result);
  resetConfirmModal();
}

export function openModal(modal) {
  modal.classList.add("active");
}

export function closeModal(modal) {
  modal.classList.remove("active");
}

export function initModals() {
  modals = {
    profile: document.getElementById("modal-profile"),
    "gemini-quota": document.getElementById("modal-gemini-quota"),
    task: document.getElementById("modal-task"),
    "task-edit": document.getElementById("modal-task-edit"),
    schedule: document.getElementById("modal-schedule"),
    "schedule-edit": document.getElementById("modal-schedule-edit"),
    "expense-edit": document.getElementById("modal-expense-edit"),
    receiptResult: document.getElementById("modal-receipt-result"),
    credential: document.getElementById("modal-credential"),
    confirm: document.getElementById("modal-confirm"),
  };

  document.querySelectorAll(".btn-close, .btn-close-modal").forEach((btn) => {
    btn.addEventListener("click", () => {
      if (btn.closest("#modal-confirm")) {
        resolveConfirm(false);
        return;
      }
      Object.values(modals).forEach(closeModal);
    });
  });

  Object.values(modals).forEach((modal) => {
    modal?.addEventListener("click", (e) => {
      if (e.target !== modal) return;
      if (modal === modals.confirm) {
        resolveConfirm(false);
        return;
      }
      closeModal(modal);
    });
  });

  document.addEventListener("keydown", (e) => {
    if (e.key !== "Escape") return;
    if (modals.confirm?.classList.contains("active")) {
      resolveConfirm(false);
      return;
    }
    Object.values(modals).forEach(closeModal);
  });

  modals.confirm?.querySelector("#confirm-modal-cancel")?.addEventListener("click", () => {
    resolveConfirm(false);
  });
  modals.confirm?.querySelector("#confirm-modal-ok")?.addEventListener("click", () => {
    resolveConfirm(true);
  });

  document
    .getElementById("btn-profile")
    ?.addEventListener("click", () => openModal(modals.profile));
  document.getElementById("btn-new-task")?.addEventListener("click", () => openModal(modals.task));
  document
    .getElementById("btn-new-schedule")
    ?.addEventListener("click", () => openModal(modals.schedule));
  document
    .getElementById("btn-new-credential")
    ?.addEventListener("click", () => openModal(modals.credential));
}

export function getModal(name) {
  return modals[name];
}

export function confirmModal(message, options = {}) {
  const modal = modals.confirm;
  if (!modal) return Promise.resolve(false);

  if (confirmResolver) resolveConfirm(false);

  modal.querySelector("#confirm-modal-title").textContent = options.title || "確認";
  modal.querySelector("#confirm-modal-message").textContent = message;
  modal.querySelector("#confirm-modal-cancel").textContent = options.cancelText || "キャンセル";
  const okButton = modal.querySelector("#confirm-modal-ok");
  okButton.textContent = options.okText || "削除する";
  okButton.classList.toggle("btn-danger", options.danger !== false);

  openModal(modal);
  okButton.focus();

  return new Promise((resolve) => {
    confirmResolver = resolve;
  });
}
