import { Client, GatewayIntentBits, Partials, ActivityType, type Message } from "discord.js";
import { config } from "./config.js";
import { processMessage, type ChatMessage } from "./gemini.js";
import { parseReceipt } from "./services/receiptParser.js";
import { startReminderService, stopReminderService } from "./services/reminderService.js";
import { addBotLog, pruneBotLogs, type BotLogLevel } from "./db/botLogRepo.js";
import { isRegisteredUser, getUserDiscordBotConfig, listAllUserIds } from "./db/userRepo.js";
import { decryptText } from "./utils/crypto.js";
import { GoogleGenerativeAI } from "@google/generative-ai";

type TypingChannel = Message["channel"] & {
  sendTyping: () => Promise<unknown>;
};

type SendableChannel = Message["channel"] & {
  send: (content: string) => Promise<unknown>;
};

function hasSendTyping(channel: Message["channel"]): channel is TypingChannel {
  return "sendTyping" in channel && typeof channel.sendTyping === "function";
}

function hasSend(channel: Message["channel"]): channel is SendableChannel {
  return "send" in channel && typeof channel.send === "function";
}

function serializeError(error: unknown): string {
  if (error instanceof Error) return `${error.name}: ${error.message}`;
  return String(error);
}

function logBotEvent(
  level: BotLogLevel,
  event: string,
  message: Message,
  details?: Record<string, unknown>,
): void {
  try {
    addBotLog({
      level,
      event,
      userId: message.author.id,
      username: message.author.tag,
      guildId: message.guild?.id ?? null,
      channelId: message.channelId,
      messageId: message.id,
      details,
    });
  } catch (error) {
    console.error("[Discord Bot] Botログ記録に失敗しました:", error);
  }
}

function logSystemBotEvent(
  level: BotLogLevel,
  event: string,
  details?: Record<string, unknown>,
  userId?: string,
): void {
  try {
    addBotLog({ level, event, userId, details });
  } catch (error) {
    console.error("[Discord Bot] Botログ記録に失敗しました:", error);
  }
}

// デフォルト（共有）クライアント
export const client = new Client({
  intents: [
    GatewayIntentBits.Guilds,
    GatewayIntentBits.GuildMessages,
    GatewayIntentBits.MessageContent,
    GatewayIntentBits.DirectMessages,
  ],
  partials: [Partials.Channel, Partials.Message],
});

// ユーザーごとのカスタムクライアント: Map<userId, Client>
export const customClients = new Map<string, Client>();

/**
 * ユーザーIDに応じた適切なBotクライアントを取得する
 * ユーザーが独自のDiscord Tokenを設定している場合はそれを優先し、無ければデフォルトクライアントを返す
 */
export function getBotClientForUser(userId: string): Client {
  const custom = customClients.get(userId);
  if (custom?.readyAt) {
    return custom;
  }
  return client;
}

export function setBotStatus(botClient: Client, status: "thinking" | "writing" | "idle") {
  if (!botClient.user) return;
  try {
    if (status === "thinking") {
      botClient.user.setPresence({
        activities: [
          {
            name: "custom",
            type: ActivityType.Custom,
            state: "考え中...",
          },
        ],
        status: "dnd",
      });
    } else if (status === "writing") {
      botClient.user.setPresence({
        activities: [
          {
            name: "custom",
            type: ActivityType.Custom,
            state: "書き込み中...",
          },
        ],
        status: "online",
      });
    } else {
      botClient.user.setPresence({
        activities: [],
        status: "online",
      });
    }
  } catch (err) {
    console.error("Failed to set bot presence status:", err);
  }
}

client.once("clientReady", (c) => {
  console.log(`✅ デフォルトBot: ${c.user.tag} としてログインしました`);
  logSystemBotEvent("info", "default_bot_ready", { tag: c.user.tag, id: c.user.id });
  setBotStatus(client, "idle");
  // リマインダーサービスを開始
  startReminderService();
});

client.once("clientReady", (c) => {
  console.log(`✅ デフォルトBot: ${c.user.tag} としてログインしました (clientReady)`);
  logSystemBotEvent("debug", "default_bot_ready_duplicate_listener", {
    tag: c.user.tag,
    id: c.user.id,
  });
  setBotStatus(client, "idle");
  // リマインダーサービスを開始
  startReminderService();
});

