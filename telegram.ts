// Official Winner Bingo Telegram Bot & Web App Credentials
const LEGACY_TOKEN = '8918807909:AAHgfsI8jU7YBR2M0-cX-RogAoVrJmYrnTo';
const envToken = (process.env.TELEGRAM_BOT_TOKEN || '').trim();

export const TELEGRAM_BOT_TOKEN =
  envToken && envToken !== LEGACY_TOKEN
    ? envToken
    : '8933057222:AAHnev0WogIdW9jWe-TrmSjJmtTnt0GHU2A';

export const TELEGRAM_BOT_USERNAME =
  (process.env.TELEGRAM_BOT_USERNAME || process.env.NEXT_PUBLIC_TELEGRAM_BOT_USERNAME || '')
    .trim()
    .replace(/^@/, '') || 'Winners_bingo_bot';

export const TELEGRAM_WEBAPP_URL =
  (process.env.TELEGRAM_WEBAPP_URL || process.env.NEXT_PUBLIC_TELEGRAM_WEBAPP_URL || '').trim() ||
  'https://winner-bingo.ai.studio';

export const TELEGRAM_MENU_BUTTON_TEXT = 'Play Bingo 🎲';

// Deduplication & state maps
const recentLoginMessageSentAt = new Map<string, number>();
const processedCommandMessageIds = new Set<string>();
let lastConfiguredAt = 0;

/**
 * Programmatically configures the Telegram Bot Menu Button ("Play Bingo 🎲" -> https://winner-bingo.ai.studio)
 * and registers the bot's /start and /play commands.
 */
export async function configureTelegramBotIntegration(chatId?: string | number) {
  const botToken = TELEGRAM_BOT_TOKEN;
  const baseUrl = `https://api.telegram.org/bot${botToken}`;

  try {
    // 1. Set global (or chat-specific) Menu Button to open the Web App
    const menuPayload: Record<string, any> = {
      menu_button: {
        type: 'web_app',
        text: TELEGRAM_MENU_BUTTON_TEXT,
        web_app: {
          url: TELEGRAM_WEBAPP_URL,
        },
      },
    };
    if (chatId) {
      menuPayload.chat_id = chatId;
    }

    const menuRes = await fetch(`${baseUrl}/setChatMenuButton`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify(menuPayload),
    });
    const menuData = await menuRes.json().catch(() => ({}));

    // 2. Register Bot Commands (/start, /play, /help) if not configured recently
    let commandsData: any = { ok: true, skipped: true };
    const now = Date.now();
    if (now - lastConfiguredAt > 60_000) {
      lastConfiguredAt = now;
      const cmdRes = await fetch(`${baseUrl}/setMyCommands`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          commands: [
            {
              command: 'start',
              description: 'Start Winner Bingo & Open Web App 🎲',
            },
            {
              command: 'play',
              description: 'Play Bingo 🎲 (Launch Mini App)',
            },
            {
              command: 'help',
              description: 'How to play & deposit in Winner Bingo',
            },
          ],
        }),
      });
      commandsData = await cmdRes.json().catch(() => ({}));
    }

    return {
      ok: Boolean(menuRes.ok && menuData?.ok),
      botUsername: `@${TELEGRAM_BOT_USERNAME}`,
      webAppUrl: TELEGRAM_WEBAPP_URL,
      menuButtonText: TELEGRAM_MENU_BUTTON_TEXT,
      menuResult: menuData,
      commandsResult: commandsData,
    };
  } catch (err: any) {
    return {
      ok: false,
      error: err?.message || 'Failed to configure Telegram menu button.',
    };
  }
}

/**
 * Handles a single Telegram Update object (from Webhook or getUpdates polling)
 * and responds to /start, /play, or /help commands with a welcome message and
 * the "Play Bingo 🎲" Web App launch button.
 */
