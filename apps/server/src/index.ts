import type { FastifyBaseLogger } from 'fastify';
import { adminIdsOf, loadEnv, webOrigin } from './env.js';
import { createPrisma } from './db.js';
import { createPrismaUsersRepo } from './users.js';
import { createPrismaStatsRepo } from './stats.js';
import { buildApp } from './http/app.js';
import { attachSocket, socketNotifier, socketPush, type IoServer } from './socket.js';
import { attachInline, botInvites, botResults, configureBot, createBot, startBot, type QuizBot } from './bot/index.js';
import { botAlerts } from './bot/alerts.js';
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
    bot = await createBot(env.BOT_TOKEN, env.WEB_APP_URL, users);
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
  const push = socketPush(() => io);
  const app = await buildApp({
    env,
    users,
    stats: createPrismaStatsRepo(prisma),
    economy,
    invoices: bot ? botInvoices(bot.api) : undefined,
    friends,
    admin,
    adminIds,
    onWalletChanged: (userId) => push.wallet(userId),
    presence: (userId) => gamesRef?.presenceOf(userId) ?? 'offline',
    onFriendChanged: (userId, kind, fromId) => {
      void friends.brief(fromId).then((from) => from && push.friendChanged(userId, { kind, from }));
    },
    botUsername,
    onSettingsChanged: (userId) => gamesRef?.userChanged(userId),
  });
  logRef = app.log;

  // Таблица questions всегда совпадает с data/questions.json из этой сборки
  // (до восстановления партий: их ответы ссылаются на вопросы).
  const synced = await syncQuestions(prisma, questions.all);
  app.log.info(synced, 'questions synced');

  const appUrl = `https://t.me/${botUsername}/${env.APP_SHORT_NAME}`;
  const alerts = bot ? botAlerts(bot.api, users, appUrl, app.log) : undefined;
  const games = new GameManager({
    repo: createPrismaGamesRepo(prisma),
    users,
    bank: questions,
    notify: socketNotifier(() => io),
    appUrl: `https://t.me/${botUsername}/${env.APP_SHORT_NAME}`,
    docsVersion: env.DOCS_VERSION,
    log: app.log,
    invites: bot ? botInvites(bot) : undefined,
    alerts,
    sharer: bot ? botResults(bot) : undefined,
    clock: realClock,
    draft: true,
    topicAccess: async (userId, topic) => (await economy.topicAccess(userId, topic)) !== 'locked',
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
        alerts?.send(friendId, { kind: 'friendInvite', gameId: game.id, opponent: from.name });
      });
    },
  });

  await app.listen({ host: env.HOST, port: env.PORT });

  if (bot) {
    attachInline(bot, games, users, env.WEB_APP_URL, app.log);
    // /admin - кнопка, открывающая админку (только админам; остальным бот молчит про неё).
    bot.command('admin', async (ctx) => {
      if (!ctx.from || !adminIds.has(ctx.from.id)) return;
      const ru = (ctx.from.language_code ?? '').startsWith('ru');
      await ctx.reply(ru ? 'Админка Quiz Duel: статистика, источники, задания и игроки.' : 'Quiz Duel admin: stats, sources, tasks and players.', {
        reply_markup: new InlineKeyboard().url(ru ? 'Открыть админку' : 'Open admin', `${appUrl}?startapp=admin`),
      });
    });
    attachPayments(
      bot,
      economy,
      { changed: (userId) => push.wallet(userId), lang: async (userId) => (await users.alertTarget(userId))?.lang ?? 'en' },
      app.log,
    );
    await configureBot(bot, env.WEB_APP_URL, app.log);
    startBot(bot, app.log);
  }

  let stopping = false;
  const shutdown = async (signal: string) => {
    if (stopping) return;
    stopping = true;
    app.log.info({ signal }, 'shutting down');
    try {
      await bot?.stop();
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
