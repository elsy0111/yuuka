import * as memoryRepo from "../db/memoryRepo.js";

export function saveMemory(userId: string, args: { content: string; module?: string }): string {
  const memory = memoryRepo.saveMemory(userId, args.content, args.module ?? "general");
  return JSON.stringify({
    success: true,
    message: `記憶しました: 「${memory.content}」`,
    memory,
  });
}

export function searchMemories(userId: string, args: { query: string; module?: string }): string {
  const memories = memoryRepo.searchMemories(userId, args.query, args.module);
  if (memories.length === 0) {
    return JSON.stringify({
      success: true,
      message: "関連する記憶は見つかりませんでした。",
      memories: [],
    });
  }
  const lines = memories.map((m) => `[ID:${m.id}][${m.module}] ${m.content}`);
  return JSON.stringify({
    success: true,
    message: `関連する記憶 ${memories.length}件:\n${lines.join("\n")}`,
    memories,
  });
}

export function listMemories(userId: string, args: { module?: string }): string {
  const memories = memoryRepo.listMemories(userId, args.module);
  if (memories.length === 0) {
    return JSON.stringify({
      success: true,
      message: "保存されている記憶はありません。",
      memories: [],
    });
  }
  const lines = memories.map((m) => `[ID:${m.id}][${m.module}] ${m.content}`);
  return JSON.stringify({
    success: true,
    message: `記憶一覧 (${memories.length}件):\n${lines.join("\n")}`,
    memories,
  });
}

export function deleteMemory(userId: string, args: { id: number }): string {
  const success = memoryRepo.deleteMemory(args.id, userId);
  return JSON.stringify({
    success,
    message: success ? `記憶ID:${args.id}を削除しました。` : "対象の記憶が見つかりません。",
  });
}