export async function handleTelegramCommandUpdate(update: any) {
  const msg = update?.message || update?.edited_message;
  const chat = msg?.chat;
  const text = typeof msg?.text === 'string' ? msg.text.trim() : '';

  if (!chat?.id || !text) {
    return { handled: false };
  }

  const dedupeId = `${chat.id}:${msg.message_id}`;
  if (processedCommandMessageIds.has(dedupeId)) {
    return { handled: false, deduplicated: true };
  }

  const lowerText = text.toLowerCase();
  const isStart = lowerText.startsWith('/start') || lowerText.startsWith('/play');
  const isHelp = lowerText.startsWith('/help');

  if (!isStart && !isHelp) {
    return { handled: false };
  }

  processedCommandMessageIds.add(dedupeId);

  const displayName =
    [chat.first_name, chat.last_name].filter(Boolean).join(' ').trim() ||
    chat.username ||
    'ተጫዋች';

  // Ensure this user's chat menu button is also explicitly set to "Play Bingo 🎲"
  await configureTelegramBotIntegration(chat.id).catch(() => {});

  const replyText = isHelp
    ? `🎲 <b>Winner Bingo (@${TELEGRAM_BOT_USERNAME}) እገዛ</b>\n\n` +
      `• ጨዋታውን ለመጀመር ከታች ያለውን <b>"${TELEGRAM_MENU_BUTTON_TEXT}"</b> የሚለውን ቁልፍ ይጫኑ።\n` +
      `• አዲስ አካውንት ሲከፍቱ የ <b>20.00 ብር ነፃ ቦነስ</b> ወዲያውኑ ያገኛሉ!\n` +
      `• በቴሌብር (Telebirr) ወይም በ CBE በቀላሉ ገቢ እና ወጪ ማድረግ ይችላሉ።`
    : `🎉 <b>ሰላም ${displayName}! እንኳን ወደ Winner Bingo በደህና መጡ!</b>\n\n` +
      `🎲 በቀጥታ የ75-ኳስ ቢንጎ ጨዋታ ለመጫወት እና ለማሸነፍ ከታች ያለውን <b>"${TELEGRAM_MENU_BUTTON_TEXT}"</b> ቁልፍ ወይም የሜኑ ቁልፉን ይጫኑ!\n\n` +
      `🎁 <i>አዲስ ተመዝጋቢ ከሆኑ 20.00 ብር ነፃ መጫወቻ ቦነስ ወዲያውኑ ወደ ዋሌትዎ ይገባል!</i>`;

  const sendUrl = `https://api.telegram.org/bot${TELEGRAM_BOT_TOKEN}/sendMessage`;
  const res = await fetch(sendUrl, {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({
      chat_id: chat.id,
      text: replyText,
      parse_mode: 'HTML',
      reply_markup: {
        inline_keyboard: [
          [
            {
              text: TELEGRAM_MENU_BUTTON_TEXT,
              web_app: { url: TELEGRAM_WEBAPP_URL },
            },
          ],
        ],
      },
    }),
  });

  const data = await res.json().catch(() => ({}));
  return {
    handled: true,
    chatId: chat.id,
    command: text,
    ok: Boolean(res.ok && data?.ok),
    response: data,
  };
}

/**
 * Polls recent updates from Telegram Bot API and responds to any recent /start, /play, or /help
 * commands sent within the last 5 minutes, while keeping the history available for chat ID resolution.
 */
export async function pollAndProcessTelegramBotCommands() {
  try {
    const res = await fetch(
      `https://api.telegram.org/bot${TELEGRAM_BOT_TOKEN}/getUpdates?limit=50`,
      {
        method: 'GET',
        cache: 'no-store',
      }
    );
    if (!res.ok) return { ok: false, processed: 0 };
    const data = await res.json();
    if (!data?.ok || !Array.isArray(data.result)) {
      return { ok: false, processed: 0 };
    }

    const nowSec = Math.floor(Date.now() / 1000);
    let processedCount = 0;

    for (const update of data.result) {
      const msg = update?.message || update?.edited_message;
      const msgDate = Number(msg?.date || 0);
      // Reply to commands sent within the last 10 minutes that haven't been replied to in this runtime
      if (msgDate > 0 && nowSec - msgDate <= 600) {
        const result = await handleTelegramCommandUpdate(update);
        if (result.handled && result.ok) {
          processedCount++;
        }
      }
    }

    return { ok: true, processed: processedCount, totalUpdates: data.result.length };
  } catch (err: any) {
    return { ok: false, processed: 0, error: err?.message };
  }
}

/**
 * Resolves target Telegram chat ID(s) from recent bot updates (/start messages)
 * when no explicit chatId is passed.
 */
