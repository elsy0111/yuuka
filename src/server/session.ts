import fs from "node:fs";
import path from "node:path";
import crypto from "node:crypto";
import type http from "node:http";

export const SESSION_TTL = 24 * 60 * 60 * 1000;

const SESSION_STORE_PATH = path.resolve(process.cwd(), "data", "admin-sessions.json");

interface SessionEntry {
  createdAt: number;
  discordId: string;
}

const activeSessions = new Map<string, SessionEntry>();

export const loginAttempts = new Map<string, { count: number; resetAt: number }>();
export const MAX_LOGIN_ATTEMPTS = 5;
export const LOGIN_LOCKOUT_MS = 15 * 60 * 1000;

function parseCookies(cookieHeader?: string): Record<string, string> {
  const list: Record<string, string> = {};
  if (!cookieHeader) return list;

  cookieHeader.split(";").forEach((cookie) => {
    const parts = cookie.split("=");
    const name = parts[0].trim();
    const value = parts.slice(1).join("=").trim();
    if (name) list[name] = decodeURIComponent(value);
  });

  return list;
}

function hashSessionToken(token: string): string {
  return crypto.createHash("sha256").update(token).digest("hex");
}

function loadStoredSessions(): void {
  try {
    if (!fs.existsSync(SESSION_STORE_PATH)) return;
    const raw = fs.readFileSync(SESSION_STORE_PATH, "utf-8");
    const sessions = JSON.parse(raw) as Record<string, number | SessionEntry>;
    const now = Date.now();
    for (const [tokenHash, entry] of Object.entries(sessions)) {
      if (typeof entry === "number") {
        // 旧フォーマット（createdAt のみ）の互換処理
        if (now - entry <= SESSION_TTL)
          activeSessions.set(tokenHash, { createdAt: entry, discordId: "" });
      } else if (now - entry.createdAt <= SESSION_TTL) {
        activeSessions.set(tokenHash, entry);
      }
    }
  } catch (err) {
    console.error("セッションストアの読み込みに失敗しました:", err);
  }
}

export function persistSessions(): void {
  try {
    fs.mkdirSync(path.dirname(SESSION_STORE_PATH), { recursive: true });
    fs.writeFileSync(
      SESSION_STORE_PATH,
      JSON.stringify(Object.fromEntries(activeSessions), null, 2),
      "utf-8",
    );
  } catch (err) {
    console.error("セッションストアの保存に失敗しました:", err);
  }
}

export function getBearerSessionToken(req: http.IncomingMessage): string | undefined {
  const auth = req.headers.authorization;
  if (!auth?.startsWith("Bearer ")) return undefined;
  return auth.slice("Bearer ".length).trim() || undefined;
}

export function createSession(discordId: string): string {
  const sessionToken = crypto.randomBytes(32).toString("hex");
  activeSessions.set(hashSessionToken(sessionToken), { createdAt: Date.now(), discordId });
  persistSessions();
  return sessionToken;
}

export function getSessionDiscordId(req: http.IncomingMessage): string | undefined {
  const sessionToken = getCookieSessionToken(req) || getBearerSessionToken(req);
  if (!sessionToken) return undefined;
  const entry = activeSessions.get(hashSessionToken(sessionToken));
  return entry?.discordId || undefined;
}

export function deleteSessionToken(sessionToken?: string): void {
  if (!sessionToken) return;
  activeSessions.delete(hashSessionToken(sessionToken));
}

export function getCookieSessionToken(req: http.IncomingMessage): string | undefined {
  return parseCookies(req.headers.cookie)["__Host-yuuka-session"];
}

export function isAuthenticated(req: http.IncomingMessage): boolean {
  const sessionToken = getCookieSessionToken(req) || getBearerSessionToken(req);
  if (!sessionToken) return false;

  const sessionHash = hashSessionToken(sessionToken);
  const entry = activeSessions.get(sessionHash);
  if (!entry) return false;

  if (Date.now() - entry.createdAt > SESSION_TTL) {
    activeSessions.delete(sessionHash);
    persistSessions();
    return false;
  }
  return true;
}

loadStoredSessions();
