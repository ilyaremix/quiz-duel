import type { DuelFacts } from '@quiz-duel/shared';
import { otherOf, outcomeFor, playerOf, type GameState } from './machine.js';

/**
 * Факты завершённой дуэли для одного игрока: из них считаются статистика и ачивки.
 * rematchAfterLoss сервер знает из прошлой партии этой пары (rematchOf).
 */
export function duelFacts(state: GameState, userId: number, rematchAfterLoss = false): DuelFacts {
  const me = playerOf(state, userId);
  const opp = otherOf(state, userId);
  const outcome = outcomeFor(state, userId);
  if (!me || !opp || !outcome || !state.finish) throw new Error('факты есть только у завершённой дуэли');

  // Только закрытые вопросы: у технических исходов их меньше 10,
  // а ответ на вопрос, во время которого кто-то сдался, не засчитывается.
  const closed = state.closed;
  const scoresAfter: (readonly [number, number])[] = [];
  let mine = 0;
  let theirs = 0;
  for (let i = 0; i < closed; i++) {
    mine += me.answers[i]?.points ?? 0;
    theirs += opp.answers[i]?.points ?? 0;
    scoresAfter.push([mine, theirs]);
  }

  return {
    kind: 'duel',
    outcome,
    technical: state.finish.reason !== 'completed',
    category: state.category,
    answers: me.answers.slice(0, closed).map((a) => (a ? { correct: a.correct, timeMs: a.timeMs } : null)),
    scoresAfter,
    rematchAfterLoss: state.mode === 'rematch' && rematchAfterLoss,
  };
}
