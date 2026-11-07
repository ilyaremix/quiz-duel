import { Bot, InlineKeyboard, type Transformer } from 'grammy';
import type { LanguageCode } from 'grammy/types';
import { autoRetry } from '@grammyjs/auto-retry';
import type { FastifyBaseLogger } from 'fastify';
import { RU_LANGUAGE_CODES, langFromTelegram, resolveLang, type GameCategory, type GameRules, type Lang } from '@quiz-duel/shared';
import { botTexts, inviteTexts, profileTexts, referralTexts, shareTexts, supportTexts } from './texts.js';
import { CARD_VIDEO, cardMedia, type CardKind } from './cards.js';
import type { GameManager, InviteMaker, ResultSharer } from '../game/manager.js';
import type { UsersRepo } from '../users.js';
import type { TelegramUser } from '../auth/initData.js';

/** Состояние опроса Telegram - для /api/health. */
export interface BotHealth {
  /** starting - сервер только поднимается; polling - бот получает обновления; restarting - опрос упал и сейчас перезапускается. */
  state: 'starting' | 'polling' | 'restarting';
  /** Сколько раз опрос перезапускался после сбоя с момента старта сервера. */
  restarts: number;
  /** Когда пришло последнее обновление от Telegram (null - ещё ни одного). */
  lastUpdateAt: number | null;
}

const pollState: BotHealth = { state: 'starting', restarts: 0, lastUpdateAt: null };
export const botHealth = (): BotHealth => ({ ...pollState });

/**
 * Повтор запросов к Telegram: «слишком часто» (429) - после retry_after (если он не больше 15 с),
 * сбой на стороне Telegram (5xx) - через 3, 6, 12 с; не больше 3 повторов. Сетевые ошибки не
 * повторяем (иначе при долгом обрыве запрос висел бы часами), getUpdates - тоже: у опроса свой
 * перезапуск (startBot), и остановка сервера не должна ждать повторов.
 */
export function telegramRetry(): Transformer {
  const retry = autoRetry({ maxRetryAttempts: 3, maxDelaySeconds: 15, rethrowHttpErrors: true });
  return (prev, method, payload, signal) => (method === 'getUpdates' ? prev(method, payload, signal) : retry(prev, method, payload, signal));
}

/**
 * Создаёт бота и проверяет токен (getMe). Сам опрос Telegram
 * запускается отдельно через startBot, чтобы сервер успел подняться.
 */
