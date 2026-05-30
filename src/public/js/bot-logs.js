import { state } from "./state.js";

const levelLabels = { debug: "DEBUG", info: "INFO", warn: "WARN", error: "ERROR" };

let allLogs = [];
let activeLevels = new Set(["debug", "info", "warn", "error"]);
let searchQuery = "";
let autoRefreshTimer = null;
let autoRefreshActive = false;

export function initBotLogs() {
  document.querySelectorAll(".btn-log-level").forEach((btn) => {
    btn.addEventListener("click", () => {
      const level = btn.dataset.level;
      if (activeLevels.has(level)) {
        activeLevels.delete(level);
        btn.classList.remove("active");
      } else {
        activeLevels.add(level);
        btn.classList.add("active");
      }
      renderFiltered();
    });
  });

  document.getElementById("bot-log-search")?.addEventListener("input", (e) => {
    searchQuery = e.target.value.trim().toLowerCase();
    renderFiltered();
  });

  document.getElementById("bot-log-limit")?.addEventListener("change", fetchBotLogs);

  document.getElementById("btn-bot-logs-autorefresh")?.addEventListener("click", toggleAutoRefresh);

  document.getElementById("btn-bot-logs-reload")?.addEventListener("click", fetchBotLogs);
}

function toggleAutoRefresh() {
  const btn = document.getElementById("btn-bot-logs-autorefresh");
  if (autoRefreshActive) {
    clearInterval(autoRefreshTimer);
    autoRefreshTimer = null;
    autoRefreshActive = false;
    btn?.classList.remove("active");
  } else {
    autoRefreshActive = true;
    btn?.classList.add("active");
    fetchBotLogs();
    autoRefreshTimer = setInterval(fetchBotLogs, 10000);
  }
}

export async function fetchBotLogs() {
  const list = document.getElementById("bot-logs-list");
  if (!list) return;

  try {
    const limitEl = document.getElementById("bot-log-limit");
    const limit = limitEl ? limitEl.value : "200";

    const params = new URLSearchParams({
      userId: state.activeUserId,
      limit,
      includeSystem: "1",
    });

    const res = await fetch(`/api/bot-logs?${params}`);
    const data = await res.json();

    if (!data.success) {
      allLogs = [];
      renderFiltered();
      return;
    }

    allLogs = data.logs || [];
    renderFiltered();
  } catch (error) {
    console.error(error);
    allLogs = [];
    renderEmpty(list, "通信エラーでBotログを取得できませんでした。");
    updateStatus(0, 0);
  }
}

function renderFiltered() {
  const list = document.getElementById("bot-logs-list");
  if (!list) return;

  const filtered = allLogs.filter((log) => {
    if (!activeLevels.has(log.level)) return false;
    if (searchQuery) {
      const inEvent = (log.event || "").toLowerCase().includes(searchQuery);
      const inDetails = (log.details || "").toLowerCase().includes(searchQuery);
      const inUser = (log.username || log.user_id || "").toLowerCase().includes(searchQuery);
      if (!inEvent && !inDetails && !inUser) return false;
    }
    return true;
  });

  list.replaceChildren();
  if (filtered.length === 0) {
    renderEmpty(
      list,
      allLogs.length === 0 ? "Botログはまだありません。" : "条件に一致するログがありません。",
    );
  } else {
    for (const log of filtered) {
      list.appendChild(makeLogRow(log));
    }
  }

  updateStatus(filtered.length, allLogs.length);
}

function updateStatus(shown, total) {
  const el = document.getElementById("bot-log-status");
  if (!el) return;
  el.textContent = total > 0 ? `${shown} / ${total} 件` : "";
}

function renderEmpty(list, message) {
  const empty = document.createElement("div");
  empty.className = "bot-log-empty";
  empty.textContent = message;
  list.appendChild(empty);
}

function makeLogRow(log) {
  const row = document.createElement("article");
  row.className = `bot-log-row bot-log-${log.level}`;

  const head = document.createElement("div");
  head.className = "bot-log-head";

  const level = document.createElement("span");
  level.className = "bot-log-level";
  level.textContent = levelLabels[log.level] || log.level;

  const event = document.createElement("strong");
  event.className = "bot-log-event";
  event.textContent = log.event;

  const time = document.createElement("time");
  time.className = "bot-log-time";
  time.textContent = log.created_at;

  head.append(level, event, time);

  const meta = document.createElement("div");
  meta.className = "bot-log-meta";
  meta.textContent = [
    log.username || log.user_id || "system",
    log.guild_id ? `guild:${log.guild_id}` : "DM",
    log.channel_id ? `ch:${log.channel_id}` : "",
    log.message_id ? `msg:${log.message_id}` : "",
  ]
    .filter(Boolean)
    .join(" / ");

  row.append(head, meta);

  if (log.details) {
    const details = document.createElement("pre");
    details.className = "bot-log-details";
    details.textContent = formatDetails(log.details);
    row.appendChild(details);
  }

  return row;
}

function formatDetails(details) {
  try {
    return JSON.stringify(JSON.parse(details), null, 2);
  } catch {
    return details;
  }
}
