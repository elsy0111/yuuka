import { toast } from "./toast.js";

export async function apiRequest(url, options) {
  const response = await fetch(url, options);
  const data = await response.json();
  if (!response.ok || !data.success) {
    throw new Error(data.message || "操作に失敗しました。もう一度お試しください。");
  }
  return data;
}

export function showListState(container, message, retry) {
  container.replaceChildren();
  const panel = document.createElement("div");
  panel.className = "list-state glass";
  panel.setAttribute("role", "status");
  const text = document.createElement("p");
  text.textContent = message;
  panel.appendChild(text);
  if (retry) {
    const button = document.createElement("button");
    button.type = "button";
    button.className = "btn btn-secondary";
    button.textContent = "再試行";
    button.addEventListener("click", retry);
    panel.appendChild(button);
  }
  container.appendChild(panel);
}

export function guardSubmit(handler) {
  return async (event) => {
    event.preventDefault();
    const form = event.currentTarget;
    if (form.dataset.submitting === "true") return;
    form.dataset.submitting = "true";
    form.setAttribute("aria-busy", "true");
    const buttons = [...form.querySelectorAll('[type="submit"]')];
    buttons.forEach((button) => {
      button.disabled = true;
    });
    try {
      await handler(event);
    } finally {
      delete form.dataset.submitting;
      form.removeAttribute("aria-busy");
      buttons.forEach((button) => {
        button.disabled = false;
      });
    }
  };
}

export function reportError(error) {
  toast.error(error.message || "サーバーに接続できませんでした。もう一度お試しください。");
}

export function localDate(date = new Date()) {
  return `${date.getFullYear()}-${String(date.getMonth() + 1).padStart(2, "0")}-${String(date.getDate()).padStart(2, "0")}`;
}
