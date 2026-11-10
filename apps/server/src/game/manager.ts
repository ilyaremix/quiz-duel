/**
 * Менеджер партий: живые партии в памяти поверх чистой машины состояний (machine.ts).
 *
 * - Изменения одной партии идут строго по очереди (entry.queue), поэтому ответ,
 *   таймаут и вход соперника никогда не пересекаются. Это же делает вход по ссылке
 *   атомарным: из двух одновременных входов место получает ровно один.
 * - Один таймер на партию: после каждого шага спрашиваем nextWakeAt() и в это время
 *   вызываем tick(), который закрывает все наступившие дедлайны.
 * - Каждое изменение сразу пишется в БД полным снимком; при старте сервера
 *   незавершённые партии поднимаются из базы и их таймеры идут от сохранённых дедлайнов.
 * - Клиенту уходит только снимок для него (viewFor): без верного ответа до раскрытия.
 * - Конец рейтинговой дуэли: рейтинг, статистика и ачивки считаются одной транзакцией
 *   (repo.settle) вместе с записью финального снимка. Не вышло - повтор через несколько секунд,
 *   а после перезапуска сервера недосчитанные партии досчитываются при старте.
 * - Реванш живёт в снимке завершённой партии; согласие создаёт новую партию той же пары.
 */
import {
  ACTIVE_PHASES,
  CATEGORIES,
  TIMINGS,
  isPremiumCategory,
  type PremiumCategory,
  DRAFT,
  REACTIONS,
  type Category,
  FINAL_PHASES,
  gameLink,
  OPEN_PHASES,
  type GameCategory,
  type GameRules,
  type GameErrorCode,
  type GameFailure,
  type GameStateMeta,
  type GameView,
  type AnswerResult,
  type InviteResult,
  type ShareResult,
  type Outcome,
  type Reaction,
  type ReactionEvent,
  REACTION_COOLDOWN_MS,
  QUEUE,
  queueRange,
  type QueueJoined,
  REACTION_PHASES,
} from '@quiz-duel/shared';
import type { QuestionBank } from '../questions/bank.js';
import type { UserCard, UsersRepo } from '../users.js';
import * as machine from './machine.js';
import type { GameError, GameEvent, GameState, MachineDeps, Step } from './machine.js';
import { pickQuestions } from './picker.js';
import type { GamesRepo } from './repo.js';
import { newGameId } from './ids.js';
import { draftOffers, secureRng, type Rng } from './rng.js';
import { viewFor } from './view.js';
import { losersOf, settleInput } from './settle.js';

/** Куда менеджер отправляет снимки (сокет-слой). */
export interface GameNotifier {
  state(userId: number, view: GameView, meta?: GameStateMeta): void;
  /** Реакция одного из игроков (уходит обоим). */
  reaction?(userId: number, event: ReactionEvent): void;
  /** Быстрая игра: соперник найден или время поиска вышло. */
  queue?(userId: number, event: { type: 'matched'; gameId: string } | { type: 'timeout' }): void;
}

export interface PreparedInvite {
  id: string;
  /** До какого времени Telegram хранит подготовленное сообщение (мс). */
  expiresAt: number;
}

/** Бот: готовит карточку с результатом дуэли для shareMessage. */
export interface ResultSharer {
  prepare(input: {
    userId: number;
    gameId: string;
    lang: UserCard['lang'];
    outcome: Outcome;
    me: number;
    opp: number;
    opponent: string;
    link: string;
  }): Promise<PreparedInvite | null>;
}

/**
 * Поводы написать игроку от бота, когда его нет в приложении. Менеджер только решает, когда
 * и кому; отправка (язык, разрешения, ошибки Telegram) - в bot/alerts.ts. Сбой отправки
 * никак не влияет на партию.
 */
export type AlertKind =
  /** Соперник занял место в лобби, а создателя нет в приложении. */
  | 'joined'
  /** Соперник готов и ждёт в лобби. */
  | 'waitingLobby'
  /** Посреди партии игрок пропал: у него идёт отсчёт 30 с до технического поражения. */
  | 'waitingGame'
  /** Соперник предлагает реванш, а игрок закрыл приложение. */
  | 'rematch'
  /** Партия закончилась без игрока. */
  | 'result'
  /** Друг зовёт на дуэль (вызов из вкладки «Друзья»). */
  | 'friendInvite';

export interface GameAlert {
  kind: AlertKind;
  gameId: string;
  opponent: string;
  /** Для waitingGame: когда наступит техническое поражение (мс). */
  until?: number;
  /** Для friendInvite: тема и правила партии. */
  category?: GameCategory;
  rules?: GameRules;
  result?: { outcome: Outcome; technical: boolean; me: number; opp: number; ratingAfter: number | null; delta: number | null };
}

export interface GameAlerts {
  send(userId: number, alert: GameAlert): void;
}

/** Бот: готовит карточку «Вызов на дуэль» для shareMessage. */
export interface InviteMaker {
  prepare(input: {
    userId: number;
    gameId: string;
    link: string;
    category: GameCategory;
    rules: GameRules;
    lang: UserCard['lang'];
    creatorName: string;
  }): Promise<PreparedInvite | null>;
}

/**
 * Часы и таймеры сервера. В бою - настоящие; в тестах с настоящими сокетами их
 * подменяют часами, которые умеют «перематывать» время (30 с ожидания за миллисекунды).
 */
export interface ServerClock {
  now(): number;
  setTimeout(fn: () => void, ms: number): unknown;
  clearTimeout(handle: unknown): void;
}

export const realClock: ServerClock = {
  now: () => Date.now(),
  setTimeout: (fn, ms) => setTimeout(fn, ms),
  clearTimeout: (handle) => clearTimeout(handle as NodeJS.Timeout),
};

type Log = { error: (obj: object, msg?: string) => void; warn: (obj: object, msg?: string) => void; info: (obj: object, msg?: string) => void };

export interface ManagerDeps {
  repo: GamesRepo;
  users: UsersRepo;
  bank: QuestionBank;
  notify: GameNotifier;
  /** https://t.me/<bot>/<app> */
  appUrl: string;
  /** Текущая версия документов; без её принятия создать игру или войти нельзя. */
  docsVersion: string;
  log: Log;
  invites?: InviteMaker;
  /** Уведомления от бота тем, кого нет в приложении (этап 8). */
  alerts?: GameAlerts;
  /** Карточка «Поделиться результатом» (этап 8). */
  sharer?: ResultSharer;
  /**
   * Итоги партии записаны (один раз на партию): задания «Сыграйте 3 партии», счётчик до рекламы,
   * награда за приглашение. Ошибка здесь не мешает игре.
   */
  onSettled?: (state: GameState) => Promise<void> | void;
  /**
   * Платные темы: открыта ли тема игроку (куплена или есть билет на 1 игру) и списание билета,
   * когда партия началась. Без этих функций платные темы закрыты для всех.
   * useTopic отвечает, получилось ли: true - тема куплена или билет списан на эту партию (повтор с тем же
   * gameId второй билет не тратит), false - билета нет. releaseTopic возвращает билет, если партия не создалась.
   */
  topicAccess?: (userId: number, topic: PremiumCategory) => Promise<boolean>;
  useTopic?: (userId: number, topic: PremiumCategory, gameId: string) => Promise<boolean>;
  releaseTopic?: (userId: number, gameId: string) => Promise<void>;
  /** Платные темы, купленные навсегда: они тоже выпадают игроку в «Миксе». */
  ownedTopics?: (userId: number) => Promise<PremiumCategory[]>;
  /** Обновление 2.0: в «Миксе» на двоих - выбор темы перед отсчётом (без флага - сразу отсчёт). */
  draft?: boolean;
  /** Можно ли игроку эту реакцию (наборы из магазина). Без проверки - только базовые. */
  canReact?: (userId: number, emoji: string) => Promise<boolean>;
  /** Часы и таймеры (по умолчанию настоящие). */
  clock?: ServerClock;
  /** Только часы (тесты менеджера с фейковыми таймерами vitest). */
  now?: () => number;
  newId?: () => string;
  rng?: Rng;
}

export type Result<T> = ({ ok: true } & T) | GameFailure;

interface Entry {
  state: GameState;
  queue: Promise<unknown>;
  timer: unknown;
  evictTimer: unknown;
  /** Что видели игроки - подгружается перед выбором вопросов. */
  seen: Map<string, number> | null;
  invite: Promise<PreparedInvite | null> | null;
  /** Повтор подсчёта итогов после сбоя базы. */
  settleTimer: unknown;
  settleAttempts: number;
  /** Какие уведомления по этой партии уже отправлены (kind:userId) - каждое не больше одного раза. */
  alerted: Set<string>;
  /** Уведомления, которые ждут ALERT_DELAY_MS: вдруг игрок сейчас вернётся (kind:userId). */
  alertsDue: Set<string>;
  /** Подготовленные карточки результата по игрокам (Telegram хранит их сутки). */
  shared: Map<number, Promise<PreparedInvite | null>>;
}

/** Лимит создания игр на игрока. */
export const CREATE_LIMIT = { max: 10, windowMs: 60_000 } as const;
/** Сколько держим завершённую партию в памяти (её итоги ещё могут запросить). */
const KEEP_FINISHED_MS = 10 * 60_000;
/**
 * Как часто чистим память об игроках, которых сейчас нет ни в сети, ни в партиях в памяти:
 * карточки, темы «Микса», отметки реакций и созданий игр. Иначе карты росли бы с числом всех игроков.
 */
