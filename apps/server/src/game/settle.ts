/**
 * Итоги рейтинговой дуэли: рейтинг Эло, статистика, статистика по категориям и ачивки.
 * Чистая функция - без базы. Хранилище (repo.settle) читает цифры игроков под блокировкой,
 * вызывает её и записывает результат в той же транзакции.
 */
import { applyDuel, CATEGORIES, newAchievements, rateGame, type AchievementCode, type Category, type DuelFacts, type PlayerTotals } from '@quiz-duel/shared';
import type { QuestionBank } from '../questions/bank.js';
import { duelFacts } from './facts.js';
import { changesRating, outcomeFor, participants, playerOf, type GameState, type Settlement } from './machine.js';

export interface CategoryCounters {
  answered: number;
  correct: number;
  wins: number;
}

/** Что лежит в базе об игроке до партии. */
export interface StoredPlayer {
  userId: number;
  rating: number;
  games: number;
  wins: number;
  losses: number;
  draws: number;
  currentStreak: number;
  bestStreak: number;
  totalCorrect: number;
  questionsPlayed: number;
  duelCorrect: number;
  correctTimeMs: number;
  categories: Partial<Record<Category, CategoryCounters>>;
  unlocked: ReadonlySet<AchievementCode>;
}

/** Что дала партия одному игроку (считается из снимка партии, без базы). */
export interface PlayerGameInput {
  userId: number;
  facts: DuelFacts;
  /** Сыграно и верно по темам самих вопросов. */
  byCategory: Partial<Record<Category, { answered: number; correct: number }>>;
  questionsPlayed: number;
  correct: number;
  correctTimeMs: number;
}

export interface SettleInput {
  gameId: string;
  players: [PlayerGameInput, PlayerGameInput];
  /** Меняется ли рейтинг: только в «Классике» (остальные режимы - без рейтинга, статистика идёт). */
  rated?: boolean;
}

/** Изменения одного игрока: новые значения колонок и прибавки по категориям. */
export interface PlayerUpdate {
  userId: number;
  before: number;
  delta: number;
  totals: PlayerTotals;
  questionsPlayed: number;
  duelCorrect: number;
  correctTimeMs: number;
  /** Прибавки к category_stats (только темы, где что-то изменилось). */
  categoryAdd: Partial<Record<Category, CategoryCounters>>;
  achievements: AchievementCode[];
}

/**
 * Факты партии для подсчёта. rematchAfterLoss - у кого из игроков прошлая партия этой пары
 * (rematchOf) закончилась поражением (нужно ачивке «Реваншист»).
 */
export function settleInput(state: GameState, bank: QuestionBank, lostPrevious: ReadonlySet<number> = new Set()): SettleInput {
  const [a, b] = participants(state);
  if (!a || !b || !state.finish) throw new Error('итоги считаются только у завершённой дуэли');
  const one = (userId: number): PlayerGameInput => {
    const me = playerOf(state, userId)!;
    const byCategory: PlayerGameInput['byCategory'] = {};
    let correct = 0;
    let correctTimeMs = 0;
    // Только закрытые вопросы: ответ на вопрос, во время которого кто-то сдался, не считается.
    for (let i = 0; i < state.closed; i++) {
      const q = state.questions[i];
      const category = q ? bank.byId.get(q.id)?.category : undefined;
      const answer = me.answers[i] ?? null;
      if (category) {
        const c = (byCategory[category] ??= { answered: 0, correct: 0 });
        c.answered += 1;
        if (answer?.correct) c.correct += 1;
      }
      if (answer?.correct) {
        correct += 1;
        correctTimeMs += answer.timeMs;
      }
    }
    return {
      userId,
      facts: duelFacts(state, userId, lostPrevious.has(userId)),
      byCategory,
      questionsPlayed: state.closed,
      correct,
      correctTimeMs,
    };
  };
  return { gameId: state.id, players: [one(a.userId), one(b.userId)], rated: changesRating(state) };
}

const totalsOf = (p: StoredPlayer): PlayerTotals => ({
  rating: p.rating,
  games: p.games,
  wins: p.wins,
  losses: p.losses,
  draws: p.draws,
  currentStreak: p.currentStreak,
  bestStreak: p.bestStreak,
  totalCorrect: p.totalCorrect,
  categoryWins: Object.fromEntries(CATEGORIES.map((c) => [c, p.categories[c]?.wins ?? 0])),
});

/**
 * Считает итоги обоих игроков. Эло - по рейтингам на момент подсчёта (прочитанным
 * под блокировкой), у каждого свой K: 40 первые 10 партий, потом 24.
 * Техническое поражение считается обычным поражением.
 */
export function computeSettlement(stored: [StoredPlayer, StoredPlayer], input: SettleInput): [PlayerUpdate, PlayerUpdate] {
  const [ia, ib] = input.players;
  const sa = stored.find((p) => p.userId === ia.userId);
  const sb = stored.find((p) => p.userId === ib.userId);
  if (!sa || !sb) throw new Error('нет данных игрока для итогов');

  const deltas =
    input.rated === false ? { a: 0, b: 0 } : rateGame({ rating: sa.rating, games: sa.games }, { rating: sb.rating, games: sb.games }, ia.facts.outcome);

  const one = (s: StoredPlayer, i: PlayerGameInput, delta: number): PlayerUpdate => {
    const totals = applyDuel(totalsOf(s), i.facts, delta);
    // «Эрудит» считает и верные ответы дуэли: applyDuel уже прибавил их к totalCorrect.
    const achievements = newAchievements(totals, i.facts, s.unlocked);
    const categoryAdd: PlayerUpdate['categoryAdd'] = {};
    for (const c of CATEGORIES) {
      const played = i.byCategory[c];
      const win = i.facts.outcome === 'win' && i.facts.category === c ? 1 : 0;
      if (!played && !win) continue;
      categoryAdd[c] = { answered: played?.answered ?? 0, correct: played?.correct ?? 0, wins: win };
    }
    return {
      userId: s.userId,
      before: s.rating,
      delta,
      totals,
      questionsPlayed: s.questionsPlayed + i.questionsPlayed,
      duelCorrect: s.duelCorrect + i.correct,
      correctTimeMs: s.correctTimeMs + i.correctTimeMs,
      categoryAdd,
      achievements,
    };
  };

  return [one(sa, ia, deltas.a), one(sb, ib, deltas.b)];
}

export function toSettlement(updates: readonly PlayerUpdate[], at: number): Settlement {
  return {
    at,
    players: updates.map((u) => ({
      userId: u.userId,
      before: u.before,
      delta: u.delta,
      after: u.totals.rating,
      achievements: u.achievements,
    })),
  };
}

/** Кто из игроков проиграл прошлую партию пары (для «Реваншиста»). */
export function losersOf(previous: GameState | null): Set<number> {
  const out = new Set<number>();
  if (!previous?.finish) return out;
  for (const p of participants(previous)) if (outcomeFor(previous, p.userId) === 'loss') out.add(p.userId);
  return out;
}
