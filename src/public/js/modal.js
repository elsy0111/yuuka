let modals = {};

export function openModal(modal) {
  modal.classList.add("active");
}

export function closeModal(modal) {
  modal.classList.remove("active");
}

export function initModals() {
  modals = {
    profile: document.getElementById("modal-profile"),
    task: document.getElementById("modal-task"),
    "task-edit": document.getElementById("modal-task-edit"),
    schedule: document.getElementById("modal-schedule"),
    "schedule-edit": document.getElementById("modal-schedule-edit"),
    "expense-edit": document.getElementById("modal-expense-edit"),
    receiptResult: document.getElementById("modal-receipt-result"),
    credential: document.getElementById("modal-credential"),
  };

  document.querySelectorAll(".btn-close, .btn-close-modal").forEach((btn) => {
    btn.addEventListener("click", () => Object.values(modals).forEach(closeModal));
  });

  Object.values(modals).forEach((modal) => {
    modal?.addEventListener("click", (e) => {
      if (e.target === modal) closeModal(modal);
    });
  });

  document.addEventListener("keydown", (e) => {
    if (e.key === "Escape") Object.values(modals).forEach(closeModal);
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
