/**
 * Машина состояний партии. Чистые функции: без сети, базы и настоящих часов.
 * Время приходит параметром now, поэтому тесты гоняют партию с фейковым временем.
 *
 * Каждая операция получает текущее состояние и возвращает новое (исходное не меняется)
 * плюс список событий для сокет-слоя. Таймеры живут снаружи: после каждого шага
 * сервер спрашивает nextWakeAt() и в это время вызывает tick(). tick() закрывает
 * ВСЕ просроченные дедлайны по порядку - так же восстанавливается партия после
 * перезапуска сервера.
 */
import {
  ACTIVE_PHASES,
  FINAL_PHASES,
  isAnswerInTime,
  OPEN_PHASES,
  pointsFor,
  QUESTIONS_PER_GAME,
  TIMINGS,
  type CancelReason,
  type FinishReason,
  type GameCategory,
  type GameMode,
  type GamePhase,
  type AchievementCode,
  type Outcome,
  type RematchStatus,
} from '@quiz-duel/shared';
import type { GameQuestion } from './picker.js';

export interface PlayerAnswer {
  /** Позиция на экране, которую нажал игрок. */
  position: number;
  /** Индекс варианта в базе (после обратного перевода через order). */
  option: number;
  correct: boolean;
  timeMs: number;
  points: number;
}

export interface PlayerState {
  userId: number;
  ready: boolean;
  online: boolean;
  offlineSince: number | null;
  /** Посреди партии: когда будет техническое поражение, если не вернётся. */
  graceEndsAt: number | null;
  /** Сумма очков закрытых вопросов. */
  score: number;
  /** По индексу вопроса; null - вопрос закрыт без ответа. */
  answers: (PlayerAnswer | null)[];
  /** Ушёл с экрана итогов (нажал «На главную», зашёл в другую игру). В старых снимках поля нет. */
  left?: boolean;
}

/** Предложение реванша в завершённой партии. Живёт в снимке, поэтому переживает перезапуск. */
export interface RematchState {
  by: number;
  at: number;
  expiresAt: number;
  status: RematchStatus;
  /** Новая партия после принятия. */
  nextId: string | null;
}

/** Итоги партии, посчитанные в одной транзакции с рейтингом (settle в repo). */
export interface SettlementPlayer {
  userId: number;
  before: number;
  delta: number;
  after: number;
  achievements: AchievementCode[];
}

export interface Settlement {
  at: number;
  players: SettlementPlayer[];
}

export interface GameState {
  id: string;
  mode: GameMode;
  category: GameCategory;
  createdAt: number;
  creator: PlayerState;
  opponent: PlayerState | null;
  /** Выбираются при старте отсчёта, когда известны оба игрока. */
  questions: GameQuestion[];
  phase: GamePhase;
  phaseEndsAt: number | null;
  lobbyExpiresAt: number | null;
  /** -1 до первого вопроса. */
  questionIndex: number;
  questionStartedAt: number | null;
  /** Сколько вопросов закрыто (раскрыто). Ответ на незакрытый вопрос при сдаче не считается. */
  closed: number;
  finish: { reason: FinishReason; winnerId: number | null; at: number } | null;
  cancelReason: CancelReason | null;
  rematchOf: string | null;
  /** Реванш (только в фазе finished). В старых снимках поля нет. */
  rematch?: RematchState | null;
  /** Рейтинг и ачивки по итогам; нет - ещё не посчитаны. */
  settlement?: Settlement | null;
  rev: number;
}

/** То, что машине нужно снаружи. */
export interface MachineDeps {
  /** Верный индекс варианта вопроса из базы. */
  correctOf: (questionId: string) => number;
  /** 10 вопросов партии (сервер учитывает, что видели оба игрока). */
  pickQuestions: (state: GameState) => GameQuestion[];
}

export type GameEvent =
  | { type: 'joined'; userId: number }
  | { type: 'seatFreed'; userId: number }
  | { type: 'ready'; userId: number; ready: boolean }
  | { type: 'countdown' }
  | { type: 'question'; index: number }
  | { type: 'opponentAnswered'; userId: number; index: number }
  | { type: 'reveal'; index: number }
  | { type: 'presence'; userId: number; online: boolean }
  | { type: 'finished'; reason: FinishReason; winnerId: number | null }
  | { type: 'expired' }
  | { type: 'cancelled'; reason: CancelReason }
  | { type: 'resultsLeft'; userId: number }
  | { type: 'rematch'; status: RematchStatus; by: number };

