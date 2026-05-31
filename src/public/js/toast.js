// Sonner ライクな軽量トースト実装
let container = null;

function getContainer() {
  if (!container) {
    container = document.createElement("ol");
    container.id = "toast-container";
    document.body.appendChild(container);
  }
  return container;
}

function createToast(message, type = "default", duration = 4000) {
  const c = getContainer();
  const li = document.createElement("li");
  li.className = `toast toast-${type}`;

  const icon = document.createElement("span");
  icon.className = "toast-icon material-symbols-outlined";
  if (type === "success") icon.textContent = "check_circle";
  else if (type === "error") icon.textContent = "error";
  else if (type === "warning") icon.textContent = "warning";
  else icon.textContent = "info";

  const text = document.createElement("span");
  text.className = "toast-message";
  text.textContent = message;

  const close = document.createElement("button");
  close.className = "toast-close";
  close.innerHTML = '<span class="material-symbols-outlined">close</span>';
  close.addEventListener("click", () => dismiss(li));

  li.append(icon, text, close);
  c.appendChild(li);

  // アニメーション用に次フレームで active クラスを付ける
  requestAnimationFrame(() => li.classList.add("toast-active"));

  const timer = setTimeout(() => dismiss(li), duration);
  li.addEventListener("mouseenter", () => clearTimeout(timer));
  li.addEventListener("mouseleave", () => setTimeout(() => dismiss(li), 1000));

  return li;
}

function dismiss(li) {
  li.classList.remove("toast-active");
  li.classList.add("toast-out");
  li.addEventListener("animationend", () => li.remove(), { once: true });
}

export const toast = {
  success: (msg, duration) => createToast(msg, "success", duration),
  error: (msg, duration) => createToast(msg, "error", duration),
  warning: (msg, duration) => createToast(msg, "warning", duration),
  info: (msg, duration) => createToast(msg, "default", duration),
};
