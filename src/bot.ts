import { GoogleGenerativeAI } from "@google/generative-ai";
import { ActivityType, Client, GatewayIntentBits, type Message, Partials } from "discord.js";
import { config } from "./config.js";
import { addBotLog, type BotLogLevel, pruneBotLogs } from "./db/botLogRepo.js";
import { isRegisteredUser } from "./db/userRepo.js";
import { resolveApiKeyForUser, resolveModelForUser } from "./gemini/retry.js";
import { type ChatMessage, processMessage } from "./gemini.js";
import { buildSystemInstruction } from "./gemini/systemInstruction.js";
import { parseReceipt } from "./services/receiptParser.js";
import { startReminderService, stopReminderService } from "./services/reminderService.js";

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

export function getBotClientForUser(_userId: string): Client {
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

let mainBotClientId: string | null = null;

export function getMainBotInviteUrl(): string | null {
  if (!mainBotClientId) return null;
  const permissions = 68672; // Send Messages + Add Reactions + Read Message History + View Channels
  return `https://discord.com/oauth2/authorize?client_id=${mainBotClientId}&permissions=${permissions}&scope=bot`;
}

client.once("clientReady", (c) => {
  mainBotClientId = c.user.id;
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
        const systemInstruction = await buildSystemInstruction(userId);
        logBotEvent("debug", "prompt_text", message, {
          prompt: fullText.slice(0, 500),
          systemInstruction: systemInstruction.slice(0, 500),
          model: resolveModelForUser(userId),
        });
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
      logBotEvent("info", "response_sent", message, {
        responseLength: response.length,
        response: response.slice(0, 500),
      });
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
  const userId = message.author.id;
  const apiKey = resolveApiKeyForUser(userId);
  if (!apiKey) {
    logBotEvent("debug", "reaction_skipped_no_gemini_key", message);
    return;
  }
  try {
    const genAI = new GoogleGenerativeAI(apiKey);
    const model = genAI.getGenerativeModel({
      model: config.reactionModel,
    });
    const textPrompt =
      `あなたは「早瀬ユウカ」です。ミレニアムサイエンススクールの生徒会会計で、冷静・論理的・世話焼きな性格です。` +
      `先生（ユーザー）を信頼しており、呆れながらも温かく見守っています。照れやすく、感情は豊かですが理性的に振る舞います。\n\n` +
      `以下の先生のメッセージを読んで、ユウカとしての反応を表すUnicode絵文字を**1〜3文字**で返してください。\n` +
      `絵文字以外は絶対に出力しないでください。スペースや改行も不要です。\n\n` +
      `【必須ルール】原則として「感情の絵文字」と「内容の絵文字」を**両方**組み合わせること。数は1〜3個自由。\n\n` +
      `【感情の絵文字（必ず1つ選ぶ）】\n` +
      `- 嬉しい・頼りにされた → 😊 💙 🌸\n` +
      `- 照れ・誤魔化し → 😳 🙈\n` +
      `- 心配・不安 → 😟 💦\n` +
      `- 納得・仕事モード → ✅ 💡\n` +
      `- 静かに見守る → 💭 👁️\n` +
      `- 呆れ・ため息（多用禁止） → 😮‍💨 🫤\n` +
      `- 怒り（滅多に使わない） → 😤 ⚡\n\n` +
      `【内容の絵文字（話題に合わせて必ず1つ選ぶ）】\n` +
      `- 飲み物・カフェ → ☕ 🧋 🥤\n` +
      `- 食事・料理 → 🍽️ 🍜 🍱\n` +
      `- 勉強・学業 → ✏️ 📚 🎓\n` +
      `- 仕事・作業 → 💼 🖥️ ⌨️\n` +
      `- 睡眠・疲れ → 🛌 💤\n` +
      `- 運動・外出 → 🏃 🚶\n` +
      `- ゲーム・娯楽 → 🎮 🎲\n` +
      `- 音楽 → 🎵 🎧\n` +
      `- お金・買い物 → 💰 🛍️\n` +
      `- 天気・自然 → ☀️ 🌧️ 🌙\n` +
      `- 会話・日常（上記に当てはまらない時） → 💬 📝 🗒️\n\n` +
      `例: 勉強してると言われたら → ✏️😊 / 疲れたと言われたら → 🛌💦 / コーヒー飲んでると言われたら → ☕💙\n\n` +
      `先生のメッセージ: "${message.content.slice(0, 200)}"`;

    // 画像添付があればインラインデータとして渡す
    const imageAttachments = [...message.attachments.values()].filter((a) =>
      a.contentType?.startsWith("image/"),
    );
    const imageParts = await Promise.all(
      imageAttachments.slice(0, 3).map(async (a) => {
        const res = await fetch(a.url);
        const buf = await res.arrayBuffer();
        return {
          inlineData: {
            mimeType: a.contentType as string,
            data: Buffer.from(buf).toString("base64"),
          },
        };
      }),
    );

    const result = await model.generateContent([textPrompt, ...imageParts]);
    const raw = result.response.text().trim().replace(/\s/g, "");
    // 絵文字を1文字ずつ分割（サロゲートペア・異体字セレクタ・ZWJ対応）
    const emojis = [...new Intl.Segmenter("ja", { granularity: "grapheme" }).segment(raw)]
      .map((s) => s.segment)
      .filter((s) => s.trim())
      .slice(0, 3);
    logBotEvent("debug", "reaction_attempt", message, { emojis: emojis.join(""), prompt });
    for (const emoji of emojis) {
      await message.react(emoji).catch((error: unknown) => {
        logBotEvent("warn", "reaction_emoji_failed", message, {
          emoji,
          error: serializeError(error),
        });
      });
    }
    if (emojis.length > 0) {
      logBotEvent("debug", "reaction_added", message, { emojis: emojis.join("") });
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

export async function startBot(): Promise<void> {
  pruneBotLogs();
  setupMessageListener(client);
  await client.login(config.discordToken);
}

export function stopBot(): void {
  stopReminderService();
  client.destroy();
}