export const SWEEP_MS = 10 * 60_000;
/** Запас, с которым переиспользуем подготовленное приглашение. */
const INVITE_MARGIN_MS = 5 * 60_000;
/**
 * Через сколько после ухода игрока бот ему пишет. Короткий обрыв сети, смена Wi-Fi на мобильную сеть
 * и перезапуск сервера при выкатке - клиент переподключается за несколько секунд, и сообщение
 * «Вернитесь» в такие моменты было бы ложным. Отсчёт до технического поражения от этого не меняется.
 */
export const ALERT_DELAY_MS = 10_000;
/** Повтор подсчёта итогов, если база не ответила: через 2, 4, 8… с, не больше 10 попыток. */
const SETTLE_RETRY = { firstMs: 2_000, maxMs: 60_000, attempts: 10 } as const;

const fail = (error: GameErrorCode, extra: Partial<GameFailure> = {}): GameFailure => ({ ok: false, error, ...extra });

/** Ошибки машины → коды протокола. */
/** Фазы до первого вопроса: игроки ещё ничего не сыграли. */
const BEFORE_PLAY: readonly GameState['phase'][] = ['waiting', 'lobby', 'draft', 'countdown'];

function mapError(error: GameError): GameErrorCode {
  switch (error) {
    case 'taken':
    case 'finished':
    case 'expired':
    case 'cancelled':
    case 'not_participant':
    case 'wrong_phase':
    case 'not_creator':
    case 'wrong_question':
    case 'bad_option':
    case 'late':
    case 'rematch_unavailable':
    case 'opponent_left':
    case 'rematch_closed':
      return error;
    default:
      return 'wrong_phase';
  }
}

export class GameManager {
  private readonly games = new Map<string, Entry>();
  /** userId → партия, в которой игрок сейчас (лобби или идущая дуэль). */
  private readonly current = new Map<number, string>();
  /** userId → число открытых подключений. */
  private readonly online = new Map<number, number>();
  /**
   * userId → завершённая партия, итоги которой игрок может сейчас смотреть.
   * По ней реванш узнаёт, на связи ли соперник; уход на главную или в другую игру её снимает.
   */
  private readonly lastResults = new Map<number, string>();
  /** userId → партия, которая закончилась, пока игрок был не в сети: при входе он увидит её итоги. */
  private readonly missedResults = new Map<number, string>();
  /** Что видели игроки - для партии, которая создаётся прямо сейчас (реванш). */
  private readonly pendingSeen = new Map<string, Map<string, number>>();
  private readonly cardCache = new Map<number, UserCard>();
  private readonly creates = new Map<number, number[]>();
  /** userId → когда игрок последний раз отправил реакцию (кулдаун 2 с). */
  private readonly reacted = new Map<number, number>();
  /** Быстрая игра: кто ищет соперника, с какого времени и с каким рейтингом (порядок вставки = кто раньше встал). */
  private readonly queue = new Map<number, { since: number; rating: number }>();
  /** Игроки, для которых прямо сейчас создаётся партия (из очереди уже вынуты, но пара ещё не сложилась). */
  private readonly pairing = new Map<number, { since: number; rating: number }>();
  private queueTimer: unknown = null;
  private sweepTimer: unknown = null;
  /** Подбор идёт строго по одному: два прохода не создадут две партии на одного игрока. */
  private matching: Promise<unknown> = Promise.resolve();
  /** Очередь действий игрока, которые ведут его в партию (см. exclusive). */
  private readonly userLocks = new Map<number, Promise<void>>();
  private readonly deps: MachineDeps;
  private readonly now: () => number;
  private readonly clock: ServerClock;
  private stopped = false;
  /**
   * Сервер останавливается: отключения сокетов в этот момент - не уход игроков,
   * их не записываем, иначе после перезапуска у кого-то шёл бы отсчёт до техпоражения.
   */
  private shuttingDown = false;
  /** Темы «Микса» по игрокам - загружаются перед стартом партии (deps машины синхронные). */
  private readonly mixTopics = new Map<number, readonly Category[]>();
  /** Вызовы друзьям: id игры → кого вызвали (для встречного вызова). */
  private readonly challenges = new Map<string, number>();
  private readonly pairLocks = new Map<string, Promise<void>>();
  /** Отложенные уведомления бота (ALERT_DELAY_MS). */
  private readonly alertTimers = new Set<unknown>();

  constructor(private readonly d: ManagerDeps) {
    this.clock = d.clock ?? (d.now ? { ...realClock, now: d.now } : realClock);
    this.now = () => this.clock.now();
    const rng = d.rng ?? secureRng;
    this.deps = {
      correctOf: (id) => {
        const q = d.bank.byId.get(id);
        if (!q) throw new Error(`вопрос ${id} не найден в базе`);
        return q.correct;
      },
      pickQuestions: (state) =>
        pickQuestions({
          bank: d.bank,
          category: state.category,
          seen: this.games.get(state.id)?.seen ?? this.pendingSeen.get(state.id) ?? new Map(),
          rng,
          count: machine.rulesOf(state).count,
          // Тренировка «Микс» - из всех тем игрока (базовые + купленные), дуэль - из выбранных в драфте.
          topics: machine.draftTopics(state) ?? (state.category === 'mix' && state.mode === 'solo' ? this.mixPool(state.creator.userId) : undefined),
        }),
      ...(d.draft
        ? {
            draftOffers: (state: GameState) =>
              draftOffers(
                machine.participants(state).map((p) => this.mixPool(p.userId)),
                DRAFT.offers,
                rng,
              ),
          }
        : {}),
    };
  }

  // -------------------------------------------------------------------------
  // Запуск и остановка

  /** Поднимает незавершённые партии из базы. Игроки считаются офлайн, пока не подключатся. */
  async restore(): Promise<number> {
    const states = await this.d.repo.loadUnfinished();
    const now = this.now();
    await this.refreshCards(states.flatMap((s) => machine.participants(s).map((p) => p.userId)));
    for (const saved of states) {
      const entry = this.adopt(saved);
      await this.run(entry, async () => {
        for (const p of machine.participants(entry.state)) {
          await this.apply(entry, machine.setPresence(entry.state, p.userId, this.isOnline(p.userId), now));
        }
        // Просроченные за время простоя фазы закрываются сразу, по порядку.
        await this.apply(entry, machine.tick(entry.state, now, this.deps));
      });
    }
    // Партии, закончившиеся прямо перед падением: итоги ещё не посчитаны - считаем сейчас.
    const unsettled = await this.d.repo.loadUnsettled().catch((error: unknown) => {
      this.d.log.error({ err: error }, 'unsettled games load failed');
      return [] as GameState[];
    });
    for (const saved of unsettled) {
      if (this.games.has(saved.id)) continue;
      await this.refreshCards(machine.participants(saved).map((p) => p.userId));
      const entry = this.adopt(saved);
      this.scheduleEvict(entry);
      await this.run(entry, async () => {
        if (!(await this.settleNow(entry))) this.scheduleSettleRetry(entry);
        else this.notifyAll(entry);
      });
    }
    return states.length;
  }

  stop() {
    this.stopped = true;
    if (this.queueTimer) this.clock.clearTimeout(this.queueTimer);
    this.queueTimer = null;
    for (const timer of this.alertTimers) this.clock.clearTimeout(timer);
    this.alertTimers.clear();
    if (this.sweepTimer) this.clock.clearTimeout(this.sweepTimer);
    this.sweepTimer = null;
    for (const entry of this.games.values()) {
      if (entry.timer) this.clock.clearTimeout(entry.timer);
      if (entry.evictTimer) this.clock.clearTimeout(entry.evictTimer);
      if (entry.settleTimer) this.clock.clearTimeout(entry.settleTimer);
      entry.timer = null;
      entry.evictTimer = null;
      entry.settleTimer = null;
    }
  }

  /**
   * Корректная остановка (SIGTERM при выкатке): таймеры стоп, присутствие игроков
   * больше не меняется, ждём, пока допишутся уже начатые изменения партий.
   * Вызывать до закрытия сокетов и базы.
   */
  async shutdown(): Promise<void> {
    this.shuttingDown = true;
    this.stop();
    await Promise.all([...this.games.values()].map((entry) => entry.queue));
  }

  // -------------------------------------------------------------------------
  // Подключения

  async connect(userId: number): Promise<string | null> {
    if (this.shuttingDown) return null;
    this.scheduleSweep();
    const count = (this.online.get(userId) ?? 0) + 1;
    this.online.set(userId, count);
    await this.refreshCards([userId]);
    const gameId = this.current.get(userId) ?? null;
    if (count === 1 && gameId) await this.presence(userId, gameId, true);
    const results = this.lastResults.get(userId);
    if (count === 1 && results && results !== gameId) await this.presence(userId, results, true);
    return gameId;
  }

  async disconnect(userId: number): Promise<void> {
    if (this.shuttingDown) return;
    const count = (this.online.get(userId) ?? 1) - 1;
    if (count > 0) {
      this.online.set(userId, count);
      return;
    }
    this.online.delete(userId);
    // Закрыл приложение во время поиска - из очереди вышел.
    this.unqueue(userId);
    const gameId = this.current.get(userId);
    if (gameId) await this.presence(userId, gameId, false);
    // На итогах: соперник видит «Соперник вышел», реванш ему не предложить.
    const results = this.lastResults.get(userId);
    if (results && results !== gameId) await this.presence(userId, results, false);
  }

  isOnline(userId: number) {
    return (this.online.get(userId) ?? 0) > 0;
  }