export async function createBot(token: string, webAppUrl: string, users?: UsersRepo, docs?: { termsUrl: string; privacyUrl: string }) {
  const bot = new Bot(token);
  bot.api.config.use(telegramRetry());
  await bot.init();

  // Первым - отметка «бот жив»: время последнего обновления от Telegram видно в /api/health.
  bot.use(async (_ctx, next) => {
    pollState.lastUpdateAt = Date.now();
    await next();
  });

  // Язык ответа - выбранный в приложении (Настройки → Язык), а если там «Авто» - язык Telegram.
  const langOf = async (from: TelegramUser | undefined): Promise<Lang> => {
    if (!from) return 'en';
    if (!users) return langFromTelegram(from.language_code);
    const target = await users.alertTarget(from.id).catch(() => null);
    return target?.lang ?? langFromTelegram(from.language_code);
  };

  bot.command('start', async (ctx) => {
    // Нажал /start - бот может ему писать (уведомления о лобби, реванше, итогах).
    if (users && ctx.from) {
      const user = await users.upsertFromTelegram(ctx.from as TelegramUser, 'bot');
      await users.setWriteAccess(ctx.from.id, true);
      // Меню команд в этом чате - на языке из настроек приложения.
      void syncChatCommands(bot, ctx.from.id, user.language === 'auto' ? null : resolveLang(user.language, user.tgLanguage));
    }
    const t = botTexts[await langOf(ctx.from as TelegramUser)];
    await ctx.reply(t.start, {
      reply_markup: new InlineKeyboard().webApp(t.play, webAppUrl),
    });
  });

  // Помощь с оплатой звёздами: Telegram требует, чтобы бот отвечал на /paysupport.
  bot.command('paysupport', async (ctx) => {
    await ctx.reply(supportTexts[await langOf(ctx.from as TelegramUser)].pay, { link_preview_options: { is_disabled: true } });
  });

  // Правила и политика - те же страницы, что в приложении.
  bot.command('terms', async (ctx) => {
    const t = supportTexts[await langOf(ctx.from as TelegramUser)];
    if (!docs) return;
    await ctx.reply(t.terms, {
      reply_markup: new InlineKeyboard().url(t.termsButton, docs.termsUrl).row().url(t.privacyButton, docs.privacyUrl),
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

/** Команды меню бота на языке. */
export const botCommands = (lang: Lang) => [
  { command: 'start', description: botTexts[lang].startCommand },
  { command: 'paysupport', description: supportTexts[lang].payCommand },
  { command: 'terms', description: supportTexts[lang].termsCommand },
];

/**
 * Меню команд в личном чате с игроком - на языке из настроек приложения. null («Авто») -
 * своё меню чата снимается, Telegram показывает общее по языку клиента. Сбой (игрок не нажимал
 * /start) не важен: меню - мелочь, сообщения бота и так идут на нужном языке.
 */
export async function syncChatCommands(bot: Pick<QuizBot, 'api'>, chatId: number, lang: Lang | null) {
  const scope = { type: 'chat' as const, chat_id: chatId };
  try {
    if (lang) await bot.api.setMyCommands(botCommands(lang), { scope });
    else await bot.api.deleteMyCommands({ scope });
  } catch {
    // нет чата с ботом - нечего настраивать
  }
}

/** Кнопка меню и команды. Ошибка здесь не мешает игре, поэтому только пишем в лог. */
export async function configureBot(bot: QuizBot, webAppUrl: string, log: FastifyBaseLogger) {
  try {
    await bot.api.setChatMenuButton({
      menu_button: { type: 'web_app', text: 'Quiz Duel', web_app: { url: webAppUrl } },
    });
    await bot.api.setMyCommands(botCommands('en'));
    await bot.api.setMyDescription(profileTexts.en.description(bot.botInfo.username));
    await bot.api.setMyShortDescription(profileTexts.en.shortDescription);
    // Русский - для тех же кодов Telegram, что и в мини-аппе (ru, uk, be, kk).
    for (const language_code of RU_LANGUAGE_CODES as readonly LanguageCode[]) {
      await bot.api.setMyCommands(botCommands('ru'), { language_code });
      await bot.api.setMyDescription(profileTexts.ru.description(bot.botInfo.username), { language_code });
      await bot.api.setMyShortDescription(profileTexts.ru.shortDescription, { language_code });
    }
  } catch (error) {
    log.warn({ err: error }, 'bot configuration failed');
  }
}

/** Что сломалось в боте - пишем владельцу (не чаще раза в полчаса на каждый вид сбоя). */
export type BotTrouble = (kind: 'polling' | 'inline', detail: string) => void;

/**
 * Inline-режим подключается, когда менеджер партий уже создан.
 * Обработчик не держит общую очередь обновлений бота: Telegram шлёт запрос на каждую букву,
 * а медленный ответ (сеть, база) не должен задерживать /start, оплату и остальное.
 * Запросы одного игрока идут строго по очереди - иначе два запроса подряд создали бы две игры.
 * Telegram не принял анимированную карточку - отвечаем той же карточкой текстом.
 */
export function attachInline(bot: QuizBot, games: GameManager, users: UsersRepo, webAppUrl: string, log: FastifyBaseLogger, trouble?: BotTrouble) {
  const queue = new Map<number, Promise<void>>();
  bot.on('inline_query', (ctx) => {
    const from = ctx.from as TelegramUser;
    const run = async () => {
      const answer = await inlineAnswer(games, users, from, webAppUrl);
      try {
        await ctx.answerInlineQuery(answer.results, answer.options);
      } catch (error) {
        if (isStaleQuery(error) || answer.fallback.length === 0) throw error;
        log.warn({ err: error }, 'inline card rejected, answering with text');
        trouble?.('inline', describe(error));
        await ctx.answerInlineQuery(answer.fallback, answer.options);
      }
    };
    const prev = queue.get(from.id) ?? Promise.resolve();
    const job = prev
      .then(run)
      .catch((error: unknown) => {
        if (isStaleQuery(error)) return;
        log.warn({ err: error }, 'inline query failed');
        trouble?.('inline', describe(error));
      })
      .finally(() => {
        if (queue.get(from.id) === job) queue.delete(from.id);
      });
    queue.set(from.id, job);
  });
}

/** Игрок уже печатает дальше - Telegram закрыл старый запрос («query is too old»). Это не сбой. */
const isStaleQuery = (error: unknown) => /query is too old|query ID is invalid/i.test(describe(error));
const describe = (error: unknown) => (error instanceof Error ? error.message : String(error)).slice(0, 300);

const ALLOWED_UPDATES = ['message', 'inline_query', 'callback_query', 'my_chat_member', 'pre_checkout_query'] as const;

/**
 * Long polling. Один токен может опрашивать только один процесс.
 * grammY бросает опрос насовсем при 409 (на секунду встретились два процесса - старый
 * контейнер при выкатке) и при сбое сети в момент старта. Тогда бот молчал до следующей
 * выкатки: не отвечал на inline-запросы, /start и оплату. Теперь опрос перезапускается сам:
 * через 2, 4, 8… секунд (не дольше минуты), владельцу приходит сообщение о сбое.
 */
export function startBot(bot: QuizBot, log: FastifyBaseLogger, trouble?: BotTrouble, sleep = (ms: number) => new Promise((r) => setTimeout(r, ms))) {
  bot.catch(({ error, ctx }) => {
    log.error({ err: error, updateId: ctx.update.update_id }, 'bot handler failed');
  });
  let stopped = false;
  let failures = 0;
  const loop = async () => {
    for (let first = true; !stopped; first = false) {
      try {
        await bot.start({
          // Старые обновления выбрасываем только при запуске сервера, при перезапуске опроса - нет.
          drop_pending_updates: first,
          allowed_updates: [...ALLOWED_UPDATES],
          onStart: (info) => {
            pollState.state = 'polling';
            failures = 0;
            log.info({ bot: info.username, restarts: pollState.restarts }, 'bot polling started');
          },
        });
        // start() вернулся без ошибки - значит, бота остановили (выкатка).
        if (stopped) return;
      } catch (error) {
        if (stopped) return;
        log.error({ err: error }, 'bot polling stopped with error, restarting');
        trouble?.('polling', describe(error));
      }
      pollState.state = 'restarting';
      pollState.restarts += 1;
      failures += 1;
      await sleep(Math.min(60_000, 1_000 * 2 ** Math.min(failures, 6)));
    }
  };
  void loop();
  return {
    async stop() {
      stopped = true;
      await bot.stop();
    },
  };
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
  // Inline-запрос может прийти от того, кто ещё ни разу не открывал игру. Фото в нём нет - его не трогаем.
  const user = await users.upsertFromTelegram(from, 'bot');
  // Язык карточки - из настроек приложения (там «Авто» - язык Telegram).
  const lang = resolveLang(user.language, user.tgLanguage);
  const t = inviteTexts[lang];
  const res = await games.inlineChallenge(from.id);
  const options: { cache_time: number; is_personal: boolean; button?: { text: string; web_app: { url: string } } } = {
    cache_time: 0,
    is_personal: true,
  };
  if (!res.ok) {
    const text = res.error === 'consent_required' ? t.inlineConsent : res.error === 'busy' ? t.inlineBusy : t.inlineOpen;
    return { results: [], fallback: [], options: { ...options, button: { text, web_app: { url: webAppUrl } } } };
  }
  const input = { gameId: res.gameId, link: res.link, category: res.category, rules: res.rules, lang, creatorName: user.firstName, webAppUrl };
  return { results: [inviteCard(input)], fallback: [inviteArticle(input)], options };
}

/**
 * Та же карточка «Вызов на дуэль» строкой списка: обложка, название, правила; в чат уходит
 * текст с кнопкой «Принять». Запасной вариант, если Telegram не принял ролик.
 */
export function inviteArticle(input: { gameId: string; link: string; category: GameCategory; rules: GameRules; lang: Lang; creatorName: string; webAppUrl: string }) {
  const t = inviteTexts[input.lang];
  return {
    type: 'article' as const,
    id: `t_${input.gameId}`,
    title: `⚔️ ${t.title} · ${t.categories[input.category]}`,
    description: t.rules(t.categories[input.category], input.rules),
    thumbnail_url: cardMedia(input.webAppUrl).thumb('invite', input.lang),
    thumbnail_width: CARD_VIDEO.width,
    thumbnail_height: CARD_VIDEO.height,
    input_message_content: {
      message_text: t.body(escapeHtml(input.creatorName), t.categories[input.category], input.rules),
      parse_mode: 'HTML' as const,
      link_preview_options: { is_disabled: true },
    },
    reply_markup: new InlineKeyboard().url(t.accept, input.link),
  };
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

/** Карточка «Сыграем в Quiz Duel?» для «Пригласить друга»: ролик, кто зовёт, бонус и кнопка «Играть». */
export function referralCard(input: { lang: Lang; name: string; link: string; webAppUrl: string }) {
  const t = referralTexts[input.lang];
  return animatedCard(input.webAppUrl, 'join', input.lang, {
    id: 'ref',
    title: t.title,
    caption: t.body(escapeHtml(input.name)),
    button: new InlineKeyboard().url(t.play, input.link),
  });
}

export interface ReferralMaker {
  prepare(input: { userId: number; lang: Lang; name: string; link: string }): Promise<{ id: string; expiresAt: number }>;
}

export function botReferrals(bot: QuizBot, webAppUrl: string): ReferralMaker {
  return {
    async prepare({ userId, ...rest }) {
      const prepared = await bot.api.savePreparedInlineMessage(userId, referralCard({ ...rest, webAppUrl }), {
        allow_user_chats: true,
        allow_group_chats: true,
        allow_channel_chats: true,
      });
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
