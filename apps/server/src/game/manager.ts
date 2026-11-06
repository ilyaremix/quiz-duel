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
 */
import {
  ACTIVE_PHASES,
  FINAL_PHASES,
  gameLink,
  OPEN_PHASES,
  type GameCategory,
  type GameErrorCode,
  type GameFailure,
  type GameStateMeta,
  type GameView,
  type InviteResult,
} from '@quiz-duel/shared';
import type { QuestionBank } from '../questions/bank.js';
import type { UserCard, UsersRepo } from '../users.js';
import * as machine from './machine.js';
import type { GameError, GameEvent, GameState, MachineDeps, Step } from './machine.js';
import { pickQuestions } from './picker.js';
import type { GamesRepo } from './repo.js';
import { newGameId } from './ids.js';
import { secureRng, type Rng } from './rng.js';
import { viewFor } from './view.js';

/** Куда менеджер отправляет снимки (сокет-слой). */
export interface GameNotifier {
  state(userId: number, view: GameView, meta?: GameStateMeta): void;
}

export interface PreparedInvite {
  id: string;
  /** До какого времени Telegram хранит подготовленное сообщение (мс). */
  expiresAt: number;
}

/** Бот: готовит карточку «Вызов на дуэль» для shareMessage. */
export interface InviteMaker {
  prepare(input: { userId: number; gameId: string; link: string; category: GameCategory; lang: UserCard['lang']; creatorName: string }): Promise<PreparedInvite | null>;
}

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
  now?: () => number;
  newId?: () => string;
  rng?: Rng;
}

export type Result<T> = ({ ok: true } & T) | GameFailure;

interface Entry {
  state: GameState;
  queue: Promise<unknown>;
  timer: NodeJS.Timeout | null;
  evictTimer: NodeJS.Timeout | null;
  /** Что видели игроки - подгружается перед выбором вопросов. */
  seen: Map<string, number> | null;
  invite: Promise<PreparedInvite | null> | null;
}

/** Лимит создания игр на игрока. */
export const CREATE_LIMIT = { max: 10, windowMs: 60_000 } as const;
/** Сколько держим завершённую партию в памяти (её итоги ещё могут запросить). */
const KEEP_FINISHED_MS = 10 * 60_000;
/** Запас, с которым переиспользуем подготовленное приглашение. */
const INVITE_MARGIN_MS = 5 * 60_000;

const fail = (error: GameErrorCode, extra: Partial<GameFailure> = {}): GameFailure => ({ ok: false, error, ...extra });

