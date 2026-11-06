import type { Outcome } from './elo.js';
import type { GameCategory } from './questions.js';

/**
 * Фазы партии: waiting (ждём соперника) → lobby (оба на месте) → countdown (3 с)
 * → question (15 с) → reveal (3 с) → … × 10 → finished.
 * Отдельно: expired (лобби истекло) и cancelled (отмена создателем, выход из тренировки
 * или никто не дал ни одного ответа).
 */
export type GamePhase = 'waiting' | 'lobby' | 'countdown' | 'question' | 'reveal' | 'finished' | 'expired' | 'cancelled';

/** link - дуэль по ссылке, quick - быстрая игра, rematch - реванш, solo - тренировка. */
export type GameMode = 'link' | 'quick' | 'rematch' | 'solo';

/** completed - сыграли до конца, forfeit - кто-то сдался, abandoned - не вернулся за 30 с. */
export type FinishReason = 'completed' | 'forfeit' | 'abandoned';

/** creator - создатель отменил, left - вышли из тренировки, no_answers - никто ни разу не ответил. */
export type CancelReason = 'creator' | 'left' | 'no_answers';

export const ACTIVE_PHASES: readonly GamePhase[] = ['countdown', 'question', 'reveal'];
export const OPEN_PHASES: readonly GamePhase[] = ['waiting', 'lobby'];
export const FINAL_PHASES: readonly GamePhase[] = ['finished', 'expired', 'cancelled'];

export interface PlayerView {
  userId: number;
  ready: boolean;
  online: boolean;
  /** Соперник офлайн посреди партии: когда наступит техническая победа (мс, время сервера). */
  graceEndsAt: number | null;
  /** Счёт без очков текущего вопроса - они появляются на раскрытии. */
  score: number;
}

export interface QuestionView {
  index: number;
  total: number;
  questionId: string;
  text: string;
  /** Варианты уже в порядке экрана. Какой из них верный - не сообщается до раскрытия. */
  options: string[];
  startedAt: number;
  endsAt: number;
}

export interface RevealSide {
  /** Позиция выбранного варианта на экране; null - не успел. */
  position: number | null;
  points: number;
  timeMs: number | null;
}

export interface RevealView {
  index: number;
  correctPosition: number;
  me: RevealSide;
  opponent: RevealSide | null;
}

/**
 * Снимок партии глазами одного игрока. Клиент рисует экран только из него,
 * после переподключения запрашивает свежий; rev растёт с каждым изменением.
 */
export interface GameView {
  id: string;
  mode: GameMode;
  category: GameCategory;
  phase: GamePhase;
  rev: number;
  serverNow: number;
  /** Конец текущей фазы (отсчёт, вопрос, раскрытие) по часам сервера. */
  phaseEndsAt: number | null;
  /** Когда истечёт лобби, если партия не начнётся. */
  lobbyExpiresAt: number | null;
  creatorId: number;
  me: PlayerView;
  opponent: PlayerView | null;
  question: QuestionView | null;
  /** Мой выбор в текущем вопросе (чтобы после переподключения он остался выделен). */
  myAnswer: { position: number } | null;
  opponentAnswered: boolean;
  /** Раскрытие закрытого вопроса: только в фазе reveal. Разбор всей партии - отдельным запросом. */
  reveal: RevealView | null;
  result: { reason: FinishReason; outcome: Outcome; technical: boolean } | null;
  cancelReason: CancelReason | null;
}
