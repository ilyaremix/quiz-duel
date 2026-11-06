import Fastify, { type FastifyServerOptions } from 'fastify';
import cors from '@fastify/cors';
import rateLimit from '@fastify/rate-limit';
import {
  CONSENT_DOCS,
  ConsentRequestSchema,
  isGameId,
  type ApiError,
  type ConfigResponse,
  type ConsentDoc,
  type ConsentResponse,
  type HealthResponse,
} from '@quiz-duel/shared';
import { docsInfo, webOrigin, type Env } from '../env.js';
import { InitDataError } from '../auth/initData.js';
import { authErrorBody, requireTelegramAuth } from '../auth/fastify.js';
import { toMeResponse, type UsersRepo } from '../users.js';
import type { StatsRepo } from '../stats.js';

export interface AppDeps {
  env: Pick<
    Env,
    | 'BOT_TOKEN'
    | 'INIT_DATA_MAX_AGE_SEC'
    | 'WEB_APP_URL'
    | 'APP_SHORT_NAME'
    | 'TRUST_PROXY'
    | 'LOG_LEVEL'
    | 'DOCS_VERSION'
    | 'TERMS_URL'
    | 'PRIVACY_URL'
  >;
  users: UsersRepo;
  /** Профиль, лидерборд, разбор (без него маршруты этапа 7 не регистрируются - тесты авторизации). */
  stats?: StatsRepo;
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

export async function buildApp({ env, users, stats, botUsername, logger }: AppDeps) {
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
    docs: docsInfo(env),
  }));

  app.get('/api/me', { onRequest: auth }, async (request) => {
    // request.tg гарантированно заполнен: без него хук auth отклонил бы запрос.
    const user = await users.upsertFromTelegram(request.tg!.user);
    return toMeResponse(user, env.DOCS_VERSION);
  });

  // Принятие документов. userId - только из проверенного initData, тело запроса его не задаёт.
  // IP - адрес клиента из X-Forwarded-For, которому верим только от своих прокси (trustProxy).
  app.post('/api/consents', { onRequest: auth }, async (request, reply) => {
    const parsed = ConsentRequestSchema.safeParse(request.body);
    if (!parsed.success) return reply.code(400).send({ error: 'bad_request' } satisfies ApiError);
    // Играть можно, только приняв оба документа, поэтому и принимаются они вместе.
    if (!CONSENT_DOCS.every((doc) => parsed.data.docs.includes(doc))) {
      return reply.code(400).send({ error: 'bad_request', reason: 'all_docs_required' } satisfies ApiError);
    }
    if (parsed.data.version !== env.DOCS_VERSION) {
      return reply.code(409).send({ error: 'stale_version', reason: env.DOCS_VERSION } satisfies ApiError);
    }
    const tgUser = request.tg!.user;
    // Строка игрока должна существовать (внешний ключ журнала).
    await users.upsertFromTelegram(tgUser);
    const ua = request.headers['user-agent'];
    await users.acceptDocs({
      userId: tgUser.id,
      docs: [...new Set(parsed.data.docs)] as ConsentDoc[],
      version: parsed.data.version,
      ip: request.ip || null,
      userAgent: typeof ua === 'string' ? ua.slice(0, 512) : null,
    });
    return { ok: true, docsVersion: env.DOCS_VERSION } satisfies ConsentResponse;
  });

  if (stats) {
    const notFound = { error: 'not_found' } satisfies ApiError;
    // Telegram id - целое до 52 бит; всё остальное отклоняем до запроса в базу.
    const userIdOf = (value: unknown) => (typeof value === 'string' && /^[1-9]\d{0,15}$/.test(value) ? Number(value) : null);

    app.get('/api/profile', { onRequest: auth }, async (request, reply) => {
      const profile = await stats.profile(request.tg!.user.id);
      return profile ?? reply.code(404).send(notFound);
    });

    app.get('/api/leaderboard', { onRequest: auth }, async (request) => stats.leaderboard(request.tg!.user.id));

    // Профиль соперника: только того, с кем вы уже встречались. Иначе - 404, как будто игрока нет.
    app.get<{ Params: { id: string } }>('/api/players/:id', { onRequest: auth }, async (request, reply) => {
      const id = userIdOf(request.params.id);
      if (id === null) return reply.code(400).send({ error: 'bad_request' } satisfies ApiError);
      const player = await stats.player(request.tg!.user.id, id);
      return player ?? reply.code(404).send(notFound);
    });

    // Разбор: только участникам и только завершённой партии.
    app.get<{ Params: { id: string } }>('/api/games/:id/review', { onRequest: auth }, async (request, reply) => {
      if (!isGameId(request.params.id)) return reply.code(400).send({ error: 'bad_request' } satisfies ApiError);
      const review = await stats.review(request.tg!.user.id, request.params.id);
      return review ?? reply.code(404).send(notFound);
    });
  }

  return app;
}