  /**
   * Игрок поменял язык в настройках: перечитываем его карточку и пересылаем ему снимок
   * текущей партии и итогов, где он ещё сидит, - вопрос и варианты придут уже на новом языке.
   * Соперник ничего не получает: его язык не менялся. Снимок не меняет rev и состояние партии.
   */
  async userChanged(userId: number): Promise<void> {
    await this.refreshCards([userId]);
    const ids = new Set([this.current.get(userId), this.lastResults.get(userId)].filter((id): id is string => Boolean(id)));
    for (const id of ids) {
      const entry = this.games.get(id);
      if (!entry) continue;
      // Через очередь партии: снимок не обгонит параллельный переход фазы.
      await this.run(entry, async () => {
        const view = this.viewOf(entry.state, userId);
        if (view) this.d.notify.state(userId, view);
      });
    }
  }

  currentGameOf(userId: number): string | null {
    return this.current.get(userId) ?? null;
  }

  /** Для админки: сколько игроков в сети и сколько из них в партии. */
  liveCounts(): { online: number; inGame: number } {
    let online = 0;
    let inGame = 0;
    for (const [userId, n] of this.online) {
      if (n <= 0) continue;
      online += 1;
      if (this.presenceOf(userId) === 'ingame') inGame += 1;
    }
    return { online, inGame };
  }

  /** Для экрана друзей: в сети, в партии или не в сети. */
  presenceOf(userId: number): 'online' | 'ingame' | 'offline' {
    if (!this.isOnline(userId)) return 'offline';
    const id = this.current.get(userId);
    const phase = id ? this.games.get(id)?.state.phase : undefined;
    return phase && ACTIVE_PHASES.includes(phase) ? 'ingame' : 'online';
  }

  /**
   * Завершённая партия, итоги которой игрок ещё не закрыл («На главную», другая игра).
   * Закрыл приложение посреди дуэли, а она закончилась без него - при входе он увидит итоги.
   */
  resultsOf(userId: number): string | null {
    const id = this.missedResults.get(userId);
    const entry = id ? this.games.get(id) : undefined;
    if (!id || !entry || entry.state.phase !== 'finished' || this.lastResults.get(userId) !== id) return null;
    return machine.playerOf(entry.state, userId)?.left ? null : id;
  }

  private async presence(userId: number, gameId: string, online: boolean) {
    const entry = this.games.get(gameId);
    if (!entry) return;
    await this.run(entry, () => this.apply(entry, machine.setPresence(entry.state, userId, online, this.now())));
  }

  // -------------------------------------------------------------------------
  // Лобби

  create(userId: number, category: GameCategory, rules?: GameRules): Promise<Result<{ game: GameView }>> {
    return this.exclusive(userId, () => this.createNow(userId, category, rules));
  }

  private async createNow(userId: number, category: GameCategory, rules?: GameRules): Promise<Result<{ game: GameView }>> {
    this.unqueue(userId);
    if (!this.allowCreate(userId)) return fail('rate_limited');
    const card = await this.card(userId);
    if (!card) return fail('internal');
    if (card.banned) return fail('banned');
    if (card.docsVersion !== this.d.docsVersion) return fail('consent_required');
    if (!(await this.topicOpen(userId, category))) return fail('locked');

    const busy = await this.releaseOpenGame(userId, null);
    if (busy) return busy;

    let state: GameState | null = null;
    for (let attempt = 0; attempt < 3 && !state; attempt++) {
      const id = (this.d.newId ?? newGameId)();
      if (this.games.has(id) || (await this.d.repo.load(id))) continue;
      state = machine.createGame({ id, mode: 'link', category, creatorId: userId, rules }, this.now(), this.deps);
    }
    if (!state) return fail('internal');

    // Сначала база: ссылка должна работать и после перезапуска сервера.
    try {
      await this.d.repo.save(state);
    } catch (error) {
      this.d.log.error({ err: error, gameId: state.id }, 'game create failed');
      return fail('internal');
    }
    const entry = this.adopt(state);
    this.current.set(userId, state.id);
    this.schedule(entry);
    // Карточку для shareMessage готовим заранее, чтобы «Пригласить» срабатывало сразу.
    void this.invite(userId, state.id).catch(() => undefined);
    return { ok: true, game: this.viewOf(entry.state, userId)! };
  }

  /**
   * Вызов другу из вкладки «Друзья». Если друг уже вызвал меня и его вызов ждёт ответа -
   * встречный вызов не создаём (challenged + его вызов): игрок принимает чужой, а не плодит второе
   * лобби. Вызовы одной пары идут строго по очереди, чтобы одновременные нажатия не разминулись.
   */
  async challenge(userId: number, friendId: number, category: GameCategory, rules?: GameRules): Promise<Result<{ game: GameView }>> {
    const key = userId < friendId ? `${userId}:${friendId}` : `${friendId}:${userId}`;
    const prev = this.pairLocks.get(key) ?? Promise.resolve();
    const run = prev.then(async (): Promise<Result<{ game: GameView }>> => {
      const theirsId = this.current.get(friendId);
      const theirs = theirsId ? this.games.get(theirsId) : undefined;
      if (
        theirsId &&
        theirs &&
        this.challenges.get(theirsId) === userId &&
        theirs.state.creator.userId === friendId &&
        theirs.state.phase === 'waiting' &&
        !theirs.state.opponent
      ) {
        const s = theirs.state;
        return fail('challenged', {
          challenge: { gameId: s.id, category: s.category, rules: machine.rulesOf(s), expiresAt: s.lobbyExpiresAt ?? this.now() + TIMINGS.lobbyTtlMs },
        });
      }
      const created = await this.create(userId, category, rules);
      if (created.ok) this.challenges.set(created.game.id, friendId);
      return created;
    });
    const tail: Promise<void> = run
      .then(
        () => undefined,
        () => undefined,
      )
      .then(() => {
        if (this.pairLocks.get(key) === tail) this.pairLocks.delete(key);
      });
    this.pairLocks.set(key, tail);
    return run;
  }

  /**
   * Inline-режим: «@бот» в любом чате → карточка «Вызов на дуэль». Если у игрока уже открыто
   * своё лобби, где ещё ждут соперника, карточка ведёт в него (Telegram шлёт запрос на каждую
   * букву - новые игры на каждый запрос не создаются). Иначе - новая игра «Микс».
   * Посреди партии или когда в лобби уже есть соперник - busy (лобби с соперником не трогаем).
   */
  async inlineChallenge(userId: number): Promise<Result<{ gameId: string; link: string; category: GameCategory; rules: GameRules; reused: boolean }>> {
    const card = await this.card(userId);
    if (!card) return fail('internal');
    if (card.banned) return fail('banned');
    if (card.docsVersion !== this.d.docsVersion) return fail('consent_required');

    const currentId = this.current.get(userId);
    const cur = currentId ? this.games.get(currentId) : undefined;
    if (currentId && cur && machine.playerOf(cur.state, userId) && !FINAL_PHASES.includes(cur.state.phase)) {
      const s = cur.state;
      if (s.phase === 'waiting' && s.creator.userId === userId && s.mode === 'link') {
        return { ok: true, gameId: s.id, link: gameLink(this.d.appUrl, s.id), category: s.category, rules: machine.rulesOf(s), reused: true };
      }
      return fail('busy', { busyGameId: currentId });
    }

    const created = await this.create(userId, 'mix');
    if (!created.ok) return created;
    const entry = this.games.get(created.game.id)!;
    // Игру создали из чата, а не из приложения: создателя в лобби пока нет.
    if (!this.isOnline(userId)) {
      await this.run(entry, () => this.apply(entry, machine.setPresence(entry.state, userId, false, this.now())));
    }
    return {
      ok: true,
      gameId: entry.state.id,
      link: gameLink(this.d.appUrl, entry.state.id),
      category: entry.state.category,
      rules: machine.rulesOf(entry.state),
      reused: false,
    };
  }

  /** Вход по ссылке. Участник получает снимок своей партии в любой фазе. */
  join(userId: number, gameId: string): Promise<Result<{ game: GameView }>> {
    return this.exclusive(userId, () => this.joinNow(userId, gameId));
  }

  private async joinNow(userId: number, gameId: string): Promise<Result<{ game: GameView }>> {
    const entry = await this.entry(gameId);
    if (!entry) return fail('not_found');
    const peek = entry.state;

    if (machine.playerOf(peek, userId)) {
      if (!FINAL_PHASES.includes(peek.phase)) {
        const busy = await this.releaseOpenGame(userId, gameId);
        if (busy) return busy;
        this.current.set(userId, gameId);
      }
      return { ok: true, game: this.viewOf(peek, userId)! };
    }

    // Мёртвая или занятая ссылка - сразу ответ, без шторки с документами.
    const dead = machine.join(peek, userId, this.now());
    if (!dead.ok) return fail(mapError(dead.error));

    const card = await this.card(userId);
    if (!card) return fail('internal');
    if (card.banned) return fail('banned');
    if (card.docsVersion !== this.d.docsVersion) {
      const inviter = this.cardCache.get(peek.creator.userId);
      return fail('consent_required', inviter ? { inviter: { userId: inviter.id, ...this.profile(inviter) } } : {});
    }

    const busy = await this.releaseOpenGame(userId, gameId);
    if (busy) return busy;
    this.unqueue(userId);

    return this.run(entry, async () => {
      // Повторная проверка внутри очереди: из двух одновременных входов место получит один.
      const step = machine.join(entry.state, userId, this.now());
      if (!step.ok) return fail(mapError(step.error));
      this.current.set(userId, gameId);
      await this.apply(entry, step);
      return { ok: true as const, game: this.viewOf(entry.state, userId)! };
    });
  }