export type GameError =
  | 'not_participant'
  | 'taken'
  | 'finished'
  | 'expired'
  | 'cancelled'
  | 'wrong_phase'
  | 'not_creator'
  | 'wrong_question'
  | 'bad_option'
  | 'already_answered'
  | 'late'
  | 'rematch_unavailable'
  | 'opponent_left'
  | 'rematch_closed';

export type Step = { ok: true; state: GameState; events: GameEvent[] } | { ok: false; error: GameError };

export interface CreateParams {
  id: string;
  mode: GameMode;
  category: GameCategory;
  creatorId: number;
  /** Быстрая игра и реванш создаются сразу на двоих. */
  opponentId?: number;
  /** Реванш: согласие обоих уже есть, сразу отсчёт. */
  startNow?: boolean;
  rematchOf?: string;
}

const newPlayer = (userId: number, ready = false): PlayerState => ({
  userId,
  ready,
  online: true,
  offlineSince: null,
  graceEndsAt: null,
  score: 0,
  answers: [],
});

export function participants(state: GameState): PlayerState[] {
  return state.opponent ? [state.creator, state.opponent] : [state.creator];
}

export function playerOf(state: GameState, userId: number): PlayerState | null {
  if (state.creator.userId === userId) return state.creator;
  if (state.opponent?.userId === userId) return state.opponent;
  return null;
}

export function otherOf(state: GameState, userId: number): PlayerState | null {
  return state.creator.userId === userId ? state.opponent : state.creator;
}

// ---------------------------------------------------------------------------
// Создание

export function createGame(params: CreateParams, now: number, deps: MachineDeps): GameState {
  const solo = params.mode === 'solo';
  const state: GameState = {
    id: params.id,
    mode: params.mode,
    category: params.category,
    createdAt: now,
    creator: newPlayer(params.creatorId, Boolean(params.startNow)),
    opponent: params.opponentId === undefined ? null : newPlayer(params.opponentId, Boolean(params.startNow)),
    questions: [],
    phase: params.opponentId === undefined ? 'waiting' : 'lobby',
    phaseEndsAt: null,
    lobbyExpiresAt: now + TIMINGS.lobbyTtlMs,
    questionIndex: -1,
    questionStartedAt: null,
    closed: 0,
    finish: null,
    cancelReason: null,
    rematchOf: params.rematchOf ?? null,
    rematch: null,
    settlement: null,
    rev: 1,
  };
  // Тренировка: без лобби, VS и отсчёта - сразу первый вопрос.
  if (solo) {
    state.questions = deps.pickQuestions(state);
    state.lobbyExpiresAt = null;
    startQuestion(state, 0, now, []);
  } else if (params.startNow && state.opponent) {
    startCountdown(state, now, deps, []);
  }
  return state;
}

// ---------------------------------------------------------------------------
// Лобби

/** Вход по ссылке. Первый не-создатель занимает место; остальным - taken. */
export function join(prev: GameState, userId: number, now: number): Step {
  if (prev.phase === 'finished') return fail('finished');
  if (prev.phase === 'expired') return fail('expired');
  if (prev.phase === 'cancelled') return fail('cancelled');
  if (playerOf(prev, userId)) return { ok: true, state: prev, events: [] };
  if (prev.opponent || prev.phase !== 'waiting' || prev.mode === 'solo') return fail('taken');

  const state = clone(prev);
  state.opponent = newPlayer(userId);
  state.phase = 'lobby';
  state.lobbyExpiresAt = now + TIMINGS.lobbyTtlMs;
  return done(state, [{ type: 'joined', userId }]);
}

