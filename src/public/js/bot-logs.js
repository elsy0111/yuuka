import { state } from "./state.js";

const levelLabels = {
  debug: "DEBUG",
  info: "INFO",
  warn: "WARN",
  error: "ERROR",
};

export function initBotLogs() {
  document.getElementById("btn-bot-logs-reload")?.addEventListener("click", fetchBotLogs);
  document.getElementById("bot-log-level-filter")?.addEventListener("change", fetchBotLogs);
}

export async function fetchBotLogs() {
  const list = document.getElementById("bot-logs-list");
  if (!list) return;

  list.replaceChildren();
  const loading = document.createElement("div");
  loading.className = "bot-log-empty";
  loading.textContent = "ログを読み込み中...";
  list.appendChild(loading);

  try {
    const params = new URLSearchParams({
      userId: state.activeUserId,
      limit: "200",
    });
    const level = document.getElementById("bot-log-level-filter")?.value || "";
    if (level) params.set("level", level);

    const res = await fetch(`/api/bot-logs?${params}`);
    const data = await res.json();
    list.replaceChildren();

    if (!data.success) {
      renderEmpty(list, data.message || "Botログを取得できませんでした。");
      return;
    }

    renderBotLogs(list, data.logs || []);
  } catch (error) {
    console.error(error);
    list.replaceChildren();
    renderEmpty(list, "通信エラーでBotログを取得できませんでした。");
  }
}

function renderBotLogs(list, logs) {
  if (logs.length === 0) {
    renderEmpty(list, "対象ユーザーのBotログはまだありません。");
    return;
  }

  logs.forEach((log) => {
    list.appendChild(makeLogRow(log));
  });
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
    log.username || log.user_id || "unknown-user",
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