  async sync(userId: number, gameId?: string): Promise<Result<{ game: GameView | null }>> {
    const id = gameId ?? this.current.get(userId);
    if (!id) return { ok: true, game: null };
    const entry = await this.entry(id);
    const view = entry ? this.viewOf(entry.state, userId) : null;
    if (!view) return gameId ? fail(entry ? 'not_participant' : 'not_found') : { ok: true, game: null };
    // Итоги, пропущенные без связи, игрок увидел.
    if (this.missedResults.get(userId) === id) this.missedResults.delete(userId);
    return { ok: true, game: view };
  }

  async ready(userId: number, gameId: string, ready: boolean): Promise<Result<{ game: GameView }>> {
    const entry = await this.entry(gameId);
    if (!entry) return fail('not_found');
    return this.run(entry, async () => {
      const s = entry.state;
      if (!machine.playerOf(s, userId)) return fail('not_participant');
      const other = machine.otherOf(s, userId);
      // Этот «Готов» запустит отсчёт.
      const starts = ready && s.phase === 'lobby' && Boolean(other?.ready);
      if (starts && other) {
        // Заранее узнаём, какие вопросы игроки уже видели.
        entry.seen = await this.d.repo.seenQuestions([s.creator.userId, other.userId]).catch((error: unknown) => {
          this.d.log.warn({ err: error, gameId }, 'seen questions failed');
          return new Map<string, number>();
        });
        if (s.category === 'mix') await this.loadMixTopics([s.creator.userId, other.userId]);
        // Платная тема: билет создателя списывается до отсчёта, а не «вдогонку» после него - иначе при сбое
        // базы партия шла бы бесплатно. Отсчёт не состоялся (отмена, истёкшее лобби) - билет вернётся (apply).
        const charge = await this.chargeTopic(s.creator.userId, s.category, s.id);
        if (charge !== 'ok') return fail(charge === 'none' ? 'locked' : 'internal');
      }
      const step = machine.setReady(entry.state, userId, ready, this.now(), this.deps);
      if (!step.ok) {
        if (starts) this.refundTopic(s.creator.userId, s.category, s.id);
        return fail(mapError(step.error));
      }
      await this.apply(entry, step);
      return { ok: true as const, game: this.viewOf(entry.state, userId)! };
    });
  }

  async cancel(userId: number, gameId: string): Promise<Result<{ game: GameView }>> {
    return this.mutate(userId, gameId, async (entry) => machine.cancel(entry.state, userId));
  }

  /**
   * «Выйти из лобби»: соперник освобождает место, создатель отменяет игру.
   * С экрана итогов: игрок ушёл, реванш ему больше не предложить (ждущее предложение закрывается).
   */
  async leave(userId: number, gameId: string): Promise<Result<object>> {
    const entry = await this.entry(gameId);
    if (!entry) return fail('not_found');
    return this.run(entry, async () => {
      const s = entry.state;
      if (!machine.playerOf(s, userId)) return fail('not_participant');
      if (FINAL_PHASES.includes(s.phase)) {
        if (this.lastResults.get(userId) === gameId) this.lastResults.delete(userId);
        if (s.phase === 'finished') await this.apply(entry, machine.leaveResults(s, userId));
        return { ok: true as const };
      }
      const step = s.creator.userId === userId ? machine.cancel(s, userId) : machine.leaveLobby(s, userId, this.now());
      if (!step.ok) return fail(mapError(step.error));
      await this.apply(entry, step, { seatFreed: 'left' });
      return { ok: true as const };
    });
  }

  /** Ссылка и id подготовленного сообщения для shareMessage. Только создатель и только пока ждём соперника. */
  async invite(userId: number, gameId: string): Promise<Result<InviteResult>> {
    const entry = await this.entry(gameId);
    if (!entry) return fail('not_found');
    const s = entry.state;
    if (s.creator.userId !== userId) return fail(machine.playerOf(s, userId) ? 'not_creator' : 'not_participant');
    if (!OPEN_PHASES.includes(s.phase)) return fail('wrong_phase');

    const link = gameLink(this.d.appUrl, gameId);
    if (!this.d.invites) return { ok: true, link, preparedMessageId: null };

    const cached = entry.invite ? await entry.invite : null;
    if (cached && cached.expiresAt - this.now() > INVITE_MARGIN_MS) return { ok: true, link, preparedMessageId: cached.id };

    // Промис кладём сразу, до первого await: параллельный запрос дождётся этого же сообщения.
    const invites = this.d.invites;
    entry.invite = (async () => {
      const card = await this.card(userId);
      return invites.prepare({
        userId,
        gameId,
        link,
        category: s.category,
        rules: machine.rulesOf(s),
        lang: card?.lang ?? 'en',
        creatorName: card?.name ?? '',
      });
    })().catch((error: unknown) => {
      this.d.log.warn({ err: error, gameId }, 'prepared invite failed');
      return null;
    });
    const prepared = await entry.invite;
    return { ok: true, link, preparedMessageId: prepared?.id ?? null };
  }

  /**
   * Тренировка: одиночная партия из 10 вопросов на том же движке (таймер 15 с, очки за скорость),
   * без рейтинга. Вопрос закрывается сразу после ответа. Пока идёт дуэль или открыто своё лобби
   * (кто-то может прийти по ссылке) - busy: в двух партиях сразу играть нельзя.
   */
  soloStart(userId: number, category: GameCategory): Promise<Result<{ game: GameView }>> {
    return this.exclusive(userId, () => this.soloStartNow(userId, category));
  }

  private async soloStartNow(userId: number, category: GameCategory): Promise<Result<{ game: GameView }>> {
    this.unqueue(userId);
    if (!this.allowCreate(userId)) return fail('rate_limited');
    const card = await this.card(userId);
    if (!card) return fail('internal');
    if (card.banned) return fail('banned');
    if (card.docsVersion !== this.d.docsVersion) return fail('consent_required');
    if (!(await this.topicOpen(userId, category))) return fail('locked');
    if (category === 'mix') await this.loadMixTopics([userId]);

    const currentId = this.current.get(userId);
    const cur = currentId ? this.games.get(currentId) : undefined;
    if (currentId && cur && machine.playerOf(cur.state, userId) && !FINAL_PHASES.includes(cur.state.phase)) {
      return fail('busy', { busyGameId: currentId });
    }
    // С итогов дуэли - в тренировку: реванш этому игроку больше не предложить.
    const busy = await this.releaseOpenGame(userId, null);
    if (busy) return busy;

    let id: string | null = null;
    for (let attempt = 0; attempt < 3 && !id; attempt++) {
      const candidate = (this.d.newId ?? newGameId)();
      if (!this.games.has(candidate) && !(await this.d.repo.load(candidate))) id = candidate;
    }
    if (!id) return fail('internal');

    // Тренировка начинается сразу, поэтому билет на платную тему списывается до её создания: проверка
    // выше только заглядывает в базу, и два запроса подряд прошли бы её оба с одним билетом.
    const charge = await this.chargeTopic(userId, category, id);
    if (charge !== 'ok') return fail(charge === 'none' ? 'locked' : 'internal');

    const [seen, soloBest] = await Promise.all([
      this.d.repo.seenQuestions([userId]).catch(() => new Map<string, number>()),
      this.d.repo.soloBest(userId, category).catch(() => null),
    ]);
    const now = this.now();
    this.pendingSeen.set(id, seen);
    let state: GameState;
    try {
      state = machine.createGame({ id, mode: 'solo', category, creatorId: userId, soloBest }, now, this.deps);
    } finally {
      this.pendingSeen.delete(id);
    }
    try {
      // startedAt - чтобы вопросы тренировки учитывались как «уже виденные» и в следующих партиях.
      await this.d.repo.save(state, { startedAt: now });
    } catch (error) {
      this.d.log.error({ err: error, gameId: id }, 'solo create failed');
      this.refundTopic(userId, category, id);
      return fail('internal');
    }
    const entry = this.adopt(state);
    entry.seen = seen;
    this.schedule(entry);
    return { ok: true, game: this.viewOf(entry.state, userId)! };
  }

  // -------------------------------------------------------------------------
  // Партия

  /**
   * Ответ на текущий вопрос. Время считает сервер: от старта вопроса до этой
   * минуты по его часам, клиентские метки не принимаются. Повтор (двойной тап,
   * повторная отправка после переподключения) идемпотентен: засчитан первый ответ,
   * повтор возвращает accepted: false и ничего не меняет.
   */
  async answer(userId: number, gameId: string, questionIndex: number, optionIndex: number): Promise<Result<AnswerResult>> {
    // Время фиксируем по приходу события, а не когда до него дойдёт очередь партии.
    const at = this.now();
    const entry = await this.entry(gameId);
    if (!entry) return fail('not_found');
    return this.run(entry, async () => {
      if (!machine.playerOf(entry.state, userId)) return fail('not_participant');
      const step = machine.answer(entry.state, userId, questionIndex, optionIndex, at, this.deps);
      if (!step.ok) {
        if (step.error === 'already_answered') return { ok: true as const, accepted: false, game: this.viewOf(entry.state, userId)! };
        return fail(mapError(step.error));
      }
      await this.apply(entry, step);
      return { ok: true as const, accepted: true, game: this.viewOf(entry.state, userId)! };
    });
  }

