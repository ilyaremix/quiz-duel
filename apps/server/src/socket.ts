import type { Server as HttpServer } from 'node:http';
import { Server } from 'socket.io';
import type { z } from 'zod';
import {
  AnswerPayloadSchema,
  CreateGamePayloadSchema,
  EmptyPayloadSchema,
  GameIdPayloadSchema,
  ReadyPayloadSchema,
  ReactPayloadSchema,
  RematchRespondPayloadSchema,
  SOCKET_PATH,
  SyncPayloadSchema,
  type Ack,
  type ClientToServerEvents,
  type FriendChangedEvent,
  type FriendInviteEvent,
  type GameCategory,
  type GameView,
  type ServerToClientEvents,
  type SocketData,
} from '@quiz-duel/shared';
import type { FastifyBaseLogger } from 'fastify';
import { InitDataError, verifyInitData } from './auth/initData.js';
import { authErrorBody } from './auth/fastify.js';
import type { GameManager, GameNotifier } from './game/manager.js';

export type IoServer = Server<ClientToServerEvents, ServerToClientEvents, Record<string, never>, SocketData>;

export interface SocketDeps {
  botToken: string;
  maxAgeSec: number;
  origin: string;
  log: FastifyBaseLogger;
  /** Без менеджера сокет умеет только приветствие и часы (тесты авторизации). */
  games?: GameManager;
  /** Часы сервера: те же, что у менеджера партий, - по ним клиент сверяет свои. */
  now?: () => number;
  /** Пинг Socket.IO (по умолчанию HEARTBEAT). */
  heartbeat?: { intervalMs: number; timeoutMs: number };
  /** Вызов другу: проверка дружбы и уведомление (бот и баннер в приложении). */
  isFriend?: (a: number, b: number) => Promise<boolean>;
  onChallenge?: (fromId: number, friendId: number, game: GameView) => void;
}

/** Комната игрока: все его вкладки и устройства. */
export const userRoom = (userId: number) => `user:${userId}`;

/**
 * Как быстро сервер замечает «молча» пропавший телефон (ушёл в метро, сел заряд):
 * пинг каждые 10 с, нет ответа 8 с - подключение закрыто. Стандартные 25 + 20 с
 * давали бы до 45 с задержки, и отсчёт 30 с до технической победы начинался бы поздно.
 * Свёрнутое на несколько секунд приложение при этом не считается ушедшим.
 */
export const HEARTBEAT = { intervalMs: 10_000, timeoutMs: 8_000 } as const;

/** Сколько игровых событий можно прислать с одного подключения за окно. */
const EVENT_LIMIT = { max: 30, windowMs: 10_000 } as const;

/** Снимки партии уходят в комнату игрока. */
/** Пуши игроку вне партии: кошелёк изменился (оплата, награды), друзья. */
export function socketPush(getIo: () => IoServer | null) {
  return {
    wallet(userId: number) {
      getIo()?.to(userRoom(userId)).emit('wallet:changed');
    },
    friendInvite(userId: number, event: FriendInviteEvent) {
      getIo()?.to(userRoom(userId)).emit('friend:invite', event);
    },
    friendChanged(userId: number, event: FriendChangedEvent) {
      getIo()?.to(userRoom(userId)).emit('friend:changed', event);
    },
  };
}
export type SocketPush = ReturnType<typeof socketPush>;

export function socketNotifier(getIo: () => IoServer | null): GameNotifier {
  return {
    state(userId, view, meta) {
      getIo()?.to(userRoom(userId)).emit('game:state', view, meta);
    },
    reaction(userId, event) {
      getIo()?.to(userRoom(userId)).emit('game:reaction', event);
    },
    queue(userId, event) {
      const room = getIo()?.to(userRoom(userId));
      if (event.type === 'matched') room?.emit('queue:matched', { gameId: event.gameId });
      else room?.emit('queue:timeout');
    },
  };
}

