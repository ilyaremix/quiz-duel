import Fastify, { type FastifyReply, type FastifyServerOptions } from 'fastify';
import cors from '@fastify/cors';
import rateLimit from '@fastify/rate-limit';
import {
  AdDoneRequestSchema,
  AdStartRequestSchema,
  BuyRequestSchema,
  CONSENT_DOCS,
  ConsentRequestSchema,
  EquipRequestSchema,
  FriendIdSchema,
  FriendRespondSchema,
  InvoiceRequestSchema,
  SettingsRequestSchema,
  TaskClaimSchema,
  type EconomyErrorCode,
  type InvoiceResponse,
  type StarsProduct,
  isGameId,
  type ApiError,
  type ConfigResponse,
  type ConsentDoc,
  type ConsentResponse,
  type HealthResponse,
  type SettingsResponse,
} from '@quiz-duel/shared';
import { resolveLang } from '@quiz-duel/shared';
import { docsInfo, webOrigin, type Env } from '../env.js';
import { InitDataError } from '../auth/initData.js';
import { authErrorBody, requireTelegramAuth } from '../auth/fastify.js';
import { toMeResponse, type UsersRepo } from '../users.js';
import type { StatsRepo } from '../stats.js';
import type { EcoFailure, EconomyRepo } from '../economy.js';
import type { FriendsRepo, Presence } from '../friends.js';

/** Счёт на оплату звёздами (createInvoiceLink у бота). */
export interface InvoiceMaker {
  link(input: { userId: number; product: StarsProduct; lang: 'ru' | 'en' }): Promise<string>;
}

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
  /**
   * Игрок поменял настройку, от которой зависит то, что ему шлёт игровой сервер (язык):
   * идущая партия пересылается ему на новом языке.
   */
  onSettingsChanged?: (userId: number) => Promise<void> | void;
  /** Обновление 2.0: монеты, магазин, задания, реклама (без него маршруты не регистрируются). */
  economy?: EconomyRepo;
  /** Счета на звёзды (нужен бот). */
  invoices?: InvoiceMaker;
  /** Друзья, заявки, приглашения (без него маршруты не регистрируются). */
  friends?: FriendsRepo;
  /** В сети ли игрок и не в партии ли он (знает менеджер партий). */
  presence?: Presence;
  /** Пуши в приложение: заявка в друзья, принятие. */
  onFriendChanged?: (userId: number, kind: 'request' | 'accepted', fromId: number) => void;
  /** Часы (тесты подставляют свои). */
  now?: () => number;
  /** false - без логов (тесты). */
  logger?: FastifyServerOptions['logger'];
}

export function parseTrustProxy(value: string): string[] {
  return value
    .split(',')
    .map((item) => item.trim())
    .filter(Boolean);
}

/** Отказ экономики: 404 - нет такого, остальное - 409 с причиной для экрана. */
function ecoStatus(error: EconomyErrorCode) {
  return error === 'not_found' ? 404 : 409;
}