/** Соперник сам ушёл из лобби - место освобождается сразу. */
export function leaveLobby(prev: GameState, userId: number, now: number): Step {
  if (!OPEN_PHASES.includes(prev.phase) && prev.phase !== 'countdown') return fail('wrong_phase');
  if (prev.opponent?.userId !== userId) return fail(playerOf(prev, userId) ? 'wrong_phase' : 'not_participant');
  const state = clone(prev);
  freeSeat(state, now);
  return done(state, [{ type: 'seatFreed', userId }]);
}

/**
 * «Готов» ставится и снимается до старта. Оба готовы - отсчёт 3 с.
 * Снять «Готов» во время отсчёта - вернуться в лобби.
 */
export function setReady(prev: GameState, userId: number, ready: boolean, now: number, deps: MachineDeps): Step {
  const me = playerOf(prev, userId);
  if (!me) return fail('not_participant');
  const canToggle = OPEN_PHASES.includes(prev.phase) || (prev.phase === 'countdown' && !ready);
  if (!canToggle || prev.mode === 'solo') return fail('wrong_phase');
  if (me.ready === ready) return { ok: true, state: prev, events: [] };

  const state = clone(prev);
  const events: GameEvent[] = [{ type: 'ready', userId, ready }];
  playerOf(state, userId)!.ready = ready;
  state.lobbyExpiresAt = now + TIMINGS.lobbyTtlMs;

  if (state.phase === 'countdown') {
    state.phase = 'lobby';
    state.phaseEndsAt = null;
    clearGrace(state);
  } else if (state.opponent && state.creator.ready && state.opponent.ready) {
    startCountdown(state, now, deps, events);
  }
  return done(state, events);
}

/** Отмена создателем до старта первого вопроса. */
export function cancel(prev: GameState, userId: number): Step {
  if (prev.creator.userId !== userId) return fail(playerOf(prev, userId) ? 'not_creator' : 'not_participant');
  if (!OPEN_PHASES.includes(prev.phase) && prev.phase !== 'countdown') return fail('wrong_phase');
  const state = clone(prev);
  const events: GameEvent[] = [];
  cancelled(state, 'creator', events);
  return done(state, events);
}

// ---------------------------------------------------------------------------
// Связь

/**
 * Игрок подключился или отключился. В лобби офлайн-соперник через 60 с теряет место.
 * Посреди партии: пока второй на связи, у ушедшего идёт отсчёт 30 с до технического
 * поражения. Если ушли оба - отсчёт стоит, партия доигрывается по таймерам.
 */
export function setPresence(prev: GameState, userId: number, online: boolean, now: number): Step {
  const me = playerOf(prev, userId);
  if (!me) return fail('not_participant');
  // После итогов присутствие нужно только реваншу: ушёл ли соперник.
  const tracked = !FINAL_PHASES.includes(prev.phase) || prev.phase === 'finished';
  if (me.online === online || !tracked) return { ok: true, state: prev, events: [] };

  const state = clone(prev);
  const p = playerOf(state, userId)!;
  p.online = online;
  p.offlineSince = online ? null : now;
  if (ACTIVE_PHASES.includes(state.phase)) refreshGrace(state, now);
  return done(state, [{ type: 'presence', userId, online }]);
}

// ---------------------------------------------------------------------------
// Партия

/** Ответ на вопрос. Принимается один раз; повтор (двойной тап, реконнект) - already_answered. */
export function answer(
  prev: GameState,
  userId: number,
  questionIndex: number,
  position: number,
  now: number,
  deps: MachineDeps,
): Step {
  const me = playerOf(prev, userId);
  if (!me) return fail('not_participant');
  if (prev.phase !== 'question') return fail('wrong_phase');
  if (questionIndex !== prev.questionIndex) return fail('wrong_question');
  const q = prev.questions[questionIndex]!;
  if (!Number.isInteger(position) || position < 0 || position >= q.order.length) return fail('bad_option');
  if (me.answers[questionIndex]) return fail('already_answered');

  const timeMs = now - prev.questionStartedAt!;
  if (!isAnswerInTime(timeMs)) return fail('late');

  const state = clone(prev);
  const option = q.order[position]!;
  const correct = option === deps.correctOf(q.id);
  playerOf(state, userId)!.answers[questionIndex] = { position, option, correct, timeMs, points: pointsFor(correct, timeMs) };

  const events: GameEvent[] = [{ type: 'opponentAnswered', userId, index: questionIndex }];
  if (participants(state).every((p) => p.answers[questionIndex])) closeQuestion(state, now, events);
  return done(state, events);
}

