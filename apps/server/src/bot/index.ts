import { Bot, InlineKeyboard } from 'grammy';
import type { FastifyBaseLogger } from 'fastify';
import { langFromTelegram } from '@quiz-duel/shared';
import { botTexts, inviteTexts } from './texts.js';
import type { InviteMaker } from '../game/manager.js';

/**
 * Создаёт бота и проверяет токен (getMe). Сам опрос Telegram
 * запускается отдельно через startBot, чтобы сервер успел подняться.
 */
export async function createBot(token: string, webAppUrl: string) {
  const bot = new Bot(token);
  await bot.init();

  bot.command('start', async (ctx) => {
    const t = botTexts[langFromTelegram(ctx.from?.language_code)];
    await ctx.reply(t.start, {
      reply_markup: new InlineKeyboard().webApp(t.play, webAppUrl),
    });
  });

  return bot;
}

export type QuizBot = Awaited<ReturnType<typeof createBot>>;

/** Кнопка меню и команды. Ошибка здесь не мешает игре, поэтому только пишем в лог. */
export async function configureBot(bot: QuizBot, webAppUrl: string, log: FastifyBaseLogger) {
  try {
    await bot.api.setChatMenuButton({
      menu_button: { type: 'web_app', text: 'Quiz Duel', web_app: { url: webAppUrl } },
    });
    await bot.api.setMyCommands([{ command: 'start', description: botTexts.en.startCommand }]);
    await bot.api.setMyCommands([{ command: 'start', description: botTexts.ru.startCommand }], {
      language_code: 'ru',
    });
  } catch (error) {
    log.warn({ err: error }, 'bot configuration failed');
  }
}

/** Long polling. Один токен может опрашивать только один процесс. */
export function startBot(bot: QuizBot, log: FastifyBaseLogger) {
  bot.catch(({ error, ctx }) => {
    log.error({ err: error, updateId: ctx.update.update_id }, 'bot handler failed');
  });
  bot
    .start({
      drop_pending_updates: true,
      allowed_updates: ['message', 'inline_query', 'callback_query'],
      onStart: (info) => log.info({ bot: info.username }, 'bot polling started'),
    })
    .catch((error: unknown) => {
      log.error({ err: error }, 'bot polling stopped with error');
    });
}

const escapeHtml = (text: string) => text.replace(/&/g, '&amp;').replace(/</g, '&lt;').replace(/>/g, '&gt;');

/**
 * Подготовленное сообщение для shareMessage: игрок выбирает чат, туда уходит карточка
 * «Вызов на дуэль» с кнопкой «Принять» - она открывает мини-апп сразу в этой игре.
 */
export function botInvites(bot: QuizBot): InviteMaker {
  return {
    async prepare({ userId, gameId, link, category, lang, creatorName }) {
      const t = inviteTexts[lang];
      const prepared = await bot.api.savePreparedInlineMessage(
        userId,
        {
          type: 'article',
          id: `g_${gameId}`,
          title: t.title,
          description: t.description,
          input_message_content: {
            message_text: t.body(escapeHtml(creatorName), t.categories[category]),
            parse_mode: 'HTML',
            link_preview_options: { is_disabled: true },
          },
          reply_markup: new InlineKeyboard().url(t.accept, link),
        },
        { allow_user_chats: true, allow_group_chats: true, allow_channel_chats: true },
      );
      return { id: prepared.id, expiresAt: prepared.expiration_date * 1000 };
    },
  };
}
