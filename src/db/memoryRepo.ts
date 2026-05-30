import { getDb } from "./database.js";

export interface Memory {
  id: number;
  user_id: string;
  content: string;
  module: string;
  created_at: string;
}

export function saveMemory(userId: string, content: string, module: string = "general"): Memory {
  const db = getDb();
  const stmt = db.prepare(`INSERT INTO memories (user_id, content, module) VALUES (?, ?, ?)`);
  const result = stmt.run(userId, content, module);
  return db.prepare("SELECT * FROM memories WHERE id = ?").get(result.lastInsertRowid) as Memory;
}

export function searchMemories(userId: string, query: string, module?: string): Memory[] {
  const db = getDb();
  const conditions = ["user_id = ?", "content LIKE ?"];
  const params: unknown[] = [userId, `%${query}%`];

  if (module) {
    conditions.push("module = ?");
    params.push(module);
  }

  const sql = `SELECT * FROM memories WHERE ${conditions.join(" AND ")} ORDER BY created_at DESC LIMIT 20`;
  return db.prepare(sql).all(...params) as Memory[];
}

export function listMemories(userId: string, module?: string): Memory[] {
  const db = getDb();
  if (module) {
    return db
      .prepare("SELECT * FROM memories WHERE user_id = ? AND module = ? ORDER BY created_at DESC")
      .all(userId, module) as Memory[];
  }
  return db
    .prepare("SELECT * FROM memories WHERE user_id = ? ORDER BY module, created_at DESC")
    .all(userId) as Memory[];
}

export function updateMemory(
  id: number,
  userId: string,
  content: string,
  module?: string,
): Memory | undefined {
  const db = getDb();
  const sets = ["content = ?"];
  const params: unknown[] = [content];
  if (module !== undefined) {
    sets.push("module = ?");
    params.push(module);
  }
  params.push(id, userId);
  db.prepare(`UPDATE memories SET ${sets.join(", ")} WHERE id = ? AND user_id = ?`).run(...params);
  return db.prepare("SELECT * FROM memories WHERE id = ?").get(id) as Memory | undefined;
}

export function deleteMemory(id: number, userId: string): boolean {
  const db = getDb();
  const result = db.prepare("DELETE FROM memories WHERE id = ? AND user_id = ?").run(id, userId);
  return result.changes > 0;
}