/**
 * 指定したBotクライアントにメッセージハンドラーを設定する
 */
export function setupMessageListener(botClient: Client, ownerId?: string) {
  botClient.on("messageCreate", async (message: Message) => {
    // Bot自身のメッセージは無視
    if (message.author.bot) return;

    // 特定ユーザー専用のカスタムクライアントの場合、送信者がそのオーナーでなければ完全に無視する
    if (ownerId && message.author.id !== ownerId) return;

    // デフォルトクライアントの場合、登録ユーザーからのメッセージのみ応答
    if (!ownerId) {
      try {
        if (!isRegisteredUser(message.author.id)) {
          logBotEvent("warn", "ignored_unregistered_user", message, {
            contentLength: message.content.length,
            hasGuild: Boolean(message.guild),
          });
          return;
        }
      } catch (error) {
        logBotEvent("error", "registration_check_failed", message, {
          error: serializeError(error),
          contentLength: message.content.length,
          hasGuild: Boolean(message.guild),
        });
        return;
      }
    }

    // 登録ユーザーが独自のBotを有効に起動している場合は、デフォルトクライアントは応答をスキップする
    if (!ownerId && customClients.has(message.author.id)) {
      const customClient = customClients.get(message.author.id);
      if (customClient?.readyAt) {
        logBotEvent("info", "ignored_custom_bot_active", message, {
          customBotUser: customClient.user?.tag,
        });
        return;
      }
    }

    // 処理対象のユーザーID（カスタムの場合はオーナー、デフォルトの場合はメッセージの送信者）
    const userId = ownerId || message.author.id;

    let referencedMsg: Message | null = null;

    // 返信先メッセージの取得
    if (message.reference?.messageId) {
      try {
        referencedMsg = await message.channel.messages.fetch(message.reference.messageId);
      } catch (err) {
        console.error("返信先メッセージの取得に失敗しました:", err);
        logBotEvent("warn", "reference_fetch_failed", message, { error: serializeError(err) });
      }
    }

    const currentBotUser = botClient.user;
    if (!currentBotUser) {
      logBotEvent("error", "bot_user_unavailable", message);
      return;
    }

    // 「入力中...」を維持するためのタイマー
    let typingInterval: NodeJS.Timeout | null = null;

    // リアクションをメイン処理と並列で実行（待たない）
    reactWithEmoji(message).catch((error) => {
      logBotEvent("warn", "reaction_unhandled_error", message, { error: serializeError(error) });
    });

    try {
      logBotEvent("info", "message_received", message, {
        ownerId: ownerId ?? null,
        contentLength: message.content.length,
        hasGuild: Boolean(message.guild),
        hasReference: Boolean(message.reference?.messageId),
        attachmentCount: message.attachments.size,
      });

      // 「入力中...」を表示し、処理が終わるまで5秒ごとに維持する
      if (hasSendTyping(message.channel)) {
        const channel = message.channel;
        await channel.sendTyping().catch((err: unknown) => console.error("sendTyping error:", err));
        typingInterval = setInterval(() => {
          channel.sendTyping().catch((err: unknown) => console.error("sendTyping error:", err));
        }, 5000);
      }

      // メンションテキストを除去してクリーンなメッセージを取得
      const text = message.content.replace(/<@!?\d+>/g, "").trim();

      // 返信先メッセージのテキストをコンテキストプレフィックスとして構築
      let contextPrefix = "";
      if (referencedMsg) {
        const authorName =
          referencedMsg.author.id === botClient.user?.id ? "あなた" : referencedMsg.author.username;
        const cleanRefText = referencedMsg.content.replace(/<@!?\d+>/g, "").trim();
        contextPrefix = `[返信先メッセージ (${authorName}): "${cleanRefText}"]\n`;
      }

      // クリーンな入力テキスト
      const fullText = contextPrefix + text;

      // 画像添付があるかチェック（現在のメッセージ、または返信先メッセージ）
      let imageAttachment = message.attachments.find((a) => a.contentType?.startsWith("image/"));
      if (!imageAttachment && referencedMsg) {
        imageAttachment = referencedMsg.attachments.find((a) =>
          a.contentType?.startsWith("image/"),
        );
      }

      let response: string;
      const statusCallback = (status: "thinking" | "writing" | "idle") => {
        setBotStatus(botClient, status);
      };

      if (imageAttachment) {
        console.log(`📷 画像受信 (返信先含む): ${imageAttachment.name} from ${message.author.tag}`);
        logBotEvent("info", "image_attachment_received", message, {
          name: imageAttachment.name,
          contentType: imageAttachment.contentType,
          size: imageAttachment.size,
        });

        const imageResponse = await fetch(imageAttachment.url);
        const imageBuffer = Buffer.from(await imageResponse.arrayBuffer());
        const imageBase64 = imageBuffer.toString("base64");
        const mimeType = imageAttachment.contentType || "image/jpeg";

        response = await parseReceipt(
          userId,
          imageBase64,
          mimeType,
          text || undefined,
          statusCallback,
        );
      } else if (fullText.trim()) {
        const chatMessage: ChatMessage = { text: fullText };
        response = await processMessage(userId, chatMessage, statusCallback);
      } else {
        response =
          "何かお手伝いできることはありますか？ 📋\n\nタスク管理、予定管理、家計管理ができますよ！";
      }

      // 応答が完了したため、タイマーをクリア
      if (typingInterval) {
        clearInterval(typingInterval);
        typingInterval = null;
      }

      await sendSplitResponse(message, response);
      logBotEvent("info", "response_sent", message, { responseLength: response.length });
    } catch (error) {
      if (typingInterval) {
        clearInterval(typingInterval);
        typingInterval = null;
      }
      console.error("メッセージ処理エラー:", error);
      logBotEvent("error", "message_processing_error", message, { error: serializeError(error) });
      await message.reply(
        "申し訳ございません、処理中にエラーが発生しました 😢\nしばらくしてからもう一度お試しください。",
      );
    } finally {
      setBotStatus(botClient, "idle");
    }
  });
}

