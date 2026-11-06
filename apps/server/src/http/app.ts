import Fastify, { type FastifyServerOptions } from 'fastify';
import cors from '@fastify/cors';
import rateLimit from '@fastify/rate-limit';
import type { ApiError, ConfigResponse, HealthResponse } from '@quiz-duel/shared';
import { webOrigin, type Env } from '../env.js';
import { InitDataError } from '../auth/initData.js';
import { authErrorBody, requireTelegramAuth } from '../auth/fastify.js';
import { toMeResponse, type UsersRepo } from '../users.js';

export interface AppDeps {
  env: Pick<
    Env,
    'BOT_TOKEN' | 'INIT_DATA_MAX_AGE_SEC' | 'WEB_APP_URL' | 'APP_SHORT_NAME' | 'TRUST_PROXY' | 'LOG_LEVEL'
  >;
  users: UsersRepo;
  botUsername: string;
  /** false - без логов (тесты). */
  logger?: FastifyServerOptions['logger'];
}

export function parseTrustProxy(value: string): string[] {
  return value
    .split(',')
    .map((item) => item.trim())
    .filter(Boolean);
}

export async function buildApp({ env, users, botUsername, logger }: AppDeps) {
  const app = Fastify({
    logger: logger ?? {
      level: env.LOG_LEVEL,
      // initData - это пропуск игрока, в логи он попадать не должен.
      redact: { paths: ['req.headers.authorization', 'headers.authorization'], censor: '[redacted]' },
    },
    trustProxy: parseTrustProxy(env.TRUST_PROXY),
    bodyLimit: 16 * 1024,
  });

  app.decorateRequest('tg', null);

  await app.register(cors, {
    origin: webOrigin(env),
    methods: ['GET', 'POST'],
    allowedHeaders: ['Authorization', 'Content-Type'],
    maxAge: 600,
  });

  // Лимит считаем на игрока, если он уже опознан, иначе на IP.
  // hook preHandler - чтобы к этому моменту хук авторизации уже заполнил request.tg.
  await app.register(rateLimit, {
    global: true,
    hook: 'preHandler',
    max: 120,
    timeWindow: '1 minute',
    keyGenerator: (request) => (request.tg ? `user:${request.tg.user.id}` : `ip:${request.ip}`),
    errorResponseBuilder: (_request, context) => ({
      statusCode: context.statusCode,
      error: 'rate_limited',
    }),
  });

  app.setErrorHandler((error, request, reply) => {
    if (error instanceof InitDataError) {
      request.log.info({ reason: error.reason }, 'initData rejected');
      return reply.code(401).send(authErrorBody(error));
    }
    const status = (error as { statusCode?: number }).statusCode ?? 500;
    if (status === 429) return reply.code(429).send({ error: 'rate_limited' } satisfies ApiError);
    if (status >= 500) {
      request.log.error({ err: error }, 'request failed');
      return reply.code(500).send({ error: 'internal' } satisfies ApiError);
    }
    return reply.code(status).send({ error: 'internal', reason: (error as Error).message });
  });

  app.setNotFoundHandler((_request, reply) => reply.code(404).send({ error: 'not_found' } satisfies ApiError));

  const auth = requireTelegramAuth(env.BOT_TOKEN, env.INIT_DATA_MAX_AGE_SEC);

  // Healthcheck Docker дёргает каждые 30 с - не засоряем им логи.
  app.get('/api/health', { logLevel: 'warn' }, async (_request, reply) => {
    const db = await users.ping();
    const body: HealthResponse = { ok: db, db, uptimeSec: Math.round(process.uptime()) };
    return reply.code(db ? 200 : 503).send(body);
  });

  app.get('/api/config', async (): Promise<ConfigResponse> => ({
    botUsername,
    appShortName: env.APP_SHORT_NAME,
    appUrl: `https://t.me/${botUsername}/${env.APP_SHORT_NAME}`,
  }));

  app.get('/api/me', { onRequest: auth }, async (request) => {
    // request.tg гарантированно заполнен: без него хук auth отклонил бы запрос.
    const user = await users.upsertFromTelegram(request.tg!.user);
    return toMeResponse(user);
  });

  return app;
}
