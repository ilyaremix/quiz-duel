import type { FastifyBaseLogger } from 'fastify';
import { adminIdsOf, loadEnv, webOrigin } from './env.js';
import { createPrisma } from './db.js';
import { createPrismaUsersRepo } from './users.js';
import { createPrismaStatsRepo } from './stats.js';
import { buildApp } from './http/app.js';
import { attachSocket, socketNotifier, socketPush, type IoServer } from './socket.js';
import {
  attachInline,
  botHealth,
  botInvites,
  botReferrals,
  botResults,
  configureBot,
  createBot,
  startBot,
  syncChatCommands,
  type BotTrouble,
  type QuizBot,
} from './bot/index.js';
import { botAlerts } from './bot/alerts.js';
import { cardMedia } from './bot/cards.js';
import { dailyReminders } from './bot/reminders.js';
import { createPrismaGamesRepo } from './game/repo.js';
import { GameManager, realClock } from './game/manager.js';
import { loadQuestionBank } from './questions/bank.js';
import { createPrismaEconomyRepo } from './economy.js';
import { attachPayments, botChannels, botInvoices } from './bot/payments.js';
import { participants } from './game/machine.js';
import { createPrismaFriendsRepo } from './friends.js';
import { createAdminRepo } from './admin.js';
import { InlineKeyboard } from 'grammy';
import { TIMINGS, packOf } from '@quiz-duel/shared';
import { syncQuestions } from './questions/sync.js';
import { lastBackupAt } from './backup.js';

