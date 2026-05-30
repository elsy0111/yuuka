const THEME_KEY = "yuuka-theme";

export function currentTheme() {
  return localStorage.getItem(THEME_KEY) || "dark";
}

export function applyTheme(theme) {
  if (theme === "blue-archive") {
    document.documentElement.setAttribute("data-theme", "blue-archive");
  } else {
    document.documentElement.removeAttribute("data-theme");
  }
  localStorage.setItem(THEME_KEY, theme);
  document.querySelectorAll(".theme-option").forEach((btn) => {
    btn.classList.toggle("active", btn.getAttribute("data-theme") === theme);
  });
}

export function initTheme() {
  applyTheme(currentTheme());
  document.querySelectorAll(".theme-option").forEach((btn) => {
    btn.addEventListener("click", () => applyTheme(btn.getAttribute("data-theme")));
  });
}