export async function buildApp({
  env,
  users,
  stats,
  economy,
  invoices,
  friends,
  presence = () => 'offline',
  onFriendChanged,
  botUsername,
  onSettingsChanged,
  logger,
  now = Date.now,
}: AppDeps) {
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
    // Первый вход после обновления: откуда пришёл и кто пригласил (startapp=r_<id>).
    if (friends) {
      try {
        const { inviterId } = await friends.attribute(user.id, request.tg!.startParam);
        if (inviterId) onFriendChanged?.(inviterId, 'accepted', user.id);
      } catch (error) {
        request.log.warn({ err: error }, 'attribution failed');
      }
    }
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

  // Настройки игрока: уведомления, разрешение писать (requestWriteAccess), язык.
  // Хранятся на сервере - действуют на всех устройствах игрока.
  app.post('/api/settings', { onRequest: auth }, async (request, reply) => {
    const parsed = SettingsRequestSchema.safeParse(request.body);
    if (!parsed.success) return reply.code(400).send({ error: 'bad_request' } satisfies ApiError);
    const tgUser = request.tg!.user;
    await users.upsertFromTelegram(tgUser);
    const saved = await users.updateSettings(tgUser.id, parsed.data);
    if (!saved) return reply.code(404).send({ error: 'not_found' } satisfies ApiError);
    if (parsed.data.language !== undefined && onSettingsChanged) {
      // Сбой пересылки партии не должен ломать сохранение настройки: клиент и так запросит снимок.
      try {
        await onSettingsChanged(tgUser.id);
      } catch (error) {
        request.log.warn({ err: error }, 'settings push failed');
      }
    }
    return saved satisfies SettingsResponse;
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

    app.get('/api/achievements', { onRequest: auth }, async (request, reply) => {
      const list = await stats.achievements(request.tg!.user.id);
      return list ?? reply.code(404).send(notFound);
    });

    // Разбор: только участникам и только завершённой партии.
    app.get<{ Params: { id: string } }>('/api/games/:id/review', { onRequest: auth }, async (request, reply) => {
      if (!isGameId(request.params.id)) return reply.code(400).send({ error: 'bad_request' } satisfies ApiError);
      const review = await stats.review(request.tg!.user.id, request.params.id);
      return review ?? reply.code(404).send(notFound);
    });
  }

  if (friends) {
    const bad = { error: 'bad_request' } satisfies ApiError;
    app.get('/api/friends', { onRequest: auth }, async (request) => friends.list(request.tg!.user.id, presence));

    app.post('/api/friends/request', { onRequest: auth }, async (request, reply) => {
      const parsed = FriendIdSchema.safeParse(request.body);
      if (!parsed.success) return reply.code(400).send(bad);
      const me = request.tg!.user.id;
      const result = await friends.request(me, parsed.data.id);
      if (result === 'not_found') return reply.code(404).send({ error: 'not_found' } satisfies ApiError);
      if (result === 'not_allowed') return reply.code(403).send({ error: 'forbidden', reason: 'not_played' } satisfies ApiError);
      if (result === 'sent') onFriendChanged?.(parsed.data.id, 'request', me);
      if (result === 'accepted') onFriendChanged?.(parsed.data.id, 'accepted', me);
      return { result };
    });

    app.post('/api/friends/respond', { onRequest: auth }, async (request, reply) => {
      const parsed = FriendRespondSchema.safeParse(request.body);
      if (!parsed.success) return reply.code(400).send(bad);
      const me = request.tg!.user.id;
      const ok = await friends.respond(me, parsed.data.id, parsed.data.accept);
      if (!ok) return reply.code(404).send({ error: 'not_found' } satisfies ApiError);
      if (parsed.data.accept) onFriendChanged?.(parsed.data.id, 'accepted', me);
      return { ok: true };
    });

    app.post('/api/friends/remove', { onRequest: auth }, async (request, reply) => {
      const parsed = FriendIdSchema.safeParse(request.body);
      if (!parsed.success) return reply.code(400).send(bad);
      await friends.remove(request.tg!.user.id, parsed.data.id);
      return { ok: true };
    });
  }

  if (economy) {
    const refused = (reply: FastifyReply, failure: EcoFailure) =>
      reply.code(ecoStatus(failure.error)).send({ error: failure.error === 'not_found' ? 'not_found' : 'conflict', reason: failure.error } satisfies ApiError);
    const bad = { error: 'bad_request' } satisfies ApiError;

    app.get('/api/wallet', { onRequest: auth }, async (request, reply) => {
      const tgUser = request.tg!.user;
      await users.upsertFromTelegram(tgUser);
      const wallet = await economy.wallet(tgUser.id, now());
      return wallet ?? reply.code(404).send({ error: 'not_found' } satisfies ApiError);
    });

    app.post('/api/daily', { onRequest: auth }, async (request, reply) => {
      const result = await economy.claimDaily(request.tg!.user.id, now());
      return result.ok ? { wallet: result.wallet, reward: result.reward } : refused(reply, result);
    });

    app.post('/api/tasks/claim', { onRequest: auth }, async (request, reply) => {
      const parsed = TaskClaimSchema.safeParse(request.body);
      if (!parsed.success) return reply.code(400).send(bad);
      // Premium мог появиться после первого входа: берём свежий признак из initData.
      await users.upsertFromTelegram(request.tg!.user);
      const result = await economy.claimTask(request.tg!.user.id, parsed.data.id, now());
      return result.ok ? { wallet: result.wallet, reward: result.reward } : refused(reply, result);
    });

    app.post('/api/shop/buy', { onRequest: auth }, async (request, reply) => {
      const parsed = BuyRequestSchema.safeParse(request.body);
      if (!parsed.success) return reply.code(400).send(bad);
      const result = await economy.buy(request.tg!.user.id, parsed.data.kind, parsed.data.item, now());
      return result.ok ? result.wallet : refused(reply, result);
    });

    app.post('/api/shop/equip', { onRequest: auth }, async (request, reply) => {
      const parsed = EquipRequestSchema.safeParse(request.body);
      if (!parsed.success) return reply.code(400).send(bad);
      const result = await economy.equip(request.tg!.user.id, parsed.data.kind, parsed.data.item, now());
      return result.ok ? result.wallet : refused(reply, result);
    });

    app.post('/api/ads/start', { onRequest: auth }, async (request, reply) => {
      const parsed = AdStartRequestSchema.safeParse(request.body);
      if (!parsed.success) return reply.code(400).send(bad);
      const result = await economy.adStart(request.tg!.user.id, parsed.data.purpose, parsed.data.topic, now());
      return result.ok ? { id: result.id, sec: result.sec, src: result.src } : refused(reply, result);
    });

    app.post('/api/ads/done', { onRequest: auth }, async (request, reply) => {
      const parsed = AdDoneRequestSchema.safeParse(request.body);
      if (!parsed.success) return reply.code(400).send(bad);
      const result = await economy.adDone(request.tg!.user.id, parsed.data.id, now());
      return result.ok ? { wallet: result.wallet, reward: result.reward } : refused(reply, result);
    });

    app.post('/api/stars/invoice', { onRequest: auth }, async (request, reply) => {
      const parsed = InvoiceRequestSchema.safeParse(request.body);
      if (!parsed.success) return reply.code(400).send(bad);
      if (!invoices) return reply.code(503).send({ error: 'internal', reason: 'payments_off' } satisfies ApiError);
      const tgUser = request.tg!.user;
      const user = await users.upsertFromTelegram(tgUser);
      if (parsed.data.product === 'adfree') {
        const wallet = await economy.wallet(tgUser.id, now());
        if (wallet?.adFree) return refused(reply, { ok: false, error: 'owned' });
      }
      const lang = resolveLang(user.language, user.tgLanguage);
      const url = await invoices.link({ userId: tgUser.id, product: parsed.data.product, lang });
      return { url } satisfies InvoiceResponse;
    });
  }

  return app;
}