  /** «Микс»: выбор темы из трёх выпавших. */
  async draft(userId: number, gameId: string, category: Category): Promise<Result<{ game: GameView }>> {
    return this.mutate(userId, gameId, async (entry) => machine.pickTopic(entry.state, userId, category, this.now()));
  }

  /** «Выйти из партии»: сразу техническая победа сопернику, без 30 с ожидания. */
  async forfeit(userId: number, gameId: string): Promise<Result<{ game: GameView }>> {
    return this.mutate(userId, gameId, async (entry) => machine.forfeit(entry.state, userId, this.now()));
  }

  // -------------------------------------------------------------------------
  // Быстрая игра

  /**
   * Встать в очередь быстрой игры. Подбор - по рейтингу: окно ±100, шире на 50 каждые 5 с
   * (пара подходит, если разница рейтингов в окне хотя бы одного из двоих). Найденные сразу
   * попадают в обычное лобби «Микс» с «Готов» - дальше это обычная рейтинговая дуэль.
   * Через 60 с - queue:timeout. Посреди партии или в открытом лобби - busy.
   */
  queueJoin(userId: number): Promise<Result<QueueJoined>> {
    return this.exclusive(userId, () => this.queueJoinNow(userId));
  }

  private async queueJoinNow(userId: number): Promise<Result<QueueJoined>> {
    const card = await this.card(userId);
    if (!card) return fail('internal');
    if (card.banned) return fail('banned');
    if (card.docsVersion !== this.d.docsVersion) return fail('consent_required');
    const currentId = this.current.get(userId);
    const cur = currentId ? this.games.get(currentId) : undefined;
    if (currentId && cur && machine.playerOf(cur.state, userId) && !FINAL_PHASES.includes(cur.state.phase)) {
      return fail('busy', { busyGameId: currentId });
    }
    if (!this.isOnline(userId)) return fail('internal');
    const known = this.queue.get(userId);
    if (known) return { ok: true, since: known.since, rating: known.rating };
    // С итогов дуэли - в поиск: реванш этому игроку больше не предложить.
    await this.releaseOpenGame(userId, null);
    const entry = { since: this.now(), rating: card.rating };
    this.queue.set(userId, entry);
    await this.matchQueue();
    this.scheduleQueue();
    return { ok: true, since: entry.since, rating: entry.rating };
  }

  queueLeave(userId: number): Result<object> {
    this.unqueue(userId);
    return { ok: true };
  }

  isQueued(userId: number) {
    return this.queue.has(userId);
  }

  /** Игрок вышел из очереди (сам, ушёл в другую игру, отключился) - в том числе если его пара как раз складывается. */
  private unqueue(userId: number) {
    this.queue.delete(userId);
    this.pairing.delete(userId);
  }

  private scheduleQueue() {
    if (this.queueTimer || this.stopped || this.queue.size === 0) return;
    this.queueTimer = this.clock.setTimeout(() => {
      this.queueTimer = null;
      // Сбой прохода уже записан в журнал (matchQueue). Здесь его надо поймать: .finally() отдаёт
      // новый промис с тем же отказом, и без catch он завершил бы процесс.
      this.matchQueue()
        .finally(() => this.scheduleQueue())
        .catch(() => undefined);
    }, QUEUE.tickMs);
    (this.queueTimer as { unref?: () => void } | null)?.unref?.();
  }

  /** Один проход подбора: таймауты, потом пары - кто раньше встал, тому ближайший по рейтингу. */
  private matchQueue(): Promise<void> {
    const pass = this.matching.then(async () => {
      const now = this.now();
      for (const [userId, q] of [...this.queue]) {
        if (now - q.since >= QUEUE.timeoutMs) {
          this.queue.delete(userId);
          this.d.notify.queue?.(userId, { type: 'timeout' });
        }
      }
      const waiting = [...this.queue];
      const taken = new Set<number>();
      for (const [a, qa] of waiting) {
        if (taken.has(a)) continue;
        let best: [number, number] | null = null;
        for (const [b, qb] of waiting) {
          if (b === a || taken.has(b)) continue;
          const diff = Math.abs(qa.rating - qb.rating);
          if (diff > Math.max(queueRange(now - qa.since), queueRange(now - qb.since))) continue;
          if (!best || diff < best[1]) best = [b, diff];
        }
        if (!best) continue;
        taken.add(a);
        taken.add(best[0]);
        await this.startQuick(a, best[0]);
      }
    });
    this.matching = pass.catch((error: unknown) => this.d.log.error({ err: error }, 'queue match failed'));
    return pass;
  }

  /** Пара найдена: обычное лобби «Микс» на двоих, «Готов» ещё не нажат. */
  private async startQuick(a: number, b: number) {
    // Пока шёл подбор, кто-то мог уйти из очереди.
    const qa = this.queue.get(a);
    const qb = this.queue.get(b);
    if (!qa || !qb) return;
    this.queue.delete(a);
    this.queue.delete(b);
    this.pairing.set(a, qa);
    this.pairing.set(b, qb);
    let state: GameState;
    try {
      let id: string | null = null;
      for (let attempt = 0; attempt < 3 && !id; attempt++) {
        const candidate = (this.d.newId ?? newGameId)();
        if (!this.games.has(candidate) && !(await this.d.repo.load(candidate))) id = candidate;
      }
      if (!id) throw new Error('no free game id');
      // Кто встал раньше - «создатель» (на экране это ни на что не влияет).
      state = machine.createGame({ id, mode: 'quick', category: 'mix', creatorId: a, opponentId: b }, this.now(), this.deps);
      await this.d.repo.save(state);
    } catch (error) {
      // База не ответила: пара не сложилась. Игроки возвращаются в очередь с прежним временем входа
      // (кроме тех, кто за это время сам вышел) - следующий проход попробует снова.
      this.d.log.error({ err: error }, 'quick game create failed');
      for (const userId of [a, b]) {
        const q = this.pairing.get(userId);
        if (q && !this.queue.has(userId)) this.queue.set(userId, q);
      }
      return;
    } finally {
      this.pairing.delete(a);
      this.pairing.delete(b);
    }
    const entry = this.adopt(state);
    this.schedule(entry);
    this.notifyAll(entry);
    for (const userId of [a, b]) this.d.notify.queue?.(userId, { type: 'matched', gameId: state.id });
  }

  /**
   * «Поделиться результатом»: карточка в чат с итогом дуэли глазами этого игрока и кнопкой
   * «Сыграть со мной» (открывает мини-апп). Состояние партии не меняет - реванш остаётся доступен.
   */
  async share(userId: number, gameId: string): Promise<Result<ShareResult>> {
    const entry = await this.entry(gameId);
    if (!entry) return fail('not_found');
    const s = entry.state;
    const me = machine.playerOf(s, userId);
    if (!me) return fail('not_participant');
    const opp = machine.otherOf(s, userId);
    const outcome = machine.outcomeFor(s, userId);
    if (s.phase !== 'finished' || s.mode === 'solo' || !opp || !outcome) return fail('wrong_phase');
    const link = this.d.appUrl;
    const sharer = this.d.sharer;
    if (!sharer) return { ok: true, preparedMessageId: null, link };

    const cached = entry.shared.get(userId);
    const known = cached ? await cached : null;
    if (known && known.expiresAt - this.now() > INVITE_MARGIN_MS) return { ok: true, preparedMessageId: known.id, link };
    const job = (async () => {
      const card = await this.card(userId);
      return sharer.prepare({
        userId,
        gameId,
        lang: card?.lang ?? 'en',
        outcome,
        me: me.score,
        opp: opp.score,
        opponent: this.cardCache.get(opp.userId)?.name ?? '',
        link,
      });
    })().catch((error: unknown) => {
      this.d.log.warn({ err: error, gameId }, 'prepared result failed');
      return null;
    });
    entry.shared.set(userId, job);
    const prepared = await job;
    return { ok: true, preparedMessageId: prepared?.id ?? null, link };
  }

  /**
   * Реакция сопернику. Состояние партии не меняет и в базу не пишется: это мгновенное
   * сообщение обоим участникам. В любой фазе партии на двоих (REACTION_PHASES), не чаще раза в 2 с.
   */
  async react(userId: number, gameId: string, emoji: Reaction): Promise<Result<object>> {
    const entry = await this.entry(gameId);
    if (!entry) return fail('not_found');
    const s = entry.state;
    if (!machine.playerOf(s, userId)) return fail('not_participant');
    if (s.mode === 'solo' || !s.opponent || !REACTION_PHASES.includes(s.phase)) return fail('wrong_phase');
    const allowed = this.d.canReact ? await this.d.canReact(userId, emoji) : (REACTIONS as readonly string[]).includes(emoji);
    if (!allowed) return fail('invalid');
    const now = this.now();
    const last = this.reacted.get(userId);
    if (last !== undefined && now - last < REACTION_COOLDOWN_MS) return fail('rate_limited');
    this.reacted.set(userId, now);
    const event: ReactionEvent = { gameId, userId, emoji };
    for (const p of machine.participants(s)) this.d.notify.reaction?.(p.userId, event);
    return { ok: true };
  }

  // -------------------------------------------------------------------------
  // Реванш