async function main() {
  const env = loadEnv();
  const prisma = createPrisma(env.DATABASE_URL);
  const users = createPrismaUsersRepo(prisma);

  // База вопросов проверяется до старта: битый questions.json не даст серверу подняться.
  const questions = loadQuestionBank();

  // Бот нужен ещё до HTTP: из getMe берём его username для ссылок.
  // Неверный токен - сразу понятная ошибка при запуске, а не потом в игре.
  let bot: QuizBot | null = null;
  let botUsername = 'quiz_duel_bot';
  if (env.BOT_ENABLED) {
    bot = await createBot(env.BOT_TOKEN, env.WEB_APP_URL, users, { termsUrl: env.TERMS_URL, privacyUrl: env.PRIVACY_URL });
    botUsername = bot.botInfo.username;
  }

  // Менеджер партий создаётся после HTTP (ему нужен логгер приложения), поэтому ссылка - через переменную.
  let gamesRef: GameManager | null = null;
  let logRef: FastifyBaseLogger | null = null;
  // Подписку на канал проверяет бот (getChatMember); логгер появится вместе с приложением.
  const economy = createPrismaEconomyRepo(prisma, bot ? botChannels(bot.api, () => logRef) : undefined);
  await economy.ensureTasks();
  const friends = createPrismaFriendsRepo(prisma);
  const adminIds = adminIdsOf(env);
  // Сбои бота (упал опрос Telegram, не прошёл inline-запрос) - сообщением владельцу,
  // не чаще раза в полчаса на каждый вид: без доступа к журналу сервера сразу видно, что случилось.
  const ownerChat = Number(env.DEPLOY_NOTIFY_CHAT_ID.trim()) || [...adminIds][0] || 0;
  const troubleAt = new Map<string, number>();
  const trouble: BotTrouble = (kind, detail) => {
    if (!bot || !ownerChat) return;
    const at = Date.now();
    if (at - (troubleAt.get(kind) ?? 0) < 30 * 60_000) return;
    troubleAt.set(kind, at);
    const head = kind === 'polling' ? '⚠️ Quiz Duel: бот потерял связь с Telegram и сам перезапускает опрос.' : '⚠️ Quiz Duel: inline-запрос не прошёл.';
    void bot.api.sendMessage(ownerChat, `${head}\n${detail}`, { link_preview_options: { is_disabled: true } }).catch(() => undefined);
  };
  const channels = bot ? botChannels(bot.api, () => logRef) : undefined;
  const admin = createAdminRepo({
    prisma,
    economy,
    channels,
    live: () => gamesRef?.liveCounts() ?? { online: 0, inGame: 0 },
    botUsername,
    appUrl: `https://t.me/${botUsername}/${env.APP_SHORT_NAME}`,
  });
  let io: IoServer | null = null;
  let poller: ReturnType<typeof startBot> | null = null;
  let payments: ReturnType<typeof attachPayments> | null = null;
  const push = socketPush(() => io);
  const app = await buildApp({
    env,
    users,
    stats: createPrismaStatsRepo(prisma),
    economy,
    invoices: bot ? botInvoices(bot.api) : undefined,
    referrals: bot ? botReferrals(bot, env.WEB_APP_URL) : undefined,
    friends,
    admin,
    adminIds,
    onWalletChanged: (userId) => push.wallet(userId),
    presence: (userId) => gamesRef?.presenceOf(userId) ?? 'offline',
    onFriendChanged: (userId, kind, fromId) => {
      void friends.brief(fromId).then((from) => from && push.friendChanged(userId, { kind, from }));
    },
    botUsername,
    onSettingsChanged: (userId) => {
      gamesRef?.userChanged(userId);
      // Язык, выбранный в мини-аппе, сразу переносится на меню команд бота в чате игрока.
      if (bot) void users.alertTarget(userId).then((t) => t && syncChatCommands(bot, userId, t.lang));
    },
    botStatus: bot ? botHealth : undefined,
    backupStatus: () => lastBackupAt(env.BACKUP_STATUS_FILE),
  });
  logRef = app.log;

  // Таблица questions всегда совпадает с data/questions.json из этой сборки
  // (до восстановления партий: их ответы ссылаются на вопросы).
  const synced = await syncQuestions(prisma, questions.all);
  app.log.info(synced, 'questions synced');

  const appUrl = `https://t.me/${botUsername}/${env.APP_SHORT_NAME}`;
  // Анимированные карточки в сообщениях бота: ролики лежат на сайте мини-аппа (/bot/*.mp4).
  const cards = cardMedia(env.WEB_APP_URL);
  const alerts = bot ? botAlerts(bot.api, users, appUrl, app.log, cards) : undefined;
  const games = new GameManager({
    repo: createPrismaGamesRepo(prisma),
    users,
    bank: questions,
    notify: socketNotifier(() => io),
    appUrl: `https://t.me/${botUsername}/${env.APP_SHORT_NAME}`,
    docsVersion: env.DOCS_VERSION,
    log: app.log,
    invites: bot ? botInvites(bot, env.WEB_APP_URL) : undefined,
    alerts,
    sharer: bot ? botResults(bot, env.WEB_APP_URL) : undefined,
    clock: realClock,
    draft: true,
    topicAccess: async (userId, topic) => (await economy.topicAccess(userId, topic)) !== 'locked',
    ownedTopics: (userId) => economy.ownedTopics(userId),
    useTopic: async (userId, topic, gameId) => {
      await economy.useTopic(userId, topic, gameId, Date.now());
      push.wallet(userId);
    },
    canReact: async (userId, emoji) => {
      const pack = packOf(emoji);
      return pack !== null && (await economy.ownsPack(userId, pack));
    },
    onSettled: async (state) => {
      const ids = participants(state).map((p) => p.userId);
      await economy.gamePlayed(ids, Date.now());
      for (const id of ids) push.wallet(id);
    },
  });
  gamesRef = games;
  // Партии, шедшие до перезапуска, поднимаются из базы; просроченные фазы закрываются сразу.
  const restored = await games.restore();
  app.log.info({ restored }, 'games restored');

  io = attachSocket(app.server, {
    botToken: env.BOT_TOKEN,
    maxAgeSec: env.INIT_DATA_MAX_AGE_SEC,
    origin: webOrigin(env),
    log: app.log,
    games,
    now: realClock.now,
    isFriend: (a, b) => friends.isFriend(a, b),
    onChallenge: (fromId, friendId, game) => {
      void friends.brief(fromId).then((from) => {
        if (!from) return;
        const expiresAt = game.lobbyExpiresAt ?? Date.now() + TIMINGS.lobbyTtlMs;
        push.friendInvite(friendId, { gameId: game.id, from, category: game.category, rules: game.rules, expiresAt });
        alerts?.send(friendId, { kind: 'friendInvite', gameId: game.id, opponent: from.name, category: game.category, rules: game.rules });
      });
    },
  });

  await app.listen({ host: env.HOST, port: env.PORT });

  if (bot) {
    attachInline(bot, games, users, env.WEB_APP_URL, app.log, trouble);
    // /admin - кнопка, открывающая админку (только админам; остальным бот молчит про неё).
    bot.command('admin', async (ctx) => {
      if (!ctx.from || !adminIds.has(ctx.from.id)) return;
      const ru = (ctx.from.language_code ?? '').startsWith('ru');
      await ctx.reply(ru ? 'Админка Quiz Duel: статистика, источники, задания и игроки.' : 'Quiz Duel admin: stats, sources, tasks and players.', {
        reply_markup: new InlineKeyboard().url(ru ? 'Открыть админку' : 'Open admin', `${appUrl}?startapp=admin`),
      });
    });
    payments = attachPayments(
      bot,
      economy,
      { changed: (userId) => push.wallet(userId), lang: async (userId) => (await users.alertTarget(userId))?.lang ?? 'en' },
      app.log,
    );
    await configureBot(bot, env.WEB_APP_URL, app.log);
    poller = startBot(bot, app.log, trouble);
    // Сверка оплат со списком операций Telegram: при запуске (платёж мог потеряться при прошлой
    // остановке) и каждые 10 минут. Ошибки сверка пишет в журнал сама.
    const sweepPayments = () => void payments?.sweep();
    sweepPayments();
    setInterval(sweepPayments, 10 * 60_000).unref();
    // Напоминание о ежедневной награде: проход раз в 5 минут, пишет только вечером по Москве.
    const reminders = dailyReminders({ prisma, users, api: bot.api, cards, appUrl, log: app.log });
    const remind = () =>
      void reminders
        .run(Date.now())
        .then((n) => n > 0 && app.log.info({ sent: n }, 'daily reminders sent'))
        .catch((error: unknown) => app.log.warn({ err: error }, 'daily reminders failed'));
    setInterval(remind, 5 * 60_000).unref();
  }

  let stopping = false;
  const shutdown = async (signal: string) => {
    if (stopping) return;
    stopping = true;
    app.log.info({ signal }, 'shutting down');
    try {
      payments?.stop();
      await poller?.stop();
      // Сначала партии: таймеры стоп, начатые изменения дописываются в базу. Отключения
      // сокетов при остановке - не уход игроков, отсчёт до техпоражения из-за выкатки не пойдёт.
      await games.shutdown();
      await new Promise<void>((resolve) => (io ? io.close(() => resolve()) : resolve()));
      await app.close();
      await prisma.$disconnect();
    } finally {
      process.exit(0);
    }
  };
  process.on('SIGTERM', () => void shutdown('SIGTERM'));
  process.on('SIGINT', () => void shutdown('SIGINT'));
}

main().catch((error: unknown) => {
  console.error(error instanceof Error ? error.message : error);
  process.exit(1);
});
