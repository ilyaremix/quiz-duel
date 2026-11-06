/** Рейтинг Эло из ТЗ: старт 1000, K = 40 первые 10 партий, потом 24. */
export const ELO = {
  start: 1000,
  kNew: 40,
  k: 24,
  /** Сколько первых рейтинговых партий считаются с повышенным K. */
  newGames: 10,
} as const;

export type Outcome = 'win' | 'loss' | 'draw';

/** Победа = 1, ничья = 0,5, поражение = 0. Техническое поражение - обычное поражение. */
export function outcomeScore(outcome: Outcome): number {
  return outcome === 'win' ? 1 : outcome === 'draw' ? 0.5 : 0;
}

/** gamesPlayed - сколько рейтинговых партий сыграно ДО этой. */
export function kFactor(gamesPlayed: number): number {
  return gamesPlayed < ELO.newGames ? ELO.kNew : ELO.k;
}

/** Ожидаемый результат игрока с рейтингом rating против opponentRating (0..1). */
export function expectedScore(rating: number, opponentRating: number): number {
  return 1 / (1 + 10 ** ((opponentRating - rating) / 400));
}

/** Изменение рейтинга одного игрока, округлённое до целого. */
export function eloDelta(rating: number, opponentRating: number, outcome: Outcome, gamesPlayed: number): number {
  const delta = kFactor(gamesPlayed) * (outcomeScore(outcome) - expectedScore(rating, opponentRating));
  // Math.round(-0.5) даёт -0; приводим к обычному нулю.
  return Math.round(delta) || 0;
}

export interface RatedPlayer {
  rating: number;
  /** Рейтинговых партий до этой. */
  games: number;
}

const flip: Record<Outcome, Outcome> = { win: 'loss', loss: 'win', draw: 'draw' };

/**
 * Изменения рейтинга обоих по итогу партии. У каждого свой K, поэтому
 * сумма может быть не нулевой (новичок теряет и получает больше).
 */
export function rateGame(a: RatedPlayer, b: RatedPlayer, outcomeForA: Outcome): { a: number; b: number } {
  return {
    a: eloDelta(a.rating, b.rating, outcomeForA, a.games),
    b: eloDelta(b.rating, a.rating, flip[outcomeForA], b.games),
  };
}