/**
 * ユウカがメッセージを見てどう感じたかを表すUnicode絵文字でリアクション。
 * 失敗時は👀でフォールバック。プロンプト内容はログに含む。
 */
async function reactWithEmoji(message: Message): Promise<void> {
  if (!config.geminiApiKey) {
    logBotEvent("debug", "reaction_skipped_no_gemini_key", message);
    return;
  }
  try {
    const genAI = new GoogleGenerativeAI(config.geminiApiKey);
    const model = genAI.getGenerativeModel({
      model: config.geminiModel || "gemini-2.0-flash-lite",
    });
    const prompt =
      `あなたは「早瀬ユウカ」というキャラクターです。以下のDiscordメッセージを読んで、` +
      `ユウカとしてそのメッセージを見てどう感じたかを表すUnicode絵文字を1文字だけ返してください。` +
      `絵文字以外は絶対に出力しないでください。\n\n` +
      `"${message.content.slice(0, 200)}"`;
    const result = await model.generateContent(prompt);
    const emoji = result.response.text().trim().replace(/\s/g, "");
    logBotEvent("debug", "reaction_attempt", message, { emoji, prompt });
    if (emoji) {
      await message.react(emoji).catch(async (error: unknown) => {
        logBotEvent("warn", "reaction_emoji_failed", message, {
          emoji,
          error: serializeError(error),
        });
        await message.react("👀");
      });
      logBotEvent("debug", "reaction_added", message, { emoji });
    }
  } catch (error) {
    logBotEvent("warn", "reaction_generation_failed", message, { error: serializeError(error) });
    await message.react("👀").catch((fallbackError: unknown) => {
      logBotEvent("warn", "reaction_fallback_failed", message, {
        error: serializeError(fallbackError),
      });
    });
  }
}

/**
 * [SPLIT]マーカーで区切られたレスポンスを分割して順番に送信
 */
async function sendSplitResponse(message: Message, response: string): Promise<void> {
  const SPLIT_MARKER = "[SPLIT]";
  const MAX_LENGTH = 2000;

  const rawChunks = response
    .split(SPLIT_MARKER)
    .map((c) => c.trim())
    .filter((c) => c.length > 0);

  // さらに2000字超えのチャンクは文字数で再分割
  const chunks: string[] = [];
  for (const chunk of rawChunks) {
    if (chunk.length <= MAX_LENGTH) {
      chunks.push(chunk);
    } else {
      chunks.push(...splitMessage(chunk, MAX_LENGTH));
    }
  }

  for (let i = 0; i < chunks.length; i++) {
    if (i > 0) {
      const delay = Math.min(300 + chunks[i - 1].length * 1.5, 1200);
      await new Promise((resolve) => setTimeout(resolve, delay));
    }
    if (!hasSend(message.channel)) return;
    await message.channel.send(chunks[i]);
  }
}

