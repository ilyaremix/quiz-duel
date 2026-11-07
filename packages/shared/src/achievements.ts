import type { Outcome } from './elo.js';
import { CATEGORIES, type Category, type GameCategory } from './categories.js';
import { TIMINGS } from './scoring.js';

/** Сводные цифры игрока - то, что лежит в users и category_stats. */
export interface PlayerTotals {
  rating: number;
  /** Рейтинговых дуэлей сыграно. */
  games: number;
  wins: number;
  losses: number;
  draws: number;
  currentStreak: number;
  bestStreak: number;
  /** Верных ответов всего: дуэли + тренировки (нужно «Эрудиту»). */
  totalCorrect: number;
  /** Побед по категориям. «Микс» сюда не входит: это не категория. */
  categoryWins: Partial<Record<Category, number>>;
}

export const EMPTY_TOTALS: PlayerTotals = {
  rating: 1000,
  games: 0,
  wins: 0,
  losses: 0,
  draws: 0,
  currentStreak: 0,
  bestStreak: 0,
  totalCorrect: 0,
  categoryWins: {},
};

/** Ответ игрока на один вопрос партии; null - не успел. */
export interface AnswerFact {
  correct: boolean;
  /** От старта вопроса до получения ответа сервером. */
  timeMs: number;
}

/** Что произошло в рейтинговой дуэли для одного игрока. */
export interface DuelFacts {
  kind: 'duel';
  outcome: Outcome;
  /** Партия закончилась сдачей или уходом (forfeit / abandoned). */
  technical: boolean;
  category: GameCategory;
  answers: readonly (AnswerFact | null)[];
  /** Счёт после каждого вопроса: [мой, соперника]. */
  scoresAfter: readonly (readonly [number, number])[];
  /** Это реванш, и предыдущую партию с этим соперником игрок проиграл. */
  rematchAfterLoss: boolean;
}

/** Тренировка: не влияет на рейтинг, идёт только в «Эрудита». */
export interface SoloFacts {
  kind: 'solo';
  correct: number;
}

export type GameFacts = DuelFacts | SoloFacts;

export const correctCount = (answers: readonly (AnswerFact | null)[]): number =>
  answers.filter((a) => a?.correct).length;

/** Сводные цифры после дуэли. Техническое поражение считается обычным (иначе от проигрыша можно сбежать). */
export function applyDuel(totals: PlayerTotals, facts: DuelFacts, ratingDelta: number): PlayerTotals {
  const win = facts.outcome === 'win';
  const currentStreak = win ? totals.currentStreak + 1 : 0;
  const categoryWins = { ...totals.categoryWins };
  if (win && facts.category !== 'mix') categoryWins[facts.category] = (categoryWins[facts.category] ?? 0) + 1;

  return {
    rating: totals.rating + ratingDelta,
    games: totals.games + 1,
    wins: totals.wins + (win ? 1 : 0),
    losses: totals.losses + (facts.outcome === 'loss' ? 1 : 0),
    draws: totals.draws + (facts.outcome === 'draw' ? 1 : 0),
    currentStreak,
    bestStreak: Math.max(totals.bestStreak, currentStreak),
    totalCorrect: totals.totalCorrect + correctCount(facts.answers),
    categoryWins,
  };
}

export function applySolo(totals: PlayerTotals, facts: SoloFacts): PlayerTotals {
  return { ...totals, totalCorrect: totals.totalCorrect + facts.correct };
}

export const ACHIEVEMENT_CODES = [
  'first_blood',
  'on_a_roll',
  'unstoppable',
  'perfect_game',
  'lightning',
  'ice_cold',
  'comeback',
  'revenge',
  'erudite',
  'category_master',
  'veteran',
  'summit',
] as const;
export type AchievementCode = (typeof ACHIEVEMENT_CODES)[number];

const bestCategoryWins = (t: PlayerTotals) => Math.max(0, ...CATEGORIES.map((c) => t.categoryWins[c] ?? 0));