  /**
   * «Реванш» на итогах. Соперник уже предложил - это согласие: оба нажали почти
   * одновременно, а партия создаётся одна (операции партии идут строго по очереди).
   */
  async rematchOffer(userId: number, gameId: string): Promise<Result<{ game: GameView }>> {
    const entry = await this.entry(gameId);
    if (!entry) return fail('not_found');
    return this.run(entry, async () => {
      const s = entry.state;
      if (!machine.playerOf(s, userId)) return fail('not_participant');
      const r = s.rematch ?? null;
      if (r?.status === 'offered' && r.by !== userId) return this.acceptRematch(entry, userId);
      // Предлагать можно, только если соперник на итогах и на связи - сверяем с реальными подключениями.
      const other = machine.otherOf(s, userId);
      if (other && !this.isOnline(other.userId)) return fail('opponent_left');
      // Реванш - новая партия: в платной теме создателю снова нужен билет (или купленная тема).
      if (!(await this.topicOpen(s.creator.userId, s.category))) return fail('locked');
      const step = machine.offerRematch(s, userId, this.now());
      if (!step.ok) return fail(mapError(step.error));
      await this.apply(entry, step);
      return { ok: true as const, game: this.viewOf(entry.state, userId)! };
    });
  }

  async rematchRespond(userId: number, gameId: string, accept: boolean): Promise<Result<{ game: GameView }>> {
    const entry = await this.entry(gameId);
    if (!entry) return fail('not_found');
    return this.run(entry, async () => {
      if (!machine.playerOf(entry.state, userId)) return fail('not_participant');
      if (accept) return this.acceptRematch(entry, userId);
      const step = machine.respondRematch(entry.state, userId, false, this.now(), null);
      if (!step.ok) return fail(mapError(step.error));
      await this.apply(entry, step);
      return { ok: true as const, game: this.viewOf(entry.state, userId)! };
    });
  }

  async rematchCancel(userId: number, gameId: string): Promise<Result<{ game: GameView }>> {
    return this.mutate(userId, gameId, async (entry) => machine.cancelRematch(entry.state, userId));
  }

  /**
   * Согласие на реванш (уже внутри очереди старой партии): новая партия той же пары,
   * в той же категории, с новыми вопросами и сразу с отсчётом - согласие обоих уже есть.
   */
  private async acceptRematch(entry: Entry, userId: number): Promise<Result<{ game: GameView }>> {
    const s = entry.state;
    const now = this.now();
    const check = machine.respondRematch(s, userId, false, now, null);
    if (!check.ok) return fail(mapError(check.error));
    const players = machine.participants(s);

    // Предложивший мог за эти секунды уйти или пропасть со связи.
    if (players.some((p) => !this.isOnline(p.userId) || p.left)) {
      await this.apply(entry, machine.rematchGone(s));
      return fail('opponent_left');
    }
    // Кто-то уже в другой партии - в двух сразу играть нельзя.
    for (const p of players) {
      const busyId = this.current.get(p.userId);
      if (busyId && busyId !== s.id && !FINAL_PHASES.includes(this.games.get(busyId)?.state.phase ?? 'finished')) {
        return fail('busy', { busyGameId: busyId });
      }
    }
    for (const p of players) {
      const card = await this.card(p.userId);
      if (!card) return fail('internal');
      if (card.banned) return fail('banned');
      if (card.docsVersion !== this.d.docsVersion) return fail('consent_required');
    }

    let id: string | null = null;
    for (let attempt = 0; attempt < 3 && !id; attempt++) {
      const candidate = (this.d.newId ?? newGameId)();
      if (!this.games.has(candidate) && !(await this.d.repo.load(candidate))) id = candidate;
    }
    if (!id) return fail('internal');

    // Реванш стартует сразу, мимо лобби и «Готов»: билет на платную тему списывается здесь же.
    // Раньше реванш темы не проверял и билет не тратил - один билет давал сколько угодно партий подряд.
    const charge = await this.chargeTopic(s.creator.userId, s.category, id);
    // Сбой базы - предложение остаётся, можно согласиться ещё раз; билета нет - реванша не будет.
    if (charge === 'failed') return fail('internal');
    if (charge === 'none') {
      await this.apply(entry, machine.rematchGone(s));
      return fail('locked');
    }

    const ids = players.map((p) => p.userId);
    const seen = await this.d.repo.seenQuestions(ids).catch((error: unknown) => {
      this.d.log.warn({ err: error, gameId: s.id }, 'seen questions failed');
      return new Map<string, number>();
    });
    this.pendingSeen.set(id, seen);
    let next: GameState;
    try {
      next = machine.createGame(
        {
          id,
          mode: 'rematch',
          category: s.category,
          creatorId: s.creator.userId,
          opponentId: s.opponent!.userId,
          startNow: true,
          rematchOf: s.id,
          // Реванш - в том же режиме и с теми же настройками.
          rules: machine.rulesOf(s),
        },
        now,
        this.deps,
      );
    } finally {
      this.pendingSeen.delete(id);
    }
    try {
      await this.d.repo.save(next, { startedAt: now });
    } catch (error) {
      this.d.log.error({ err: error, gameId: id }, 'rematch create failed');
      this.refundTopic(s.creator.userId, s.category, id);
      return fail('internal');
    }
    const nextEntry = this.adopt(next);
    nextEntry.seen = seen;
    for (const p of ids) if (this.lastResults.get(p) === s.id) this.lastResults.delete(p);
    this.schedule(nextEntry);
    // Сначала новая партия (клиент сразу переключится на отсчёт), потом пометка в старой.
    this.notifyAll(nextEntry);
    await this.apply(entry, machine.respondRematch(s, userId, true, now, id));
    return { ok: true as const, game: this.viewOf(entry.state, userId)! };
  }

  // -------------------------------------------------------------------------
  // Внутреннее

  /**
   * Перед созданием или входом в другую партию: открытое лобби игрока закрывается
   * (своё - отменяется, чужое - место освобождается), а идущая дуэль даёт busy.
   */
  private async releaseOpenGame(userId: number, targetId: string | null): Promise<GameFailure | null> {
    // Ушёл с итогов в другую игру - реванш ему больше не предложить.
    const results = this.lastResults.get(userId);
    if (results && results !== targetId) {
      this.lastResults.delete(userId);
      const done = this.games.get(results);
      if (done) await this.run(done, () => this.apply(done, machine.leaveResults(done.state, userId)));
    }
    const currentId = this.current.get(userId);
    if (!currentId || currentId === targetId) return null;
    const entry = this.games.get(currentId);
    if (!entry || !machine.playerOf(entry.state, userId)) {
      this.current.delete(userId);
      return null;
    }
    if (ACTIVE_PHASES.includes(entry.state.phase)) return fail('busy', { busyGameId: currentId });
    if (OPEN_PHASES.includes(entry.state.phase)) {
      await this.run(entry, async () => {
        const s = entry.state;
        if (!OPEN_PHASES.includes(s.phase)) return;
        const step = s.creator.userId === userId ? machine.cancel(s, userId) : machine.leaveLobby(s, userId, this.now());
        await this.apply(entry, step, { seatFreed: 'left' });
      });
    }
    if (this.current.get(userId) === currentId) this.current.delete(userId);
    return null;
  }

  private async mutate(userId: number, gameId: string, fn: (entry: Entry) => Promise<Step>): Promise<Result<{ game: GameView }>> {
    const entry = await this.entry(gameId);
    if (!entry) return fail('not_found');
    return this.run(entry, async () => {
      if (!machine.playerOf(entry.state, userId)) return fail('not_participant');
      const step = await fn(entry);
      if (!step.ok) return fail(mapError(step.error));
      await this.apply(entry, step);
      return { ok: true as const, game: this.viewOf(entry.state, userId)! };
    });
  }

  /** Партия из памяти или из базы (завершённая или после перезапуска). */
  private async entry(gameId: string): Promise<Entry | null> {
    const live = this.games.get(gameId);
    if (live) return live;
    const saved = await this.d.repo.load(gameId).catch((error: unknown) => {
      this.d.log.error({ err: error, gameId }, 'game load failed');
      return null;
    });
    if (!saved) return null;
    // Пока ждали базу, партию мог поднять параллельный запрос.
    const raced = this.games.get(gameId);
    if (raced) return raced;
    await this.refreshCards(machine.participants(saved).map((p) => p.userId));
    const entry = this.adopt(saved);
    if (FINAL_PHASES.includes(saved.phase)) {
      this.scheduleEvict(entry);
      // Снимок из базы помнит, кто был на связи в момент записи; реваншу нужно «сейчас».
      if (saved.phase === 'finished') {
        for (const p of machine.participants(saved)) {
          const step = machine.setPresence(entry.state, p.userId, this.isOnline(p.userId), this.now());
          if (step.ok) entry.state = step.state;
        }
        this.schedule(entry);
      }
    } else this.schedule(entry);
    return entry;
  }

  private adopt(state: GameState): Entry {
    const entry: Entry = {
      state,
      queue: Promise.resolve(),
      timer: null,
      evictTimer: null,
      seen: null,
      invite: null,
      settleTimer: null,
      settleAttempts: 0,
      alerted: new Set(),
      alertsDue: new Set(),
      shared: new Map(),
    };
    this.games.set(state.id, entry);
    if (!FINAL_PHASES.includes(state.phase)) {
      for (const p of machine.participants(state)) this.current.set(p.userId, state.id);
    }
    return entry;
  }

  /**
   * Действия одного игрока, которые ведут его в партию (создать, тренировка, вход по ссылке, очередь),
   * идут строго по очереди. У каждого из них проверка «не занят ли игрок» и само создание партии разделены
   * ожиданием базы: два запроса сразу проходили проверку оба и давали две партии одному игроку.
   * Внутри можно ждать очередь партии (run), наоборот - нельзя: операции партии эту очередь не берут.
   */
  private exclusive<T>(userId: number, fn: () => Promise<T>): Promise<T> {
    const prev = this.userLocks.get(userId) ?? Promise.resolve();
    const result = prev.then(fn);
    const tail: Promise<void> = result
      .then(
        () => undefined,
        () => undefined,
      )
      .then(() => {
        if (this.userLocks.get(userId) === tail) this.userLocks.delete(userId);
      });
    this.userLocks.set(userId, tail);
    return result;
  }

