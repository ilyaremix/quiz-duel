import type { GlowId } from './economy.js';
import type { Outcome } from './elo.js';
import type { AchievementCode } from './achievements.js';
import type { Category, GameCategory } from './categories.js';

/**
 * Фазы партии: waiting (ждём соперника) → lobby (оба на месте) → countdown (3 с)
 * → question (15 с) → reveal (3 с) → … × 10 → finished.
 * Отдельно: expired (лобби истекло) и cancelled (отмена создателем, выход из тренировки
 * или никто не дал ни одного ответа).
 */
export type GamePhase = 'waiting' | 'lobby' | 'draft' | 'countdown' | 'question' | 'reveal' | 'finished' | 'expired' | 'cancelled';

/** link - дуэль по ссылке, quick - быстрая игра, rematch - реванш, solo - тренировка. */
export type GameMode = 'link' | 'quick' | 'rematch' | 'solo';

/** completed - сыграли до конца, forfeit - кто-то сдался, abandoned - не вернулся за 30 с. */
export type FinishReason = 'completed' | 'forfeit' | 'abandoned';

/** creator - создатель отменил, left - вышли из тренировки, no_answers - никто ни разу не ответил. */
export type CancelReason = 'creator' | 'left' | 'no_answers';

export const ACTIVE_PHASES: readonly GamePhase[] = ['draft', 'countdown', 'question', 'reveal'];
export const OPEN_PHASES: readonly GamePhase[] = ['waiting', 'lobby'];
export const FINAL_PHASES: readonly GamePhase[] = ['finished', 'expired', 'cancelled'];

/** Публичная карточка игрока: то, что видит соперник в лобби и в партии. */
export interface PlayerProfile {
  /** Имя из Telegram (first_name). */
  name: string;
  username: string | null;
  photoUrl: string | null;
  rating: number;
  /** Свечение аватарки из магазина (видят соперники). */
  glow: GlowId;
}

/**
 * Обновление 2.0: старт «Микса» - каждому выпадает 3 темы, он выбирает одну (10 с, не успел -
 * выберется сама), вопросы поровну из темы каждого игрока.
 */
export const DRAFT = { offers: 3, pickMs: 10_000, revealMs: 3_000 } as const;

export interface DraftView {
  /** Мои три темы. */
  offers: Category[];
  myPick: Category | null;
  oppPicked: boolean;
  /** Оба выбрали: видно тему соперника, через revealMs - отсчёт. */
  revealed: boolean;
  oppPick: Category | null;
}

/**
 * Обновление 2.0: режим партии. classic - как в ТЗ; lives - 3 ошибки и поражение;
 * sudden - первая ошибка и поражение; final - последние 3 вопроса дают двойные очки.
 * Время на ответ и число вопросов выбирает создатель (по умолчанию 10 вопросов по 15 с).
 * В рейтинг идёт только «Классика».
 */
export const VARIANTS = ['classic', 'lives', 'sudden', 'final'] as const;
export type Variant = (typeof VARIANTS)[number];
export const TIME_OPTIONS = [5, 10, 15, 20] as const;
export const COUNT_OPTIONS = [5, 10, 15, 20] as const;
export const MAX_QUESTIONS = 20;

export interface GameRules {
  variant: Variant;
  /** Секунд на ответ. */
  timeSec: number;
  /** Вопросов в партии. */
  count: number;
}

export const DEFAULT_RULES: GameRules = { variant: 'classic', timeSec: 15, count: 10 };

/** Сколько ошибок до поражения (0 - жизней нет). */
export const VARIANT_LIVES: Readonly<Record<Variant, number>> = { classic: 0, lives: 3, sudden: 1, final: 0 };

/** «Финал ×2»: столько последних вопросов идут вдвойне. */
export const FINAL_DOUBLE = 3;

/** Очки этого вопроса удваиваются («Финал ×2»). */
export function isDoubled(rules: GameRules, index: number, total = rules.count): boolean {
  return rules.variant === 'final' && index >= total - Math.min(FINAL_DOUBLE, total);
}

export function sameRules(a: GameRules, b: GameRules): boolean {
  return a.variant === b.variant && a.timeSec === b.timeSec && a.count === b.count;
}

export interface PlayerView extends PlayerProfile {
  userId: number;
  /** Режим с жизнями: сколько осталось; null - жизней нет. */
  lives: number | null;
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
  /** Очки за этот вопрос удваиваются («Финал ×2»). */
  doubled: boolean;
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

/** Итог тренировки: счёт и рекорд категории до этой попытки. */
export interface SoloResultView {
  score: number;
  /** Рекорд категории до этой попытки; null - тренировок в ней ещё не было. */
  prevBest: number | null;
  /** Побит рекорд (первая попытка с очками - тоже рекорд). */
  record: boolean;
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
  /** Ачивки, полученные в этой партии. */
  newAchievements: AchievementCode[];
  /** Только у тренировки: счёт и рекорд; null - дуэль или итоги ещё считаются. */
  solo: SoloResultView | null;
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
  /** Режим, время на ответ и число вопросов. */
  rules: GameRules;
  /** Микс: выбор темы перед партией (фаза draft); null - выбора нет. */
  draft: DraftView | null;
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
  /** Тренировка: рекорд категории до этой попытки (показывается в счёте вместо соперника). */
  soloBest: number | null;
}

/** Реакции сопернику: фиксированный набор, свободного чата нет - модерировать нечего. */
export const REACTIONS = ['👍', '😂', '😮', '😤', '🔥', '👏'] as const;
/** Реакция: базовый набор (REACTIONS) или купленный набор из магазина (REACTION_PACKS). */
export type Reaction = string;
/** Не чаще одной реакции в 2 с от игрока (сервер проверяет сам). */
export const REACTION_COOLDOWN_MS = 2_000;
/** Где можно слать реакции: лобби (и его часть отсчёта), раскрытие вопроса и итоги. Во время вопроса - нет. */
export const REACTION_PHASES: readonly GamePhase[] = ['lobby', 'countdown', 'reveal', 'finished'];
