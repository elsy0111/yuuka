let modals = {};

export function openModal(modal) {
  modal.classList.add("active");
}

export function closeModal(modal) {
  modal.classList.remove("active");
}

export function initModals() {
  modals = {
    profile:       document.getElementById("modal-profile"),
    task:          document.getElementById("modal-task"),
    schedule:      document.getElementById("modal-schedule"),
    receiptResult: document.getElementById("modal-receipt-result"),
    credential:    document.getElementById("modal-credential"),
  };

  document.querySelectorAll(".btn-close, .btn-close-modal").forEach(btn => {
    btn.addEventListener("click", () => Object.values(modals).forEach(closeModal));
  });

  document.getElementById("btn-add-profile")
    ?.addEventListener("click", () => openModal(modals.profile));
  document.getElementById("btn-new-task")
    ?.addEventListener("click", () => openModal(modals.task));
  document.getElementById("btn-new-schedule")
    ?.addEventListener("click", () => openModal(modals.schedule));
  document.getElementById("btn-new-credential")
    ?.addEventListener("click", () => openModal(modals.credential));
}

export function getModal(name) {
  return modals[name];
}