/** Ошибки машины → коды протокола. */
function mapError(error: GameError): GameErrorCode {
  switch (error) {
    case 'taken':
    case 'finished':
    case 'expired':
    case 'cancelled':
    case 'not_participant':
    case 'wrong_phase':
    case 'not_creator':
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
  private readonly cardCache = new Map<number, UserCard>();
  private readonly creates = new Map<number, number[]>();
  private readonly deps: MachineDeps;
  private readonly now: () => number;
  private stopped = false;

  constructor(private readonly d: ManagerDeps) {
    this.now = d.now ?? Date.now;
    const rng = d.rng ?? secureRng;
    this.deps = {
      correctOf: (id) => {
        const q = d.bank.byId.get(id);
        if (!q) throw new Error(`вопрос ${id} не найден в базе`);
        return q.correct;
      },
      pickQuestions: (state) =>
        pickQuestions({ bank: d.bank, category: state.category, seen: this.games.get(state.id)?.seen ?? new Map(), rng }),
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
    return states.length;
  }

  stop() {
    this.stopped = true;
    for (const entry of this.games.values()) {
      if (entry.timer) clearTimeout(entry.timer);
      if (entry.evictTimer) clearTimeout(entry.evictTimer);
    }
  }

  // -------------------------------------------------------------------------
  // Подключения

  async connect(userId: number): Promise<string | null> {
    const count = (this.online.get(userId) ?? 0) + 1;
    this.online.set(userId, count);
    await this.refreshCards([userId]);
    const gameId = this.current.get(userId) ?? null;
    if (count === 1 && gameId) await this.presence(userId, gameId, true);
    return gameId;
  }

  async disconnect(userId: number): Promise<void> {
    const count = (this.online.get(userId) ?? 1) - 1;
    if (count > 0) {
      this.online.set(userId, count);
      return;
    }
    this.online.delete(userId);
    const gameId = this.current.get(userId);
    if (gameId) await this.presence(userId, gameId, false);
  }

  isOnline(userId: number) {
    return (this.online.get(userId) ?? 0) > 0;
  }

  currentGameOf(userId: number): string | null {
    return this.current.get(userId) ?? null;
  }

  private async presence(userId: number, gameId: string, online: boolean) {
    const entry = this.games.get(gameId);
    if (!entry) return;
    await this.run(entry, () => this.apply(entry, machine.setPresence(entry.state, userId, online, this.now())));
  }

  // -------------------------------------------------------------------------
  // Лобби

  async create(userId: number, category: GameCategory): Promise<Result<{ game: GameView }>> {
    if (!this.allowCreate(userId)) return fail('rate_limited');
    const card = await this.card(userId);
    if (!card) return fail('internal');
    if (card.docsVersion !== this.d.docsVersion) return fail('consent_required');

    const busy = await this.releaseOpenGame(userId, null);
    if (busy) return busy;

    let state: GameState | null = null;
    for (let attempt = 0; attempt < 3 && !state; attempt++) {
      const id = (this.d.newId ?? newGameId)();
      if (this.games.has(id) || (await this.d.repo.load(id))) continue;
      state = machine.createGame({ id, mode: 'link', category, creatorId: userId }, this.now(), this.deps);
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

  /** Вход по ссылке. Участник получает снимок своей партии в любой фазе. */
  async join(userId: number, gameId: string): Promise<Result<{ game: GameView }>> {
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
    if (card.docsVersion !== this.d.docsVersion) {
      const inviter = this.cardCache.get(peek.creator.userId);
      return fail('consent_required', inviter ? { inviter: { userId: inviter.id, ...this.profile(inviter) } } : {});
    }

    const busy = await this.releaseOpenGame(userId, gameId);
    if (busy) return busy;

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
    return { ok: true, game: view };
  }

  async ready(userId: number, gameId: string, ready: boolean): Promise<Result<{ game: GameView }>> {
    return this.mutate(userId, gameId, async (entry) => {
      const s = entry.state;
      const other = machine.otherOf(s, userId);
      // Этот «Готов» запустит отсчёт - заранее узнаём, какие вопросы игроки уже видели.
      if (ready && s.phase === 'lobby' && other?.ready && machine.playerOf(s, userId)) {
        entry.seen = await this.d.repo.seenQuestions([s.creator.userId, other.userId]).catch((error: unknown) => {
          this.d.log.warn({ err: error, gameId }, 'seen questions failed');
          return new Map<string, number>();
        });
      }
      return machine.setReady(entry.state, userId, ready, this.now(), this.deps);
    });
  }

  async cancel(userId: number, gameId: string): Promise<Result<{ game: GameView }>> {
    return this.mutate(userId, gameId, async (entry) => machine.cancel(entry.state, userId));
  }

  /** «Выйти из лобби»: соперник освобождает место, создатель отменяет игру. */
  async leave(userId: number, gameId: string): Promise<Result<object>> {
    const entry = await this.entry(gameId);
    if (!entry) return fail('not_found');
    return this.run(entry, async () => {
      const s = entry.state;
      if (!machine.playerOf(s, userId)) return fail('not_participant');
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
      return invites.prepare({ userId, gameId, link, category: s.category, lang: card?.lang ?? 'en', creatorName: card?.name ?? '' });
    })().catch((error: unknown) => {
      this.d.log.warn({ err: error, gameId }, 'prepared invite failed');
      return null;
    });
    const prepared = await entry.invite;
    return { ok: true, link, preparedMessageId: prepared?.id ?? null };
  }

  // -------------------------------------------------------------------------
  // Внутреннее

  /**
   * Перед созданием или входом в другую партию: открытое лобби игрока закрывается
   * (своё - отменяется, чужое - место освобождается), а идущая дуэль даёт busy.
   */
  private async releaseOpenGame(userId: number, targetId: string | null): Promise<GameFailure | null> {
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

  private async mutate(
    userId: number,
    gameId: string,
    fn: (entry: Entry) => Promise<Step>,
  ): Promise<Result<{ game: GameView }>> {
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
    if (FINAL_PHASES.includes(saved.phase)) this.scheduleEvict(entry);
    else this.schedule(entry);
    return entry;
  }

  private adopt(state: GameState): Entry {
    const entry: Entry = { state, queue: Promise.resolve(), timer: null, evictTimer: null, seen: null, invite: null };
    this.games.set(state.id, entry);
    if (!FINAL_PHASES.includes(state.phase)) {
      for (const p of machine.participants(state)) this.current.set(p.userId, state.id);
    }
    return entry;
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
    const freed: number[] = [];

    for (const event of step.events) {
      if (event.type === 'countdown') startedAt = now;
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
      }
      this.scheduleEvict(entry);
    }

    try {
      await this.d.repo.save(entry.state, startedAt === undefined ? undefined : { startedAt });
    } catch (error) {
      // Память - источник правды; следующий снимок запишет полное состояние.
      this.d.log.error({ err: error, gameId: entry.state.id }, 'game save failed');
    }

    for (const p of machine.participants(entry.state)) {
      const view = this.viewOf(entry.state, p.userId);
      if (view) this.d.notify.state(p.userId, view, meta);
    }
    this.schedule(entry);
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
    if (entry.timer) clearTimeout(entry.timer);
    entry.timer = null;
    if (this.stopped) return;
    const at = machine.nextWakeAt(entry.state);
    if (at === null) return;
    entry.timer = setTimeout(() => {
      entry.timer = null;
      void this.run(entry, () => this.apply(entry, machine.tick(entry.state, this.now(), this.deps)));
    }, Math.max(0, at - this.now()));
  }

  private scheduleEvict(entry: Entry) {
    if (entry.evictTimer || this.stopped) return;
    entry.evictTimer = setTimeout(() => {
      if (FINAL_PHASES.includes(entry.state.phase) && this.games.get(entry.state.id) === entry) this.games.delete(entry.state.id);
    }, KEEP_FINISHED_MS);
    entry.evictTimer.unref?.();
  }

  private viewOf(state: GameState, userId: number): GameView | null {
    const lang = this.cardCache.get(userId)?.lang ?? 'en';
    return viewFor(state, userId, lang, this.d.bank, this.now(), (id) => {
      const card = this.cardCache.get(id);
      return card ? this.profile(card) : undefined;
    });
  }

  private profile(card: UserCard) {
    return { name: card.name, username: card.username, photoUrl: card.photoUrl, rating: card.rating };
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
