import { loadEnv, webOrigin } from './env.js';
import { createPrisma } from './db.js';
import { createPrismaUsersRepo } from './users.js';
import { buildApp } from './http/app.js';
import { attachSocket } from './socket.js';
import { configureBot, createBot, startBot, type QuizBot } from './bot/index.js';

async function main() {
  const env = loadEnv();
  const prisma = createPrisma(env.DATABASE_URL);
  const users = createPrismaUsersRepo(prisma);

  // Бот нужен ещё до HTTP: из getMe берём его username для ссылок.
  // Неверный токен - сразу понятная ошибка при запуске, а не потом в игре.
  let bot: QuizBot | null = null;
  let botUsername = 'quiz_duel_bot';
  if (env.BOT_ENABLED) {
    bot = await createBot(env.BOT_TOKEN, env.WEB_APP_URL);
    botUsername = bot.botInfo.username;
  }

  const app = await buildApp({ env, users, botUsername });
  const io = attachSocket(app.server, {
    botToken: env.BOT_TOKEN,
    maxAgeSec: env.INIT_DATA_MAX_AGE_SEC,
    origin: webOrigin(env),
    log: app.log,
  });

  await app.listen({ host: env.HOST, port: env.PORT });

  if (bot) {
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
      await new Promise<void>((resolve) => io.close(() => resolve()));
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