interface AchievementDef {
  code: AchievementCode;
  /** Цель для полоски прогресса «37/100». */
  goal: number;
  /** Прогресс по сводным цифрам; у разовых ачивок (за событие в партии) его нет. */
  progress?: (t: PlayerTotals) => number;
  /** Условие, проверяемое в конце партии по сводным цифрам после неё и фактам партии. */
  earned: (t: PlayerTotals, facts: GameFacts) => boolean;
}

const duel = (facts: GameFacts): facts is DuelFacts => facts.kind === 'duel';
const won = (facts: GameFacts) => duel(facts) && facts.outcome === 'win';

/**
 * 12 ачивок из ТЗ. Тексты - в словарях мини-аппа по коду.
 * Ачивки за победы выдаются только на победе: если первую победу принесла
 * техническая (она ачивок не даёт), «Первая кровь» придёт со следующей обычной победой,
 * а не всплывёт на поражении.
 */
export const ACHIEVEMENTS: readonly AchievementDef[] = [
  { code: 'first_blood', goal: 1, progress: (t) => t.wins, earned: (t, f) => won(f) && t.wins >= 1 },
  { code: 'on_a_roll', goal: 3, progress: (t) => t.bestStreak, earned: (t, f) => won(f) && t.currentStreak >= 3 },
  { code: 'unstoppable', goal: 5, progress: (t) => t.bestStreak, earned: (t, f) => won(f) && t.currentStreak >= 5 },
  {
    code: 'perfect_game',
    goal: 1,
    earned: (_, f) => duel(f) && f.answers.length >= 10 && correctCount(f.answers) === f.answers.length,
  },
  {
    code: 'lightning',
    goal: 1,
    earned: (_, f) => duel(f) && f.answers.some((a) => a?.correct && a.timeMs < 2_000),
  },
  {
    // Оставалось меньше секунды: ответ позже 14 с (в том числе в допуске на сеть).
    code: 'ice_cold',
    goal: 1,
    earned: (_, f) => duel(f) && f.answers.some((a) => a?.correct && a.timeMs > TIMINGS.questionMs - 1_000),
  },
  {
    // Победа, хотя после 5-го вопроса игрок отставал.
    code: 'comeback',
    goal: 1,
    earned: (_, f) => {
      if (!duel(f) || !won(f)) return false;
      const afterFifth = f.scoresAfter[4];
      return afterFifth !== undefined && afterFifth[0] < afterFifth[1];
    },
  },
  { code: 'revenge', goal: 1, earned: (_, f) => won(f) && duel(f) && f.rematchAfterLoss },
  { code: 'erudite', goal: 100, progress: (t) => t.totalCorrect, earned: (t) => t.totalCorrect >= 100 },
  { code: 'category_master', goal: 10, progress: bestCategoryWins, earned: (t, f) => won(f) && bestCategoryWins(t) >= 10 },
  { code: 'veteran', goal: 50, progress: (t) => t.games, earned: (t) => t.games >= 50 },
  { code: 'summit', goal: 1200, progress: (t) => t.rating, earned: (t) => t.rating >= 1200 },
];

/**
 * Новые ачивки по итогу партии. totals - цифры уже ПОСЛЕ этой партии.
 * Тренировки и технические исходы дают только «Эрудита» (по ТЗ).
 */
export function newAchievements(
  totals: PlayerTotals,
  facts: GameFacts,
  unlocked: ReadonlySet<AchievementCode>,
): AchievementCode[] {
  const onlyErudite = facts.kind === 'solo' || facts.technical;
  return ACHIEVEMENTS.filter(
    (a) => !unlocked.has(a.code) && (!onlyErudite || a.code === 'erudite') && a.earned(totals, facts),
  ).map((a) => a.code);
}

/** Прогресс для экрана ачивок: { current, goal }. Разовые - 0 или 1. */
export function achievementProgress(
  code: AchievementCode,
  totals: PlayerTotals,
  unlocked: ReadonlySet<AchievementCode>,
): { current: number; goal: number } {
  const def = ACHIEVEMENTS.find((a) => a.code === code)!;
  if (unlocked.has(code)) return { current: def.goal, goal: def.goal };
  const current = def.progress ? Math.min(def.goal, Math.max(0, def.progress(totals))) : 0;
  return { current, goal: def.goal };
}