/** «Выйти из партии»: в дуэли - сразу техническая победа сопернику, в тренировке - выход без сохранения. */
export function forfeit(prev: GameState, userId: number, now: number): Step {
  if (!playerOf(prev, userId)) return fail('not_participant');
  if (!ACTIVE_PHASES.includes(prev.phase)) return fail('wrong_phase');
  const state = clone(prev);
  const events: GameEvent[] = [];
  if (state.mode === 'solo') cancelled(state, 'left', events);
  else finish(state, 'forfeit', otherOf(state, userId)!.userId, now, events);
  return done(state, events);
}

// ---------------------------------------------------------------------------
// Итоги и реванш

/** Реванш возможен только после доигранной до конца дуэли: после технического исхода его нет. */
export function rematchAvailable(state: GameState): boolean {
  return state.phase === 'finished' && state.mode !== 'solo' && state.opponent !== null && state.finish?.reason === 'completed';
}

/** Соперник ушёл с итогов или пропал со связи - предложить ему реванш нельзя. */
export function isGone(p: PlayerState | null): boolean {
  return !p || !p.online || Boolean(p.left);
}

/**
 * Предложение реванша. Повторное нажатие предложившего ничего не меняет.
 * Встречное предложение (соперник уже предложил) машина не принимает за согласие сама:
 * для согласия нужна новая партия, её создаёт менеджер и вызывает respondRematch.
 */
export function offerRematch(prev: GameState, userId: number, now: number): Step {
  const me = playerOf(prev, userId);
  if (!me) return fail('not_participant');
  if (!rematchAvailable(prev)) return fail('rematch_unavailable');
  const cur = prev.rematch ?? null;
  if (cur?.status === 'offered' && cur.by === userId) return { ok: true, state: prev, events: [] };
  if (cur && cur.status !== 'cancelled') return fail('rematch_closed');
  if (me.left || isGone(otherOf(prev, userId))) return fail('opponent_left');

  const state = clone(prev);
  state.rematch = { by: userId, at: now, expiresAt: now + TIMINGS.rematchMs, status: 'offered', nextId: null };
  return done(state, [{ type: 'rematch', status: 'offered', by: userId }]);
}

/** Ответ на предложение соперника. Согласие сразу несёт id новой партии. */
export function respondRematch(prev: GameState, userId: number, accept: boolean, now: number, nextId: string | null): Step {
  if (!playerOf(prev, userId)) return fail('not_participant');
  const cur = prev.rematch ?? null;
  if (!rematchAvailable(prev) || !cur) return fail('rematch_unavailable');
  if (cur.status !== 'offered' || cur.by === userId || now > cur.expiresAt) return fail('rematch_closed');
  if (accept && !nextId) throw new Error('согласие на реванш без новой партии');

  const state = clone(prev);
  state.rematch = { ...cur, status: accept ? 'accepted' : 'declined', nextId: accept ? nextId : null };
  return done(state, [{ type: 'rematch', status: state.rematch.status, by: cur.by }]);
}

/** Предложивший отменяет своё предложение: кнопка «Реванш» снова активна у обоих. */
export function cancelRematch(prev: GameState, userId: number): Step {
  if (!playerOf(prev, userId)) return fail('not_participant');
  const cur = prev.rematch ?? null;
  if (!cur || cur.status !== 'offered' || cur.by !== userId) return fail('rematch_closed');
  const state = clone(prev);
  state.rematch = { ...cur, status: 'cancelled' };
  return done(state, [{ type: 'rematch', status: 'cancelled', by: cur.by }]);
}

/** Ждали ответа, а соперник пропал со связи - согласие невозможно. */
export function rematchGone(prev: GameState): Step {
  const cur = prev.rematch ?? null;
  if (!cur || cur.status !== 'offered') return { ok: true, state: prev, events: [] };
  const state = clone(prev);
  state.rematch = { ...cur, status: 'left' };
  return done(state, [{ type: 'rematch', status: 'left', by: cur.by }]);
}

