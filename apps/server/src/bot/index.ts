import { Bot, InlineKeyboard } from 'grammy';
import type { FastifyBaseLogger } from 'fastify';
import { langFromTelegram, type GameCategory, type GameRules, type Lang } from '@quiz-duel/shared';
import { botTexts, inviteTexts, shareTexts } from './texts.js';
import { CARD_VIDEO, cardMedia, type CardKind } from './cards.js';
import type { GameManager, InviteMaker, ResultSharer } from '../game/manager.js';
import type { UsersRepo } from '../users.js';
import type { TelegramUser } from '../auth/initData.js';

/**
 * Создаёт бота и проверяет токен (getMe). Сам опрос Telegram
 * запускается отдельно через startBot, чтобы сервер успел подняться.
 */
export async function createBot(token: string, webAppUrl: string, users?: UsersRepo) {
  const bot = new Bot(token);
  await bot.init();

  bot.command('start', async (ctx) => {
    // Нажал /start - бот может ему писать (уведомления о лобби, реванше, итогах).
    if (users && ctx.from) {
      await users.upsertFromTelegram(ctx.from as TelegramUser);
      await users.setWriteAccess(ctx.from.id, true);
    }
    const t = botTexts[langFromTelegram(ctx.from?.language_code)];
    await ctx.reply(t.start, {
      reply_markup: new InlineKeyboard().webApp(t.play, webAppUrl),
    });
  });

  // Заблокировал бота - писать больше нельзя; разблокировал - снова можно.
  bot.on('my_chat_member', async (ctx) => {
    const status = ctx.myChatMember.new_chat_member.status;
    if (!users || ctx.chat.type !== 'private') return;
    if (status === 'kicked') await users.setWriteAccess(ctx.chat.id, false);
    if (status === 'member') await users.setWriteAccess(ctx.chat.id, true);
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

/** Inline-режим подключается, когда менеджер партий уже создан. */
export function attachInline(bot: QuizBot, games: GameManager, users: UsersRepo, webAppUrl: string, log: FastifyBaseLogger) {
  bot.on('inline_query', async (ctx) => {
    try {
      const answer = await inlineAnswer(games, users, ctx.from as TelegramUser, webAppUrl);
      await ctx.answerInlineQuery(answer.results, answer.options);
    } catch (error) {
      log.warn({ err: error }, 'inline query failed');
    }
  });
}

/** Long polling. Один токен может опрашивать только один процесс. */
export function startBot(bot: QuizBot, log: FastifyBaseLogger) {
  bot.catch(({ error, ctx }) => {
    log.error({ err: error, updateId: ctx.update.update_id }, 'bot handler failed');
  });
  bot
    .start({
      drop_pending_updates: true,
      allowed_updates: ['message', 'inline_query', 'callback_query', 'my_chat_member', 'pre_checkout_query'],
      onStart: (info) => log.info({ bot: info.username }, 'bot polling started'),
    })
    .catch((error: unknown) => {
      log.error({ err: error }, 'bot polling stopped with error');
    });
}

const escapeHtml = (text: string) => text.replace(/&/g, '&amp;').replace(/</g, '&lt;').replace(/>/g, '&gt;');

/**
 * Анимированная карточка для shareMessage и inline-режима: ролик с сайта (Telegram показывает его как GIF),
 * подпись и кнопка. webAppUrl - адрес мини-аппа, ролики лежат на том же сайте.
 */
function animatedCard(webAppUrl: string, kind: CardKind, lang: Lang, card: { id: string; title: string; caption: string; button: InlineKeyboard }) {
  const media = cardMedia(webAppUrl);
  return {
    type: 'mpeg4_gif' as const,
    id: card.id,
    mpeg4_url: media.url(kind, lang),
    mpeg4_width: CARD_VIDEO.width,
    mpeg4_height: CARD_VIDEO.height,
    mpeg4_duration: CARD_VIDEO.duration,
    thumbnail_url: media.thumb(kind, lang),
    thumbnail_mime_type: 'image/jpeg' as const,
    title: card.title,
    caption: card.caption,
    parse_mode: 'HTML' as const,
    reply_markup: card.button,
  };
}

/** Карточка «Вызов на дуэль» с кнопкой «Принять» (shareMessage и inline-режим). */
export function inviteCard(input: { gameId: string; link: string; category: GameCategory; rules: GameRules; lang: Lang; creatorName: string; webAppUrl: string }) {
  const t = inviteTexts[input.lang];
  return animatedCard(input.webAppUrl, 'invite', input.lang, {
    id: `g_${input.gameId}`,
    title: `${t.title} · ${t.categories[input.category]}`,
    caption: t.body(escapeHtml(input.creatorName), t.categories[input.category], input.rules),
    button: new InlineKeyboard().url(t.accept, input.link),
  });
}

/**
 * Ответ на inline-запрос «@бот» в любом чате. Есть открытое лобби - карточка ведёт в него,
 * нет - создаётся игра «Микс». Не приняты документы или идёт партия - вместо карточки
 * кнопка «Открыть Quiz Duel» над результатами (там - документы или текущая партия).
 */
export async function inlineAnswer(
  games: Pick<GameManager, 'inlineChallenge'>,
  users: Pick<UsersRepo, 'upsertFromTelegram'>,
  from: TelegramUser,
  webAppUrl: string,
) {
  const lang = langFromTelegram(from.language_code);
  const t = inviteTexts[lang];
  // Inline-запрос может прийти от того, кто ещё ни разу не открывал игру.
  const user = await users.upsertFromTelegram(from);
  const res = await games.inlineChallenge(from.id);
  const options: { cache_time: number; is_personal: boolean; button?: { text: string; web_app: { url: string } } } = {
    cache_time: 0,
    is_personal: true,
  };
  if (!res.ok) {
    const text = res.error === 'consent_required' ? t.inlineConsent : res.error === 'busy' ? t.inlineBusy : t.inlineOpen;
    return { results: [], options: { ...options, button: { text, web_app: { url: webAppUrl } } } };
  }
  const card = inviteCard({ gameId: res.gameId, link: res.link, category: res.category, rules: res.rules, lang, creatorName: user.firstName, webAppUrl });
  return { results: [card], options };
}

/**
 * Подготовленное сообщение для shareMessage: игрок выбирает чат, туда уходит карточка
 * «Вызов на дуэль» с кнопкой «Принять» - она открывает мини-апп сразу в этой игре.
 */
export function botInvites(bot: QuizBot, webAppUrl: string): InviteMaker {
  return {
    async prepare({ userId, gameId, link, category, rules, lang, creatorName }) {
      const prepared = await bot.api.savePreparedInlineMessage(
        userId,
        inviteCard({ gameId, link, category, rules, lang, creatorName, webAppUrl }),
        { allow_user_chats: true, allow_group_chats: true, allow_channel_chats: true },
      );
      return { id: prepared.id, expiresAt: prepared.expiration_date * 1000 };
    },
  };
}

/** Карточка результата для shareMessage: ролик «Победа!» / «Почти!» / «Ничья!», счёт и кнопка «Сыграть со мной». */
export function resultCard(input: {
  gameId: string;
  lang: Lang;
  outcome: 'win' | 'loss' | 'draw';
  me: number;
  opp: number;
  opponent: string;
  link: string;
  webAppUrl: string;
}) {
  const t = shareTexts[input.lang];
  return animatedCard(input.webAppUrl, input.outcome, input.lang, {
    id: `r_${input.gameId}`,
    title: t.title,
    caption: t.body(input.outcome, input.me, input.opp, input.opponent),
    button: new InlineKeyboard().url(t.play, input.link),
  });
}

export function botResults(bot: QuizBot, webAppUrl: string): ResultSharer {
  return {
    async prepare({ userId, ...rest }) {
      const prepared = await bot.api.savePreparedInlineMessage(userId, resultCard({ ...rest, webAppUrl }), {
        allow_user_chats: true,
        allow_group_chats: true,
        allow_channel_chats: true,
      });
      return { id: prepared.id, expiresAt: prepared.expiration_date * 1000 };
    },
  };
}