/**
 * 長いメッセージを指定文字数で分割
 */
function splitMessage(text: string, maxLength: number): string[] {
  const chunks: string[] = [];
  let remaining = text;

  while (remaining.length > 0) {
    if (remaining.length <= maxLength) {
      chunks.push(remaining);
      break;
    }

    let splitPoint = remaining.lastIndexOf("\n", maxLength);
    if (splitPoint === -1 || splitPoint < maxLength / 2) {
      splitPoint = maxLength;
    }

    chunks.push(remaining.substring(0, splitPoint));
    remaining = remaining.substring(splitPoint).trimStart();
  }

  return chunks;
}

/**
 * ユーザー別のデクリプトされたDiscordトークンを取得する
 */
function getDecryptedDiscordToken(userId: string): string | null {
  const config = getUserDiscordBotConfig(userId);
  if (!config?.tokenEncrypted || !config.tokenIv || !config.tokenTag) {
    return null;
  }
  try {
    return decryptText(config.tokenEncrypted, config.tokenIv, config.tokenTag);
  } catch (err) {
    console.error(`[Discord Bot] [User: ${userId}] トークンの復号に失敗しました:`, err);
    return null;
  }
}

/**
 * ユーザーIDに紐づく独自のDiscord Botクライアントを起動する
 */
export async function startCustomBotForUser(userId: string): Promise<boolean> {
  const token = getDecryptedDiscordToken(userId);
  if (!token) return false;

  // 既存の接続があれば一度破棄
  const existing = customClients.get(userId);
  if (existing) {
    try {
      existing.destroy();
    } catch {}
    customClients.delete(userId);
  }

  const customClient = new Client({
    intents: [
      GatewayIntentBits.Guilds,
      GatewayIntentBits.GuildMessages,
      GatewayIntentBits.MessageContent,
      GatewayIntentBits.DirectMessages,
    ],
    partials: [Partials.Channel, Partials.Message],
  });

  try {
    customClient.once("clientReady", (c) => {
      console.log(`✅ 独自Bot (ユーザー: ${userId}): ${c.user.tag} としてログインしました`);
      logSystemBotEvent("info", "custom_bot_ready", { tag: c.user.tag, id: c.user.id }, userId);
      setBotStatus(customClient, "idle");
    });

    setupMessageListener(customClient, userId);
    await customClient.login(token);
    customClients.set(userId, customClient);
    return true;
  } catch (err) {
    console.error(`[Discord Bot] [User: ${userId}] 独自Botの起動に失敗しました:`, err);
    logSystemBotEvent("error", "custom_bot_start_failed", { error: serializeError(err) }, userId);
    try {
      customClient.destroy();
    } catch {}
    return false;
  }
}

/**
 * ユーザーIDに紐づく独自のDiscord Botクライアントを停止・クローズする
 */
export function stopCustomBotForUser(userId: string): void {
  const customClient = customClients.get(userId);
  if (customClient) {
    try {
      customClient.destroy();
      console.log(`🔌 独自Bot (ユーザー: ${userId}) を停止しました。`);
    } catch (err) {
      console.error(`[Discord Bot] [User: ${userId}] 独自Botの停止中にエラーが発生しました:`, err);
    }
    customClients.delete(userId);
  }
}

export async function startBot(): Promise<void> {
  pruneBotLogs();
  // 1. デフォルトBotをログイン
  setupMessageListener(client);
  await client.login(config.discordToken);

  // 2. 登録済み全ユーザーをチェックし、独自Discord Tokenが設定されている場合はそれぞれBotを起動
  const userIds = listAllUserIds();
  for (const userId of userIds) {
    await startCustomBotForUser(userId).catch((err) => {
      console.error(`[Discord Bot] ユーザー ${userId} の独自Bot起動中に例外発生:`, err);
    });
  }
}

export function stopBot(): void {
  stopReminderService();

  // デフォルトBot停止
  client.destroy();

  // 独自Bot群の停止
  for (const [userId, customClient] of customClients.entries()) {
    try {
      customClient.destroy();
      console.log(`🔌 独自Bot (ユーザー: ${userId}) を停止しました。`);
    } catch {}
  }
  customClients.clear();
}
