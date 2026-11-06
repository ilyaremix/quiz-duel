import type { Outcome } from './elo.js';
import type { AchievementCode } from './achievements.js';
import type { Category, GameCategory } from './categories.js';

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

/** Публичная карточка игрока: то, что видит соперник в лобби и в партии. */
export interface PlayerProfile {
  /** Имя из Telegram (first_name). */
  name: string;
  username: string | null;
  photoUrl: string | null;
  rating: number;
}

export interface PlayerView extends PlayerProfile {
  userId: number;
  ready: boolean;
  online: boolean;
  /** Соперник офлайн посреди партии: когда наступит техническая победа (мс, время сервера). */
  graceEndsAt: number | null;
  /** Лобби: соперник офлайн - когда освободится его место (мс, время сервера). */
  seatFreesAt: number | null;
  /** Счёт без очков текущего вопроса - они появляются на раскрытии. */
  score: number;
  /** Ушёл с экрана итогов («На главную», другая игра): реванш ему уже не предложить. */
  left: boolean;
}

export interface QuestionView {
  index: number;
  total: number;
  questionId: string;
  /** Тема самого вопроса (в «Миксе» у каждого своя). */
  category: Category;
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

/** Мои цифры за партию для экрана итогов. */
export interface ResultStats {
  /** Верных ответов. */
  correct: number;
  /** Сколько вопросов успели сыграть (закрыть); при технической победе может быть меньше 10. */
  played: number;
  /** Среднее время по всем моим ответам партии (мс); null - ни одного ответа. */
  avgMs: number | null;
}

/** Рейтинг игрока после партии: «Рейтинг 1 016 (+16)». */
export interface RatingChange {
  before: number;
  after: number;
  delta: number;
}

export interface GameResultView {
  reason: FinishReason;
  outcome: Outcome;
  technical: boolean;
  /** Кто сдался или не вернулся (для технического исхода). */
  leaverId: number | null;
  stats: ResultStats;
  /** Мой рейтинг до и после; null - сервер ещё считает итоги (придёт следующим снимком). */
  rating: RatingChange | null;
  /** Ачивки, полученные в этой партии (показ - этап 8). */
  newAchievements: AchievementCode[];
}

/**
 * offered - ждём ответа (30 с), accepted - создана новая партия (nextGameId),
 * declined - отказ, expired - не ответил за 30 с, cancelled - предложивший передумал,
 * left - кто-то ушёл с итогов или пропал со связи, пока ждали ответа.
 */
export type RematchStatus = 'offered' | 'accepted' | 'declined' | 'expired' | 'cancelled' | 'left';

/** Почему кнопка «Реванш» неактивна. */
export type RematchBlock = 'technical' | 'opponentLeft' | 'closed';

export interface RematchView {
  /** null - реванш ещё никто не предлагал (или предложивший отменил). */
  status: RematchStatus | null;
  /** Предложил я (иначе - соперник). */
  byMe: boolean;
  /** До какого времени ждём ответа (мс, время сервера). */
  expiresAt: number | null;
  /** Новая партия после принятия. */
  nextGameId: string | null;
  /** Можно ли сейчас нажать «Реванш» (предложить или принять встречное предложение). */
  canOffer: boolean;
  blocked: RematchBlock | null;
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
  result: GameResultView | null;
  cancelReason: CancelReason | null;
  /** Реванш: id прошлой партии этой пары. */
  rematchOf: string | null;
  /** Состояние реванша - только у завершённой партии. */
  rematch: RematchView | null;
}

/** Реакции сопернику: фиксированный набор, свободного чата нет - модерировать нечего. */
export const REACTIONS = ['👍', '😂', '😮', '😤', '🔥', '👏'] as const;
export type Reaction = (typeof REACTIONS)[number];
/** Не чаще одной реакции в 2 с от игрока (сервер проверяет сам). */
export const REACTION_COOLDOWN_MS = 2_000;
/** Где можно слать реакции: лобби (и его часть отсчёта), раскрытие вопроса и итоги. Во время вопроса - нет. */
export const REACTION_PHASES: readonly GamePhase[] = ['lobby', 'countdown', 'reveal', 'finished'];
