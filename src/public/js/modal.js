let modals = {};
let confirmResolver = null;
const modalStack = [];
const externalClosers = new WeakMap();
const previousFocus = new WeakMap();
const focusableSelector =
  'button:not(:disabled), a[href], input:not(:disabled), select:not(:disabled), textarea:not(:disabled), [tabindex="0"]';

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
  if (!modal || modal.classList.contains("active")) return;
  previousFocus.set(modal, document.activeElement);
  modalStack.push(modal);
  modal.setAttribute("role", "dialog");
  modal.setAttribute("aria-modal", "true");
  const heading = modal.querySelector("h3, h2");
  if (heading) {
    if (!heading.id) heading.id = `${modal.id}-heading`;
    modal.setAttribute("aria-labelledby", heading.id);
  }
  modal.classList.add("active");
  modal.inert = false;
  document.body.classList.add("modal-open");
  const app = document.getElementById("app-container");
  if (app) app.inert = true;
  modal.querySelector(focusableSelector)?.focus();
}

export function closeModal(modal) {
  const externalClose = externalClosers.get(modal);
  if (externalClose) {
    externalClose();
    return;
  }
  if (!modal?.classList.contains("active")) return;
  if (modal === modals.confirm && confirmResolver) {
    resolveConfirm(false);
    return;
  }
  modal.classList.remove("active");
  modal.inert = true;
  const index = modalStack.indexOf(modal);
  if (index !== -1) modalStack.splice(index, 1);
  if (!modalStack.length) {
    document.body.classList.remove("modal-open");
    const app = document.getElementById("app-container");
    if (app) app.inert = false;
  }
  const target = previousFocus.get(modal);
  if (target?.isConnected) target.focus();
}

export function openExternalModal(modal, closeHandler) {
  if (!modal || modalStack.includes(modal)) return;
  previousFocus.set(modal, document.activeElement);
  externalClosers.set(modal, closeHandler);
  modalStack.push(modal);
  modal.setAttribute("role", "dialog");
  modal.setAttribute("aria-modal", "true");
  modal.inert = false;
  document.body.classList.add("modal-open");
  document.getElementById("app-container")?.toggleAttribute("inert", true);
  modal.querySelector(focusableSelector)?.focus();
}

export function closeExternalModal(modal) {
  if (!modal || !externalClosers.has(modal)) return;
  externalClosers.delete(modal);
  const index = modalStack.indexOf(modal);
  if (index !== -1) modalStack.splice(index, 1);
  modal.inert = true;
  if (!modalStack.length) {
    document.body.classList.remove("modal-open");
    document.getElementById("app-container")?.toggleAttribute("inert", false);
  }
  const target = previousFocus.get(modal);
  if (target?.isConnected) target.focus();
}

export function closeAllModals() {
  [...modalStack].reverse().forEach((modal) => {
    closeModal(modal);
  });
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

  document.querySelectorAll(".modal:not(.active)").forEach((modal) => {
    modal.inert = true;
  });

  document.querySelectorAll(".btn-close, .btn-close-modal").forEach((btn) => {
    btn.addEventListener("click", () => {
      if (btn.closest("#modal-confirm")) {
        resolveConfirm(false);
        return;
      }
      closeModal(btn.closest(".modal"));
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
    const active = modalStack.at(-1);
    if (e.key === "Tab" && active) {
      const items = [...active.querySelectorAll(focusableSelector)].filter(
        (item) => item.getClientRects().length,
      );
      const first = items[0];
      const last = items.at(-1);
      if (e.shiftKey && document.activeElement === first) {
        e.preventDefault();
        last?.focus();
      } else if (!e.shiftKey && document.activeElement === last) {
        e.preventDefault();
        first?.focus();
      }
      return;
    }
    if (e.key !== "Escape") return;
    if (modals.confirm?.classList.contains("active")) {
      resolveConfirm(false);
      return;
    }
    closeModal(active);
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
