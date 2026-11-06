/**
 * Типы событий Socket.IO. Общие для клиента и сервера, поэтому
 * имя события или его данные нельзя поменять только с одной стороны.
 * Этап 1: приветствие и часы. Этап 4: лобби. Вопросы, ответы и реванш - этапы 5-7.
 */
import type { GameView, PlayerProfile } from './game.js';
import type { GameCategory } from './categories.js';

export interface SessionHello {
  userId: number;
  serverNow: number;
  /**
   * Партия, в которой игрок сейчас участвует (лобби или идущая дуэль), или null.
   * По ней клиент возвращает игрока в партию, даже если приложение открыли без ссылки.
   */
  currentGameId: string | null;
}

export interface TimeSyncAck {
  serverNow: number;
}

/** Коды отказов игровых событий. */
export type GameErrorCode =
  /** Партии с таким id нет. */
  | 'not_found'
  /** Место соперника уже занято. */
  | 'taken'
  /** Лобби истекло, соперник так и не пришёл. */
  | 'expired'
  /** Создатель отменил игру. */
  | 'cancelled'
  /** Партия сыграна, а запросил её посторонний. */
  | 'finished'
  /** У игрока уже идёт другая партия (busyGameId), в двух сразу играть нельзя. */
  | 'busy'
  /** Не приняты документы текущей версии. */
  | 'consent_required'
  | 'not_participant'
  | 'wrong_phase'
  | 'not_creator'
  /** Данные события не прошли проверку схемой. */
  | 'invalid'
  | 'rate_limited'
  | 'internal';

export interface GameFailure {
  ok: false;
  error: GameErrorCode;
  /** Для busy: партия, в которую можно вернуться. */
  busyGameId?: string;
  /** Для consent_required при входе по ссылке: кто зовёт (для шторки с документами). */
  inviter?: PlayerProfile & { userId: number };
}

/** Ответ сервера на игровое событие (ack). */
export type Ack<T extends object = object> = ({ ok: true } & T) | GameFailure;

export interface CreateGamePayload {
  category: GameCategory;
}

export interface GameIdPayload {
  gameId: string;
}

export interface SyncPayload {
  /** Без id - текущая партия игрока (если есть). */
  gameId?: string;
}

export interface ReadyPayload {
  gameId: string;
  ready: boolean;
}

export interface GameResult {
  game: GameView;
}

export interface SyncResult {
  game: GameView | null;
}

export interface InviteResult {
  /** https://t.me/<bot>/<app>?startapp=g_<id> */
  link: string;
  /** id подготовленного сообщения для shareMessage; null - бот не смог, клиент делится ссылкой. */
  preparedMessageId: string | null;
}

/** Пояснение к снимку: почему он пришёл (для тостов). */
export interface GameStateMeta {
  /** Место соперника освободилось: не вернулся за 60 с (timeout) или сам вышел (left). */
  seatFreed?: 'timeout' | 'left';
}

type AckFn<T extends object = object> = (result: Ack<T>) => void;

export interface ServerToClientEvents {
  'session:hello': (payload: SessionHello) => void;
  /** Игра открыта на другом устройстве: это подключение закрывается. */
  'session:replaced': () => void;
  /** Полный снимок партии. Клиент рисует экран только из него. */
  'game:state': (view: GameView, meta?: GameStateMeta) => void;
}

export interface ClientToServerEvents {
  'time:sync': (ack: (payload: TimeSyncAck) => void) => void;
  'game:create': (payload: CreateGamePayload, ack: AckFn<GameResult>) => void;
  'game:join': (payload: GameIdPayload, ack: AckFn<GameResult>) => void;
  'game:sync': (payload: SyncPayload, ack: AckFn<SyncResult>) => void;
  'game:invite': (payload: GameIdPayload, ack: AckFn<InviteResult>) => void;
  'game:ready': (payload: ReadyPayload, ack: AckFn<GameResult>) => void;
  /** Создатель отменяет игру до старта. */
  'game:cancel': (payload: GameIdPayload, ack: AckFn<GameResult>) => void;
  /** Соперник выходит из лобби (место сразу освобождается). */
  'game:leave': (payload: GameIdPayload, ack: AckFn) => void;
}

/** Данные, которые сервер кладёт в socket.data после проверки initData. */
export interface SocketData {
  userId: number;
}

/** Путь Socket.IO, одинаковый у клиента, сервера и прокси. */
export const SOCKET_PATH = '/socket.io';