  /** Очередь изменений одной партии: следующая операция ждёт предыдущую. */
  private run<T>(entry: Entry, fn: () => Promise<T>): Promise<T> {
    const result = entry.queue.then(fn);
    entry.queue = result.catch((error: unknown) => {
      this.d.log.error({ err: error, gameId: entry.state.id }, 'game operation failed');
    });
    return result;
  }

  /** Применяет шаг машины: события, запись в базу, снимки игрокам, таймер. */
  private async apply(entry: Entry, step: Step, meta: GameStateMeta = {}): Promise<void> {
    if (!step.ok || step.state === entry.state) {
      this.schedule(entry);
      return;
    }
    const prev = entry.state;
    entry.state = step.state;
    const now = this.now();
    let startedAt: number | undefined;
    let finished = false;
    const freed: number[] = [];

    for (const event of step.events) {
      if (event.type === 'countdown') {
        startedAt = now;
        this.spendTopic(entry.state);
      }
      if (event.type === 'finished') finished = true;
      // Партия закрылась, не дойдя до первого вопроса (отмена на отсчёте, истёкшее лобби): билет, списанный
      // на неё, возвращается. Если билет не списывали, возвращать нечего - запрос ничего не меняет.
      if ((event.type === 'cancelled' || event.type === 'expired') && BEFORE_PLAY.includes(prev.phase)) {
        this.refundTopic(prev.creator.userId, prev.category, prev.id);
      }
      if (event.type === 'seatFreed') {
        freed.push(event.userId);
        meta.seatFreed ??= 'timeout';
      }
      if (event.type === 'opponentAnswered') this.persistAnswer(entry.state, event);
    }

    for (const userId of freed) if (this.current.get(userId) === prev.id) this.current.delete(userId);
    if (FINAL_PHASES.includes(entry.state.phase)) {
      for (const p of machine.participants(entry.state)) {
        if (this.current.get(p.userId) === entry.state.id) this.current.delete(p.userId);
        if (finished) this.lastResults.set(p.userId, entry.state.id);
        if (finished && !this.isOnline(p.userId)) this.missedResults.set(p.userId, entry.state.id);
      }
      this.scheduleEvict(entry);
    }

    // Конец рейтинговой дуэли: финальный снимок пишется в одной транзакции с итогами.
    const needs = machine.isRated(entry.state) || machine.isSoloDone(entry.state);
    const settled = finished && needs && !entry.state.settlement ? await this.settleNow(entry) : null;
    if (settled === false) this.scheduleSettleRetry(entry);
    if (!settled) {
      try {
        await this.d.repo.save(entry.state, startedAt === undefined ? undefined : { startedAt });
      } catch (error) {
        // Память - источник правды; следующий снимок запишет полное состояние.
        this.d.log.error({ err: error, gameId: entry.state.id }, 'game save failed');
      }
    }

    this.notifyAll(entry, meta);
    this.schedule(entry);
    this.alert(entry, step.events);
  }

  /**
   * Уведомления от бота после шага партии: только тем, у кого сейчас нет открытого приложения.
   * Отправка - через ALERT_DELAY_MS и только если повод ещё в силе (игрок не вернулся, отсчёт идёт,
   * реванш ещё ждёт): так короткий обрыв сети или выкатка сервера не дают ложного «Вернитесь».
   */
  private alert(entry: Entry, events: GameEvent[]) {
    if (!this.d.alerts || this.shuttingDown) return;
    const s = entry.state;
    if (s.mode === 'solo') return;
    const kinds: [number, AlertKind][] = [];

    if (events.some((e) => e.type === 'joined')) kinds.push([s.creator.userId, 'joined']);
    // Соперник готов, а игрока нет: «Соперник ждёт - вернитесь».
    if (s.phase === 'lobby' && s.opponent) {
      for (const p of machine.participants(s)) if (machine.otherOf(s, p.userId)?.ready) kinds.push([p.userId, 'waitingLobby']);
    }
    // Посреди партии у пропавшего идёт отсчёт 30 с.
    if (ACTIVE_PHASES.includes(s.phase)) {
      for (const p of machine.participants(s)) if (p.graceEndsAt !== null) kinds.push([p.userId, 'waitingGame']);
    }
    // Предложение реванша висит, а соперник закрыл приложение: бот зовёт его на итоги (30 с).
    if (s.phase === 'finished' && s.rematch?.status === 'offered') {
      const to = machine.otherOf(s, s.rematch.by);
      if (to && !to.left) kinds.push([to.userId, 'rematch']);
    }
    if (s.phase === 'finished' && events.some((e) => e.type === 'finished')) {
      for (const p of machine.participants(s)) kinds.push([p.userId, 'result']);
    }

    for (const [userId, kind] of kinds) {
      const key = `${kind}:${userId}`;
      if (entry.alerted.has(key) || entry.alertsDue.has(key) || this.isOnline(userId)) continue;
      entry.alertsDue.add(key);
      const timer = this.clock.setTimeout(() => {
        this.alertTimers.delete(timer);
        entry.alertsDue.delete(key);
        this.sendAlert(entry, userId, kind);
      }, ALERT_DELAY_MS);
      (timer as { unref?: () => void } | null)?.unref?.();
      this.alertTimers.add(timer);
    }
  }

  /** Отложенное уведомление: отправить, если игрок так и не вернулся и повод ещё в силе. */
  private sendAlert(entry: Entry, userId: number, kind: AlertKind) {
    const alerts = this.d.alerts;
    const key = `${kind}:${userId}`;
    if (!alerts || this.stopped || this.shuttingDown || this.isOnline(userId) || entry.alerted.has(key)) return;
    const alert = this.alertFor(entry.state, userId, kind);
    if (!alert) return;
    entry.alerted.add(key);
    try {
      alerts.send(userId, alert);
    } catch (error) {
      this.d.log.warn({ err: error, gameId: entry.state.id }, 'alert failed');
    }
  }

  /** Текст уведомления по текущему состоянию партии; null - повод уже прошёл. */
  private alertFor(s: GameState, userId: number, kind: AlertKind): GameAlert | null {
    const me = machine.playerOf(s, userId);
    if (!me) return null;
    const opp = machine.otherOf(s, userId);
    const base = { kind, gameId: s.id, opponent: (opp && this.cardCache.get(opp.userId)?.name) ?? '' };
    switch (kind) {
      case 'joined':
        return OPEN_PHASES.includes(s.phase) && s.opponent && s.creator.userId === userId ? base : null;
      case 'waitingLobby':
        return s.phase === 'lobby' && opp?.ready ? base : null;
      case 'waitingGame':
        return ACTIVE_PHASES.includes(s.phase) && me.graceEndsAt !== null ? { ...base, until: me.graceEndsAt } : null;
      case 'rematch': {
        const r = s.rematch;
        return s.phase === 'finished' && r?.status === 'offered' && r.by !== userId && !me.left && r.expiresAt > this.now()
          ? { ...base, until: r.expiresAt }
          : null;
      }
      case 'result': {
        if (s.phase !== 'finished') return null;
        const mine = s.settlement?.players.find((x) => x.userId === userId);
        return {
          ...base,
          result: {
            outcome: machine.outcomeFor(s, userId) ?? 'draw',
            technical: s.finish?.reason !== 'completed',
            me: me.score,
            opp: opp?.score ?? 0,
            ratingAfter: mine?.after ?? null,
            delta: mine?.delta ?? null,
          },
        };
      }
      case 'friendInvite':
        return null;
    }
  }

  private notifyAll(entry: Entry, meta: GameStateMeta = {}) {
    for (const p of machine.participants(entry.state)) {
      const view = this.viewOf(entry.state, p.userId);
      if (view) this.d.notify.state(p.userId, view, meta);
    }
  }

  /**
   * Итоги рейтинговой дуэли (вызывать внутри очереди партии). true - посчитаны и записаны
   * вместе со снимком, false - база не ответила (снимок тогда пишет обычный save,
   * а settled_at остаётся пустым - повтор или перезапуск досчитают).
   */
  private async settleNow(entry: Entry): Promise<boolean> {
    const state = entry.state;
    if (state.settlement) return true;
    if (state.mode === 'solo') {
      try {
        entry.state = machine.withSettlement(entry.state, await this.d.repo.settleSolo(state, this.now()));
        if (entry.settleTimer) this.clock.clearTimeout(entry.settleTimer);
        entry.settleTimer = null;
        this.settled(entry.state);
        return true;
      } catch (error) {
        this.d.log.error({ err: error, gameId: state.id }, 'solo settle failed');
        return false;
      }
    }
    try {
      const previous = state.rematchOf ? (this.games.get(state.rematchOf)?.state ?? (await this.d.repo.load(state.rematchOf))) : null;
      const input = settleInput(state, this.d.bank, losersOf(previous));
      const settlement = await this.d.repo.settle(state, input, this.now());
      // Пока ждали базу, состояние партии не менялось: все изменения идут через эту же очередь.
      entry.state = machine.withSettlement(entry.state, settlement);
      if (entry.settleTimer) this.clock.clearTimeout(entry.settleTimer);
      entry.settleTimer = null;
      // Рейтинг изменился - карточки игроков (лобби, профиль соперника) должны это показать.
      await this.refreshCards(machine.participants(state).map((p) => p.userId));
      this.settled(entry.state);
      return true;
    } catch (error) {
      this.d.log.error({ err: error, gameId: state.id }, 'game settle failed');
      return false;
    }
  }

