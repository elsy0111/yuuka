import * as playbookService from "../services/playbookService.js";

function errorMessage(err: unknown): string {
  return err instanceof Error ? err.message : String(err);
}

/**
 * 手順書（Playbook）を新しく登録・保存するツール関数
 */
export async function savePlaybook(
  userId: string,
  args: {
    name: string;
    title: string;
    keywords: string[];
    description: string;
    steps: string;
  },
): Promise<string> {
  try {
    const res = playbookService.savePlaybook(
      userId,
      args.name,
      args.title,
      args.keywords,
      args.description,
      args.steps,
    );
    return JSON.stringify(res);
  } catch (err: unknown) {
    return JSON.stringify({
      success: false,
      message: errorMessage(err),
    });
  }
}

/**
 * 関連する手順書（Playbook）を検索・取得するツール関数
 */
export async function findPlaybooks(userId: string, args: { query?: string }): Promise<string> {
  try {
    const playbooks = playbookService.findPlaybooks(userId, args.query);
    return JSON.stringify({
      success: true,
      query: args.query || null,
      results: playbooks,
    });
  } catch (err: unknown) {
    return JSON.stringify({
      success: false,
      message: errorMessage(err),
    });
  }
}
