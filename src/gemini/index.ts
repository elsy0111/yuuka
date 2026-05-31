import type { Content, Part, FunctionCall } from "@google/generative-ai";
import { dispatchFunction } from "../functions/index.js";
import { addChatMessage, getRecentChatHistory } from "../db/chatHistoryRepo.js";
import { generateWithRetry, isRateLimitError, isServerError, sleep } from "./retry.js";
import type { ChatMessage } from "./types.js";

export type { ChatMessage } from "./types.js";

/**
 * メッセージを処理し、Function Callingループを含む完全な応答を返す
 */
export async function processMessage(
  userId: string,
  message: ChatMessage,
  onStatusChange?: (status: "thinking" | "writing" | "idle") => void,
): Promise<string> {
  // 1. ユーザーのメッセージをDB履歴に保存
  if (message.text) {
    await addChatMessage(userId, "user", message.text);
  }

  // 2. 過去の会話履歴をDBから取得（直近15ターン分）
  const history = await getRecentChatHistory(userId, 15);

  // 3. Geminiの入力形式（Contents配列）へ変換し、同じロールの連続を結合して交互にする
  const contents: Content[] = [];
  for (const entry of history) {
    const role = entry.role;
    if (contents.length > 0 && contents[contents.length - 1].role === role) {
      const lastPart = contents[contents.length - 1].parts[0];
      if ("text" in lastPart) {
        lastPart.text += `\n${entry.text}`;
      }
    } else {
      contents.push({
        role,
        parts: [{ text: entry.text }],
      });
    }
  }

  // 履歴が空の場合のフォールバック
  if (contents.length === 0) {
    contents.push({ role: "user", parts: [{ text: message.text || "" }] });
  }

  // 4. 最新のメッセージに画像がある場合、直近のユーザーコンテンツにパーツとして追加する
  if (message.imageData) {
    const lastContent = contents[contents.length - 1];
    if (lastContent && lastContent.role === "user") {
      lastContent.parts.push({
        inlineData: {
          data: message.imageData.data,
          mimeType: message.imageData.mimeType,
        },
      });
    } else {
      contents.push({
        role: "user",
        parts: [
          { text: "" },
          {
            inlineData: {
              data: message.imageData.data,
              mimeType: message.imageData.mimeType,
            },
          },
        ],
      });
    }
  }

  let browserToolCalled = false;
  let browserToolFailed = false;

  try {
    onStatusChange?.("thinking");
    let result = await generateWithRetry(contents, 3, userId);
    let response = result.response;

    // Function Calling ループ（最大10回まで）
    let iterations = 0;
    const maxIterations = 10;

    while (iterations < maxIterations) {
      const candidate = response.candidates?.[0];
      if (!candidate) break;

      const functionCalls = candidate.content.parts.filter(
        (p): p is Part & { functionCall: FunctionCall } => "functionCall" in p,
      );

      if (functionCalls.length === 0) break;

      // 各function callを実行
      const functionResponseParts: Part[] = [];

      for (const fc of functionCalls) {
        const { name, args } = fc.functionCall;
        console.log(`🔧 Function Call: ${name}`, JSON.stringify(args));

        const functionResult = await dispatchFunction(
          name,
          args as Record<string, unknown>,
          userId,
        );
        console.log(
          `📤 Function Result (Sent to Gemini): ${functionResult.substring(0, 500)}${functionResult.length > 500 ? "... (truncated in console log)" : ""}`,
        );

        // ブラウザツールの実行と成否判定
        if (
          name.startsWith("browserInteractive") ||
          ["fetchDynamicPage", "takePageScreenshot", "searchWeb"].includes(name)
        ) {
          browserToolCalled = true;
          try {
            const parsed = JSON.parse(functionResult);
            if (parsed && parsed.success === false) {
              browserToolFailed = true;
            }
          } catch {
            browserToolFailed = true;
          }
        }

        let parsedResult: object;
        try {
          parsedResult = JSON.parse(functionResult) as object;
        } catch {
          parsedResult = { result: functionResult };
        }

        functionResponseParts.push({
          functionResponse: {
            name,
            response: parsedResult,
          },
        });
      }

      // Function結果を含めて再度Geminiに送信
      contents.push(candidate.content);
      contents.push({ role: "user", parts: functionResponseParts });

      // 最後のテキスト生成の直前で書き込み中ステータスに変更
      onStatusChange?.("writing");

      result = await generateWithRetry(contents, 3, userId);
      response = result.response;
      iterations++;
    }

    if (iterations >= maxIterations) {
      browserToolFailed = true;
    }

    // ステータス表示のプレミアムな演出のための自然な遅延
    if (iterations === 0) {
      onStatusChange?.("writing");
      await sleep(1000);
    } else {
      await sleep(800);
    }

    // 最終テキスト応答を取得してDB履歴に保存
    let text = "";
    try {
      text = response.text();
    } catch (e) {
      console.warn("response.text() retrieval failed:", e);
    }

    if (text?.trim()) {
      await addChatMessage(userId, "model", text);
      return text;
    } else {
      if (browserToolCalled || browserToolFailed) {
        return "ブラウザ操作に失敗しました。求めた結果が得られませんでした。";
      }
      return "処理が完了しました。";
    }
  } catch (error) {
    if (isRateLimitError(error)) {
      console.error("Gemini API レート制限:", error);
      return "⚠️ 現在APIの利用制限（トークン枯渇など）に達しています。しばらく待ってからもう一度お試しください。";
    }
    if (isServerError(error)) {
      console.error("Gemini API サーバーエラー:", error);
      return "⚠️ AIサーバーが現在混み合っているか、一時的なエラーが発生しています（503等）。しばらく待ってからもう一度お試しください。";
    }
    console.error("Gemini API エラー:", error);
    throw error;
  }
}