async function resolveDynamicChatIds(
  botToken: string,
  username?: string
): Promise<Array<string | number>> {
  try {
    const res = await fetch(`https://api.telegram.org/bot${botToken}/getUpdates?limit=100`, {
      method: 'GET',
      cache: 'no-store',
    });
    if (!res.ok) return [];
    const data = await res.json();
    if (!data?.ok || !Array.isArray(data.result) || data.result.length === 0) {
      return [];
    }

    const normalizedTarget = (username || '').trim().toLowerCase();
    const matchedIds = new Set<string | number>();
    const allRecentChatIds = new Set<string | number>();

    // Search newest updates first
    for (let i = data.result.length - 1; i >= 0; i--) {
      const update = data.result[i];
      const msg =
        update?.message ||
        update?.edited_message ||
        update?.callback_query?.message ||
        update?.my_chat_member;
      const chat = msg?.chat;
      if (!chat?.id) continue;

      allRecentChatIds.add(chat.id);

      if (normalizedTarget) {
        const tgUsername = (chat.username || '').toLowerCase();
        const tgFullName = [chat.first_name, chat.last_name]
          .filter(Boolean)
          .join(' ')
          .trim()
          .toLowerCase();
        const tgFirstName = (chat.first_name || '').toLowerCase();

        if (
          tgUsername === normalizedTarget ||
          tgFullName === normalizedTarget ||
          tgFirstName === normalizedTarget ||
          (tgFullName && normalizedTarget.includes(tgFullName)) ||
          (tgFirstName && normalizedTarget.includes(tgFirstName))
        ) {
          matchedIds.add(chat.id);
        }
      }
    }

    if (matchedIds.size > 0) {
      return Array.from(matchedIds);
    }

    // Fallback to the most recent active chat(s) that messaged the bot
    return Array.from(allRecentChatIds).slice(0, 5);
  } catch {
    return [];
  }
}

export async function sendTelegramWelcomeNotification(params: {
  username: string;
  chatId?: string | number | null;
  message?: string;
}) {
  const botToken = TELEGRAM_BOT_TOKEN;
  const username = String(params.username || 'ተጫዋች').trim();
  const dedupeKey = username.toLowerCase();
  const now = Date.now();
  const lastSent = recentLoginMessageSentAt.get(dedupeKey) || 0;

  // Ensure the bot menu button is configured whenever a user logs in
  configureTelegramBotIntegration().catch(() => {});

  if (now - lastSent < 8000) {
    return {
      ok: true,
      deduplicated: true,
      message: 'Welcome message already sent for this login.',
    };
  }

  const text =
    (params.message ? params.message.trim() : '') ||
    `ሰላም ${username}! እንኳን ወደ Winner Bingo በደህና መጣህ/ሽ!`;

  const explicitChatId =
    (params.chatId ? String(params.chatId).trim() : '') ||
    (process.env.TELEGRAM_CHAT_ID ? process.env.TELEGRAM_CHAT_ID.trim() : '');

  const targetChatIds: Array<string | number> = explicitChatId
    ? [explicitChatId]
    : await resolveDynamicChatIds(botToken, username);

  if (targetChatIds.length === 0) {
    return {
      ok: false,
      configured: true,
      botUsername: `@${TELEGRAM_BOT_USERNAME}`,
      webAppUrl: TELEGRAM_WEBAPP_URL,
      error: `No active Telegram chat found yet. Please open @${TELEGRAM_BOT_USERNAME} on Telegram and press Start (/start) once so the bot can message you.`,
    };
  }

  recentLoginMessageSentAt.set(dedupeKey, now);

  const telegramUrl = `https://api.telegram.org/bot${botToken}/sendMessage`;
  const results = [];

  for (const chatId of targetChatIds) {
    const tgRes = await fetch(telegramUrl, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({
        chat_id: chatId,
        text,
        parse_mode: 'HTML',
        reply_markup: {
          inline_keyboard: [
            [
              {
                text: TELEGRAM_MENU_BUTTON_TEXT,
                web_app: { url: TELEGRAM_WEBAPP_URL },
              },
            ],
          ],
        },
      }),
    });
    const tgData = await tgRes.json().catch(() => ({}));
    results.push({ chatId, ok: Boolean(tgRes.ok && tgData?.ok), response: tgData });
  }

  const anySuccess = results.some((r) => r.ok);
  return {
    ok: anySuccess,
    configured: true,
    botUsername: `@${TELEGRAM_BOT_USERNAME}`,
    webAppUrl: TELEGRAM_WEBAPP_URL,
    chatIds: targetChatIds,
    message: text,
    results,
  };
}
