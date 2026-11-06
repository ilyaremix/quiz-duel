/**
 * Типы событий Socket.IO. Общие для клиента и сервера, поэтому
 * имя события или его данные нельзя поменять только с одной стороны.
 * Этап 1: приветствие и часы. Этап 4: лобби. Этап 5: ответы и сдача. Этап 7: реванш.
 */
import type { GameView, PlayerProfile, Reaction } from './game.js';
import type { GameCategory } from './categories.js';

export interface SessionHello {
  userId: number;
  serverNow: number;
  /**
   * Партия, в которой игрок сейчас участвует (лобби или идущая дуэль), или null.
   * По ней клиент возвращает игрока в партию, даже если приложение открыли без ссылки.
   */
  currentGameId: string | null;
  /**
   * Партия, которая закончилась, пока игрока не было (закрыл приложение посреди дуэли),
   * и итоги которой он ещё не закрывал. По ней клиент сразу показывает итоги, а не главную.
   */
  resultsGameId: string | null;
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
  /** Ответ на вопрос, который уже закрыт или ещё не начат (сверяется номер вопроса). */
  | 'wrong_question'
  /** Нет варианта с таким номером. */
  | 'bad_option'
  /** Ответ дошёл после конца таймера и допуска на сеть - не засчитан. */
  | 'late'
  /** Реванш после технического исхода или не доигранной партии недоступен. */
  | 'rematch_unavailable'
  /** Соперник ушёл с итогов или не на связи. */
  | 'opponent_left'
  /** Реванш уже закрыт: отказ, таймаут, принят. */
  | 'rematch_closed'
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

export interface AnswerPayload {
  gameId: string;
  /** Номер вопроса 0-9: ответ на чужой или закрытый вопрос отклоняется. */
  questionIndex: number;
  /** Номер варианта на экране 0-3 (порядок вариантов у обоих игроков одинаковый). */
  optionIndex: number;
}

export interface ReactPayload {
  gameId: string;
  emoji: Reaction;
}

/** Реакция одного из игроков: приходит обоим (отправителю - для своего «пузыря»). */
export interface ReactionEvent {
  gameId: string;
  userId: number;
  emoji: Reaction;
}

export interface RematchRespondPayload {
  gameId: string;
  accept: boolean;
}

export interface AnswerResult {
  /**
   * true - ответ принят; false - на этот вопрос игрок уже ответил (двойной тап,
   * повтор после переподключения): засчитан первый ответ, повтор ничего не меняет.
   */
  accepted: boolean;
  game: GameView;
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

export interface ShareResult {
  /** id подготовленного сообщения для shareMessage; null - бот не смог, клиент делится ссылкой с текстом. */
  preparedMessageId: string | null;
  /** Ссылка на мини-апп («Сыграть со мной»). */
  link: string;
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
  /** Реакция в лобби, на раскрытии или на итогах. В снимок партии не попадает. */
  'game:reaction': (event: ReactionEvent) => void;
}

export interface ClientToServerEvents {
  'time:sync': (ack: (payload: TimeSyncAck) => void) => void;
  'game:create': (payload: CreateGamePayload, ack: AckFn<GameResult>) => void;
  'game:join': (payload: GameIdPayload, ack: AckFn<GameResult>) => void;
  /**
   * Тренировка в категории: сразу первый вопрос. Ответы и выход - те же game:answer и game:forfeit
   * (движок один); итог - game:state с result.solo.
   */
  'solo:start': (payload: CreateGamePayload, ack: AckFn<GameResult>) => void;
  'game:sync': (payload: SyncPayload, ack: AckFn<SyncResult>) => void;
  'game:invite': (payload: GameIdPayload, ack: AckFn<InviteResult>) => void;
  'game:ready': (payload: ReadyPayload, ack: AckFn<GameResult>) => void;
  /** Создатель отменяет игру до старта. */
  'game:cancel': (payload: GameIdPayload, ack: AckFn<GameResult>) => void;
  /** Соперник выходит из лобби (место сразу освобождается). */
  'game:leave': (payload: GameIdPayload, ack: AckFn) => void;
  /** Ответ на текущий вопрос. Время и очки считает сервер. */
  'game:answer': (payload: AnswerPayload, ack: AckFn<AnswerResult>) => void;
  /** «Поделиться результатом» на итогах дуэли: карточка «Победа 8 420 : 6 100» с кнопкой «Сыграть со мной». */
  'game:share': (payload: GameIdPayload, ack: AckFn<ShareResult>) => void;
  /** Реакция сопернику: один из 6 эмодзи, не чаще раза в 2 с (иначе rate_limited). */
  'game:react': (payload: ReactPayload, ack: AckFn) => void;
  /** «Выйти из партии»: сразу техническая победа сопернику. */
  'game:forfeit': (payload: GameIdPayload, ack: AckFn<GameResult>) => void;
  /**
   * «Реванш» на итогах. Если соперник уже предложил - это согласие (оба нажали почти
   * одновременно - создаётся одна партия). Новая партия приходит отдельным game:state.
   */
  'rematch:offer': (payload: GameIdPayload, ack: AckFn<GameResult>) => void;
  /** Ответ на предложение соперника: принять или отказаться. */
  'rematch:respond': (payload: RematchRespondPayload, ack: AckFn<GameResult>) => void;
  /** Предложивший отменяет своё предложение. */
  'rematch:cancel': (payload: GameIdPayload, ack: AckFn<GameResult>) => void;
}

/** Данные, которые сервер кладёт в socket.data после проверки initData. */
export interface SocketData {
  userId: number;
}

/** Путь Socket.IO, одинаковый у клиента, сервера и прокси. */
export const SOCKET_PATH = '/socket.io';