/** Игрок ушёл с экрана итогов. Ждущее предложение реванша закрывается. */
export function leaveResults(prev: GameState, userId: number): Step {
  const me = playerOf(prev, userId);
  if (!me) return fail('not_participant');
  if (prev.phase !== 'finished') return fail('wrong_phase');
  if (me.left) return { ok: true, state: prev, events: [] };
  const state = clone(prev);
  playerOf(state, userId)!.left = true;
  const events: GameEvent[] = [{ type: 'resultsLeft', userId }];
  if (state.rematch?.status === 'offered') {
    state.rematch = { ...state.rematch, status: 'left' };
    events.push({ type: 'rematch', status: 'left', by: state.rematch.by });
  }
  return done(state, events);
}

/** Итоги посчитаны (рейтинг, статистика, ачивки) - кладём их в снимок. */
export function withSettlement(prev: GameState, settlement: Settlement): GameState {
  return { ...prev, settlement, rev: prev.rev + 1 };
}

// ---------------------------------------------------------------------------
// Время

/** Ближайший момент, когда tick() что-то изменит; null - ждать нечего. */
export function nextWakeAt(state: GameState): number | null {
  return deadlines(state)[0]?.at ?? null;
}

/** Закрывает все дедлайны, наступившие к now, в хронологическом порядке. */
export function tick(prev: GameState, now: number, deps: MachineDeps): Step {
  let state: GameState | null = null;
  const events: GameEvent[] = [];
  // Не больше 100 шагов: партия из 10 вопросов проходит ~25 дедлайнов, это защита от зацикливания.
  for (let guard = 0; guard < 100; guard++) {
    const next = deadlines(state ?? prev)[0];
    if (!next || next.at > now) break;
    state ??= clone(prev);
    next.apply(state, events, deps);
  }
  return state ? done(state, events) : { ok: true, state: prev, events: [] };
}

interface Deadline {
  at: number;
  apply: (state: GameState, events: GameEvent[], deps: MachineDeps) => void;
}

function deadlines(state: GameState): Deadline[] {
  const list: Deadline[] = [];
  const { phase } = state;

  if (OPEN_PHASES.includes(phase)) {
    if (state.lobbyExpiresAt !== null) {
      list.push({
        at: state.lobbyExpiresAt,
        apply: (s, ev) => {
          s.phase = 'expired';
          ev.push({ type: 'expired' });
        },
      });
    }
    const opp = state.opponent;
    if (opp && !opp.online && opp.offlineSince !== null) {
      list.push({
        at: opp.offlineSince + TIMINGS.lobbyOfflineMs,
        apply: (s, ev) => {
          ev.push({ type: 'seatFreed', userId: opp.userId });
          freeSeat(s, opp.offlineSince! + TIMINGS.lobbyOfflineMs);
        },
      });
    }
  }

  if (phase === 'countdown') {
    const at = state.phaseEndsAt!;
    list.push({ at, apply: (s, ev) => startQuestion(s, 0, at, ev) });
  }

  if (phase === 'question') {
    // Таймер у игрока - 15 с; закрываем после допуска на сеть.
    const at = state.phaseEndsAt! + TIMINGS.answerGraceMs;
    list.push({ at, apply: (s, ev) => closeQuestion(s, at, ev) });
  }

  if (phase === 'reveal') {
    const at = state.phaseEndsAt!;
    list.push({
      at,
      apply: (s, ev) => {
        if (s.questionIndex + 1 < s.questions.length) startQuestion(s, s.questionIndex + 1, at, ev);
        else completeGame(s, at, ev);
      },
    });
  }

  if (phase === 'finished' && state.rematch?.status === 'offered') {
    const at = state.rematch.expiresAt;
    list.push({
      at,
      apply: (s, ev) => {
        s.rematch = { ...s.rematch!, status: 'expired' };
        ev.push({ type: 'rematch', status: 'expired', by: s.rematch.by });
      },
    });
  }

  if (ACTIVE_PHASES.includes(phase)) {
    for (const p of participants(state)) {
      if (p.graceEndsAt === null) continue;
      const at = p.graceEndsAt;
      list.push({ at, apply: (s, ev) => finish(s, 'abandoned', otherOf(s, p.userId)!.userId, at, ev) });
    }
  }

  return list.sort((a, b) => a.at - b.at);
}