export function attachSocket(httpServer: HttpServer, deps: SocketDeps): IoServer {
  const io: IoServer = new Server(httpServer, {
    path: SOCKET_PATH,
    cors: { origin: deps.origin, methods: ['GET', 'POST'] },
    // Игровые события маленькие; большой пакет - это ошибка или атака.
    maxHttpBufferSize: 16 * 1024,
    serveClient: false,
    pingInterval: (deps.heartbeat ?? HEARTBEAT).intervalMs,
    pingTimeout: (deps.heartbeat ?? HEARTBEAT).timeoutMs,
  });
  const now = deps.now ?? Date.now;

  // Без верного initData соединение не устанавливается вообще.
  io.use((socket, next) => {
    const raw: unknown = socket.handshake.auth?.initData;
    try {
      const verified = verifyInitData(typeof raw === 'string' ? raw : undefined, deps.botToken, {
        maxAgeSec: deps.maxAgeSec,
      });
      socket.data.userId = verified.user.id;
      next();
    } catch (error) {
      const err = new Error('unauthorized') as Error & { data?: unknown };
      err.data = error instanceof InitDataError ? authErrorBody(error) : { error: 'internal' };
      if (!(error instanceof InitDataError)) deps.log.error({ err: error }, 'socket auth failed');
      next(err);
    }
  });

  io.on('connection', (socket) => {
    const { userId } = socket.data;
    const games = deps.games;

    socket.on('time:sync', (ack) => {
      if (typeof ack === 'function') ack({ serverNow: now() });
    });

    // Скользящее окно событий на подключение.
    let windowStart = Date.now();
    let count = 0;
    const allowed = () => {
      const now = Date.now();
      if (now - windowStart > EVENT_LIMIT.windowMs) {
        windowStart = now;
        count = 0;
      }
      count += 1;
      return count <= EVENT_LIMIT.max;
    };

    /** Событие с ack: проверка схемой, лимит, ошибка сервера не роняет соединение. */
    function on<S extends z.ZodType, R extends object>(
      event: keyof ClientToServerEvents,
      schema: S,
      handler: (payload: z.infer<S>) => Promise<Ack<R>>,
    ) {
      socket.on(event, (async (payload: unknown, ack: unknown) => {
        if (typeof ack !== 'function') return;
        const reply = ack as (result: Ack<R>) => void;
        if (!allowed()) return reply({ ok: false, error: 'rate_limited' });
        const parsed = schema.safeParse(payload ?? {});
        if (!parsed.success) return reply({ ok: false, error: 'invalid' });
        try {
          reply(await handler(parsed.data));
        } catch (error) {
          deps.log.error({ err: error, event, userId }, 'socket event failed');
          reply({ ok: false, error: 'internal' });
        }
      }) as never);
    }

    if (games) {
      on('game:create', CreateGamePayloadSchema, async (p) => {
        const friendId = p.friendId;
        // Вызов другу - только тому, кто в друзьях.
        if (friendId !== undefined && !(deps.isFriend && (await deps.isFriend(userId, friendId)))) {
          return { ok: false, error: 'not_participant' } as const;
        }
        const res = await games.create(userId, p.category as GameCategory);
        if (res.ok && friendId !== undefined) deps.onChallenge?.(userId, friendId, res.game);
        return res;
      });
      on('solo:start', CreateGamePayloadSchema, (p) => games.soloStart(userId, p.category as GameCategory));
      on('game:join', GameIdPayloadSchema, (p) => games.join(userId, p.gameId));
      on('game:sync', SyncPayloadSchema, (p) => games.sync(userId, p.gameId));
      on('game:invite', GameIdPayloadSchema, (p) => games.invite(userId, p.gameId));
      on('game:ready', ReadyPayloadSchema, (p) => games.ready(userId, p.gameId, p.ready));
      on('game:cancel', GameIdPayloadSchema, (p) => games.cancel(userId, p.gameId));
      on('game:leave', GameIdPayloadSchema, (p) => games.leave(userId, p.gameId));
      on('game:answer', AnswerPayloadSchema, (p) => games.answer(userId, p.gameId, p.questionIndex, p.optionIndex));
      on('queue:join', EmptyPayloadSchema, () => games.queueJoin(userId));
      on('queue:leave', EmptyPayloadSchema, async () => games.queueLeave(userId));
      on('game:share', GameIdPayloadSchema, (p) => games.share(userId, p.gameId));
      on('game:react', ReactPayloadSchema, (p) => games.react(userId, p.gameId, p.emoji));
      on('game:forfeit', GameIdPayloadSchema, (p) => games.forfeit(userId, p.gameId));
      on('rematch:offer', GameIdPayloadSchema, (p) => games.rematchOffer(userId, p.gameId));
      on('rematch:respond', RematchRespondPayloadSchema, (p) => games.rematchRespond(userId, p.gameId, p.accept));
      on('rematch:cancel', GameIdPayloadSchema, (p) => games.rematchCancel(userId, p.gameId));
    }

    socket.on('disconnect', () => {
      games?.disconnect(userId).catch((error: unknown) => deps.log.error({ err: error, userId }, 'disconnect failed'));
    });

    const hello = (currentGameId: string | null) => {
      if (!socket.connected) return;
      const resultsGameId = currentGameId ? null : (games?.resultsOf(userId) ?? null);
      socket.emit('session:hello', { userId, serverNow: now(), currentGameId, resultsGameId });
    };
    // connect() сразу считает новое подключение, поэтому закрытие старых ниже
    // не делает игрока «офлайн» даже на мгновение.
    const connecting = games ? games.connect(userId) : Promise.resolve(null);
    // Активно последнее подключение: прежние вкладки и устройства этого игрока закрываются.
    for (const other of io.sockets.adapter.rooms.get(userRoom(userId)) ?? []) {
      const old = io.sockets.sockets.get(other);
      if (!old) continue;
      old.emit('session:replaced');
      old.disconnect(true);
    }
    void socket.join(userRoom(userId));

    connecting.then(hello, (error: unknown) => {
      deps.log.error({ err: error, userId }, 'connect failed');
      hello(null);
    });
  });

  return io;
}