  /** Темы «Микса» игрока перед стартом партии: 5 базовых + купленные навсегда (билет на 1 игру - нет). */
  private async loadMixTopics(ids: readonly number[]) {
    await Promise.all(
      ids.map(async (id) => {
        let owned: PremiumCategory[] = [];
        if (this.d.ownedTopics) {
          owned = await this.d.ownedTopics(id).catch((error: unknown) => {
            this.d.log.warn({ err: error, userId: id }, 'owned topics failed');
            return [];
          });
        }
        this.mixTopics.set(id, [...CATEGORIES, ...owned.filter((c) => isPremiumCategory(c))]);
      }),
    );
  }

  private mixPool(userId: number): readonly Category[] {
    return this.mixTopics.get(userId) ?? CATEGORIES;
  }

  /** Платная тема открыта игроку? Обычные темы и «Микс» открыты всем. */
  private async topicOpen(userId: number, category: GameCategory): Promise<boolean> {
    if (!isPremiumCategory(category)) return true;
    if (!this.d.topicAccess) return false;
    try {
      return await this.d.topicAccess(userId, category);
    } catch (error) {
      this.d.log.warn({ err: error, userId, category }, 'topic access check failed');
      return false;
    }
  }

  /**
   * Списать билет создателя на эту партию до её старта. ok - можно начинать: тема обычная, куплена
   * навсегда или билет списан. none - билета нет. failed - списать не удалось (база): партия тоже не
   * начинается - бесплатная игра в платной теме хуже, чем отказ, который можно повторить.
   */
  private async chargeTopic(userId: number, category: GameCategory, gameId: string): Promise<'ok' | 'none' | 'failed'> {
    if (!isPremiumCategory(category)) return 'ok';
    if (!this.d.useTopic) return 'none';
    try {
      return (await this.d.useTopic(userId, category, gameId)) ? 'ok' : 'none';
    } catch (error) {
      this.d.log.error({ err: error, userId, gameId, category }, 'topic pass charge failed');
      return 'failed';
    }
  }

  /** Партия не создалась или не состоялась после списания: билет возвращается владельцу. */
  private refundTopic(userId: number, category: GameCategory, gameId: string) {
    if (!isPremiumCategory(category) || !this.d.releaseTopic) return;
    this.d.releaseTopic(userId, gameId).catch((error: unknown) => this.d.log.error({ err: error, userId, gameId }, 'topic pass refund failed'));
  }

  /**
   * Страховка на отсчёте: билет к этому моменту уже списан (ready, реванш, тренировка), повтор с тем же
   * gameId второй не тратит. Если партия в платной теме дошла сюда без билета - значит, появился путь
   * мимо списания: билет берётся здесь, а в журнале остаётся ошибка.
   */
  private spendTopic(state: GameState) {
    if (!isPremiumCategory(state.category) || !this.d.useTopic) return;
    this.d
      .useTopic(state.creator.userId, state.category, state.id)
      .then((spent) => {
        if (!spent) this.d.log.error({ gameId: state.id, userId: state.creator.userId, category: state.category }, 'premium game started without a topic pass');
      })
      .catch((error: unknown) => this.d.log.error({ err: error, gameId: state.id }, 'topic pass spend failed'));
  }

  /** Хук после итогов: не ждём его и не даём его сбою сломать партию. */
  private settled(state: GameState) {
    if (!this.d.onSettled) return;
    void Promise.resolve()
      .then(() => this.d.onSettled!(state))
      .catch((error: unknown) => this.d.log.error({ err: error, gameId: state.id }, 'after-settle hook failed'));
  }

  private scheduleSettleRetry(entry: Entry) {
    if (this.stopped || entry.settleTimer || entry.settleAttempts >= SETTLE_RETRY.attempts) return;
    const delay = Math.min(SETTLE_RETRY.maxMs, SETTLE_RETRY.firstMs * 2 ** entry.settleAttempts);
    entry.settleAttempts += 1;
    entry.settleTimer = this.clock.setTimeout(() => {
      entry.settleTimer = null;
      // Ошибку шага записывает сама очередь партии (run), здесь её остаётся только не уронить в процесс.
      this.run(entry, async () => {
        if (entry.state.settlement) return;
        if (await this.settleNow(entry)) this.notifyAll(entry);
        else this.scheduleSettleRetry(entry);
      }).catch(() => undefined);
    }, delay);
  }

  private persistAnswer(state: GameState, event: Extract<GameEvent, { type: 'opponentAnswered' }>) {
    const answer = machine.playerOf(state, event.userId)?.answers[event.index];
    const question = state.questions[event.index];
    if (!answer || !question) return;
    this.d.repo.saveAnswer(state.id, event.userId, event.index, question.id, answer).catch((error: unknown) => {
      this.d.log.error({ err: error, gameId: state.id }, 'answer save failed');
    });
  }

  private schedule(entry: Entry) {
    if (entry.timer) this.clock.clearTimeout(entry.timer);
    entry.timer = null;
    if (this.stopped) return;
    const at = machine.nextWakeAt(entry.state);
    if (at === null) return;
    entry.timer = this.clock.setTimeout(
      () => {
        entry.timer = null;
        this.run(entry, () => this.apply(entry, machine.tick(entry.state, this.now(), this.deps))).catch(() => undefined);
      },
      Math.max(0, at - this.now()),
    );
  }

  private scheduleEvict(entry: Entry) {
    if (entry.evictTimer || this.stopped) return;
    entry.evictTimer = this.clock.setTimeout(() => {
      if (FINAL_PHASES.includes(entry.state.phase) && this.games.get(entry.state.id) === entry) {
        this.games.delete(entry.state.id);
        this.challenges.delete(entry.state.id);
        for (const [userId, id] of this.lastResults) if (id === entry.state.id) this.lastResults.delete(userId);
        for (const [userId, id] of this.missedResults) if (id === entry.state.id) this.missedResults.delete(userId);
      }
    }, KEEP_FINISHED_MS);
    // Таймер выгрузки не должен держать процесс (тесты, остановка сервера).
    (entry.evictTimer as { unref?: () => void } | null)?.unref?.();
  }

  private viewOf(state: GameState, userId: number): GameView | null {
    const lang = this.cardCache.get(userId)?.lang ?? 'en';
    return viewFor(state, userId, lang, this.d.bank, this.now(), (id) => {
      const card = this.cardCache.get(id);
      return card ? this.profile(card) : undefined;
    });
  }

  private profile(card: UserCard) {
    return { name: card.name, username: card.username, photoUrl: card.photoUrl, rating: card.rating, glow: card.glow };
  }

  private async card(userId: number): Promise<UserCard | null> {
    await this.refreshCards([userId]);
    return this.cardCache.get(userId) ?? null;
  }

  private async refreshCards(ids: number[]) {
    const unique = [...new Set(ids)];
    if (unique.length === 0) return;
    try {
      const cards = await this.d.users.cards(unique);
      for (const [id, card] of cards) this.cardCache.set(id, card);
    } catch (error) {
      this.d.log.warn({ err: error }, 'user cards failed');
    }
  }

  private scheduleSweep() {
    if (this.sweepTimer || this.stopped) return;
    this.sweepTimer = this.clock.setTimeout(() => {
      this.sweepTimer = null;
      this.sweep();
      if (this.games.size > 0 || this.online.size > 0) this.scheduleSweep();
    }, SWEEP_MS);
    (this.sweepTimer as { unref?: () => void } | null)?.unref?.();
  }

  /** Забыть игроков, которых нет ни в сети, ни в очереди, ни в одной партии в памяти. */
  sweep() {
    const now = this.now();
    const keep = new Set<number>([...this.online.keys(), ...this.queue.keys(), ...this.lastResults.keys(), ...this.missedResults.keys()]);
    for (const entry of this.games.values()) for (const p of machine.participants(entry.state)) keep.add(p.userId);
    for (const id of this.cardCache.keys()) if (!keep.has(id)) this.cardCache.delete(id);
    for (const id of this.mixTopics.keys()) if (!keep.has(id)) this.mixTopics.delete(id);
    for (const [id, at] of this.reacted) if (now - at >= REACTION_COOLDOWN_MS) this.reacted.delete(id);
    // Лимит создания игр не сбрасываем: удаляем, только когда все отметки старше окна.
    for (const [id, list] of this.creates) if (list.every((t) => now - t >= CREATE_LIMIT.windowMs)) this.creates.delete(id);
  }

  /** Сколько записей в картах менеджера (тесты и диагностика утечек). */
  memoryStats() {
    return {
      games: this.games.size,
      current: this.current.size,
      online: this.online.size,
      cards: this.cardCache.size,
      mixTopics: this.mixTopics.size,
      reacted: this.reacted.size,
      creates: this.creates.size,
      lastResults: this.lastResults.size,
      missedResults: this.missedResults.size,
      challenges: this.challenges.size,
      queue: this.queue.size,
      alertTimers: this.alertTimers.size,
    };
  }

  private allowCreate(userId: number) {
    const now = this.now();
    const recent = (this.creates.get(userId) ?? []).filter((t) => now - t < CREATE_LIMIT.windowMs);
    if (recent.length >= CREATE_LIMIT.max) {
      this.creates.set(userId, recent);
      return false;
    }
    recent.push(now);
    this.creates.set(userId, recent);
    return true;
  }
}