// ---------------------------------------------------------------------------
// Переходы (меняют уже склонированное состояние)

function startCountdown(state: GameState, now: number, deps: MachineDeps, events: GameEvent[]) {
  state.questions = deps.pickQuestions(state);
  if (state.questions.length !== QUESTIONS_PER_GAME) throw new Error('в партии должно быть 10 вопросов');
  state.phase = 'countdown';
  state.phaseEndsAt = now + TIMINGS.countdownMs;
  state.lobbyExpiresAt = null;
  refreshGrace(state, now);
  events.push({ type: 'countdown' });
}

function startQuestion(state: GameState, index: number, at: number, events: GameEvent[]) {
  state.phase = 'question';
  state.questionIndex = index;
  state.questionStartedAt = at;
  state.phaseEndsAt = at + TIMINGS.questionMs;
  events.push({ type: 'question', index });
}

function closeQuestion(state: GameState, at: number, events: GameEvent[]) {
  const i = state.questionIndex;
  for (const p of participants(state)) {
    p.answers[i] ??= null;
    p.score += p.answers[i]?.points ?? 0;
  }
  state.closed = i + 1;
  state.phase = 'reveal';
  state.phaseEndsAt = at + TIMINGS.revealMs;
  events.push({ type: 'reveal', index: i });
}

function completeGame(state: GameState, at: number, events: GameEvent[]) {
  const anyAnswer = participants(state).some((p) => p.answers.some(Boolean));
  if (!anyAnswer) return cancelled(state, 'no_answers', events);
  const [a, b] = participants(state);
  const winnerId = !b ? null : a!.score === b.score ? null : a!.score > b.score ? a!.userId : b.userId;
  finish(state, 'completed', winnerId, at, events);
}

function finish(state: GameState, reason: FinishReason, winnerId: number | null, at: number, events: GameEvent[]) {
  state.phase = 'finished';
  state.phaseEndsAt = null;
  state.finish = { reason, winnerId, at };
  clearGrace(state);
  events.push({ type: 'finished', reason, winnerId });
}

function cancelled(state: GameState, reason: CancelReason, events: GameEvent[]) {
  state.phase = 'cancelled';
  state.phaseEndsAt = null;
  state.cancelReason = reason;
  clearGrace(state);
  events.push({ type: 'cancelled', reason });
}

function freeSeat(state: GameState, now: number) {
  state.opponent = null;
  clearGrace(state);
  state.phase = 'waiting';
  state.phaseEndsAt = null;
  state.lobbyExpiresAt = now + TIMINGS.lobbyTtlMs;
}

/** Отсчёт до технического поражения есть только посреди партии. */
function clearGrace(state: GameState) {
  for (const p of participants(state)) p.graceEndsAt = null;
}

/** Отсчёт 30 с идёт у офлайн-игрока, только пока соперник на связи. */
function refreshGrace(state: GameState, now: number) {
  if (state.mode === 'solo') return;
  for (const p of participants(state)) {
    const other = otherOf(state, p.userId);
    if (p.online || !other?.online) p.graceEndsAt = null;
    else p.graceEndsAt ??= now + TIMINGS.reconnectGraceMs;
  }
}

// ---------------------------------------------------------------------------
// Итог для игрока

export function outcomeFor(state: GameState, userId: number): Outcome | null {
  if (!state.finish) return null;
  if (state.finish.winnerId === null) return 'draw';
  return state.finish.winnerId === userId ? 'win' : 'loss';
}

/** Рейтинговая ли партия: дуэли по ссылке, быстрая игра и реванш, доигранные или технические. */
export function isRated(state: GameState): boolean {
  return state.phase === 'finished' && state.mode !== 'solo' && state.opponent !== null;
}

// ---------------------------------------------------------------------------

const clone = (s: GameState): GameState => structuredClone(s);
const fail = (error: GameError): Step => ({ ok: false, error });
function done(state: GameState, events: GameEvent[]): Step {
  state.rev += 1;
  return { ok: true, state, events };
}
