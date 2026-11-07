import { loadEnv, webOrigin } from './env.js';
import { createPrisma } from './db.js';
import { createPrismaUsersRepo } from './users.js';
import { createPrismaStatsRepo } from './stats.js';
import { buildApp } from './http/app.js';
import { attachSocket, socketNotifier, type IoServer } from './socket.js';
import { attachInline, botInvites, botResults, configureBot, createBot, startBot, type QuizBot } from './bot/index.js';
import { botAlerts } from './bot/alerts.js';
import { createPrismaGamesRepo } from './game/repo.js';
import { GameManager, realClock } from './game/manager.js';
import { loadQuestionBank } from './questions/bank.js';
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
  const app = await buildApp({
    env,
    users,
    stats: createPrismaStatsRepo(prisma),
    botUsername,
    onSettingsChanged: (userId) => gamesRef?.userChanged(userId),
  });

  // Таблица questions всегда совпадает с data/questions.json из этой сборки
  // (до восстановления партий: их ответы ссылаются на вопросы).
  const synced = await syncQuestions(prisma, questions.all);
  app.log.info(synced, 'questions synced');

  let io: IoServer | null = null;
  const appUrl = `https://t.me/${botUsername}/${env.APP_SHORT_NAME}`;
  const games = new GameManager({
    repo: createPrismaGamesRepo(prisma),
    users,
    bank: questions,
    notify: socketNotifier(() => io),
    appUrl: `https://t.me/${botUsername}/${env.APP_SHORT_NAME}`,
    docsVersion: env.DOCS_VERSION,
    log: app.log,
    invites: bot ? botInvites(bot) : undefined,
    alerts: bot ? botAlerts(bot.api, users, appUrl, app.log) : undefined,
    sharer: bot ? botResults(bot) : undefined,
    clock: realClock,
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
  });

  await app.listen({ host: env.HOST, port: env.PORT });

  if (bot) {
    attachInline(bot, games, users, env.WEB_APP_URL, app.log);
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
