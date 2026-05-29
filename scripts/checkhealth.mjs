#!/usr/bin/env node
import { execSync } from "node:child_process";
import { existsSync, mkdirSync, readFileSync } from "node:fs";
import { createConnection } from "node:net";

// .env をプロジェクトルートから読み込む（存在する場合のみ）
if (existsSync(".env")) {
  for (const line of readFileSync(".env", "utf-8").split("\n")) {
    const m = line.match(/^\s*([^#=\s][^=]*?)\s*=\s*(.*)\s*$/);
    if (m) process.env[m[1]] = m[2].replace(/^["']|["']$/g, "");
  }
}

const RUNTIME_MODE = process.argv.includes("--runtime");

// ANSI colors
const c = {
  reset:  "\x1b[0m",
  bold:   "\x1b[1m",
  dim:    "\x1b[2m",
  green:  "\x1b[32m",
  yellow: "\x1b[33m",
  red:    "\x1b[31m",
  cyan:   "\x1b[36m",
  white:  "\x1b[37m",
  gray:   "\x1b[90m",
};

const icon = {
  pass: `${c.green}●${c.reset}`,
  warn: `${c.yellow}◐${c.reset}`,
  fail: `${c.red}●${c.reset}`,
};

let hasError = false;
const results = [];

function pass(label, detail = "") {
  results.push({ type: "pass", label, detail });
}
function warn(label, detail = "") {
  results.push({ type: "warn", label, detail });
}
function fail(label, detail = "") {
  results.push({ type: "fail", label, detail });
  hasError = true;
}

function which(cmd) {
  try { return execSync(`command -v ${cmd}`, { stdio: "pipe" }).toString().trim(); } catch { return ""; }
}

function run(cmd) {
  try { return execSync(cmd, { stdio: "pipe" }).toString().trim(); } catch { return ""; }
}

function configGet(key) {
  try {
    const yaml = readFileSync("config.yaml", "utf-8");
    const match = yaml.match(new RegExp(`^${key}:\\s*"?([^"\\n]+)"?`, "m"));
    return match ? match[1].trim() : "";
  } catch { return ""; }
}

function checkPort(host, port) {
  return new Promise((resolve) => {
    const s = createConnection({ host, port }, () => { s.destroy(); resolve(true); });
    s.on("error", () => resolve(false));
    s.setTimeout(2000, () => { s.destroy(); resolve(false); });
  });
}

async function main() {
  // ── ヘッダー ──────────────────────────────────────────────
  console.log();
  console.log(`  ${c.bold}${c.cyan}Yuuka${c.reset}  ${c.gray}health check${c.reset}`);
  console.log(`  ${c.gray}${"─".repeat(40)}${c.reset}`);

  // ── ビルド前チェック ───────────────────────────────────────

  // Node.js
  const nodeVer = run("node --version");
  nodeVer ? pass("Node.js", nodeVer) : fail("Node.js", "not found");

  // cargo
  const cargoVer = run("cargo --version");
  cargoVer ? pass("cargo (Rust)", cargoVer) : fail("cargo", "not found — install Rust: https://rustup.rs");

  // Chromium
  const chromiumPath =
    process.env.PUPPETEER_EXECUTABLE_PATH ||
    which("chromium") ||
    which("chromium-browser") ||
    which("google-chrome");
  chromiumPath
    ? pass("chromium", chromiumPath)
    : fail("chromium", "not found — install chromium");

  // Redis
  const redisPong = run("redis-cli ping");
  redisPong === "PONG"
    ? pass("Redis", "running")
    : warn("Redis", "not running — SQLite fallback mode");

  // config.yaml
  if (!existsSync("config.yaml")) {
    fail("config.yaml", "not found — copy example.yaml");
  } else {
    pass("config.yaml", "found");

    const discordToken = configGet("DISCORD_TOKEN");
    !discordToken || discordToken === "YOUR_DISCORD_BOT_TOKEN"
      ? fail("DISCORD_TOKEN", "not configured")
      : pass("DISCORD_TOKEN", "configured");

    const geminiKey = configGet("GEMINI_API_KEY");
    !geminiKey || geminiKey === "YOUR_GEMINI_API_KEY"
      ? fail("GEMINI_API_KEY", "not configured")
      : pass("GEMINI_API_KEY", "configured");

    const adminToken = configGet("ADMIN_TOKEN");
    adminToken
      ? pass("ADMIN_TOKEN", "configured")
      : warn("ADMIN_TOKEN", "not set — using default");
  }

  // data/ ディレクトリ
  try {
    if (!existsSync("data")) mkdirSync("data", { recursive: true });
    pass("data/", "ready");
  } catch {
    fail("data/", "cannot create directory");
  }

  // ポート空き確認
  const portStr = configGet("PORT") || "7854";
  const port = parseInt(portStr, 10);
  const portInUse = await checkPort("127.0.0.1", port);
  portInUse
    ? warn(`port ${port}`, "already in use — existing process may be running")
    : pass(`port ${port}`, "available");

  // ── 起動後チェック（--runtime）─────────────────────────────
  if (RUNTIME_MODE) {
    console.log();
    console.log(`  ${c.gray}── runtime ─────────────────────────────${c.reset}`);

    // pm2
    try {
      const pm2List = JSON.parse(run("pm2 jlist") || "[]");
      const yuuka = pm2List.find((p) => p.name === "yuuka");
      if (!yuuka) {
        fail("pm2 [yuuka]", "process not found");
      } else if (yuuka.pm2_env?.status === "online") {
        pass("pm2 [yuuka]", `online  pid=${yuuka.pid}  uptime=${Math.floor((Date.now() - yuuka.pm2_env.pm_uptime) / 60000)}m`);
      } else {
        fail("pm2 [yuuka]", yuuka.pm2_env?.status ?? "unknown");
      }
    } catch {
      warn("pm2", "not found");
    }

    // Web サーバー
    const hostStr = configGet("HOST") || "127.0.0.1";
    const webUp = await checkPort(hostStr, port);
    webUp
      ? pass("web server", `http://${hostStr}:${port} — responding`)
      : fail("web server", `http://${hostStr}:${port} — no response`);

    // Redis (再確認)
    const redisPong2 = run("redis-cli ping");
    redisPong2 === "PONG"
      ? pass("Redis", "connected")
      : warn("Redis", "not connected — SQLite fallback active");
  }

  // ── 結果表示 ───────────────────────────────────────────────
  console.log();
  const maxLabel = Math.max(...results.map((r) => r.label.length));
  for (const r of results) {
    const ic = icon[r.type];
    const label = r.label.padEnd(maxLabel);
    const detail = r.detail ? `${c.gray}${r.detail}${c.reset}` : "";
    console.log(`  ${ic}  ${c.bold}${label}${c.reset}  ${detail}`);
  }

  console.log();
  if (hasError) {
    console.log(`  ${c.red}${c.bold}✖  Health check failed.${c.reset}  Resolve the errors above before building.\n`);
    process.exit(1);
  } else {
    console.log(`  ${c.green}${c.bold}✔  All checks passed.${c.reset}\n`);
  }
}

main();
