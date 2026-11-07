import { describe, expect, it } from 'vitest';
import type { DuelFacts } from '@quiz-duel/shared';
import { computeSettlement, type PlayerGameInput } from '../src/game/settle.js';
import { memoryPlayer } from '../src/game/repo.js';

const facts = (outcome: DuelFacts['outcome'], category: DuelFacts['category'] = 'mix', technical = false): DuelFacts => ({
  kind: 'duel',
  outcome,
  technical,
  category,
  answers: Array.from({ length: 10 }, (_, i) => ({ correct: i < 6, timeMs: 3_000 })),
  scoresAfter: [],
  rematchAfterLoss: false,
});
const input = (userId: number, f: DuelFacts): PlayerGameInput => ({
  userId,
  facts: f,
  byCategory: { science: { answered: 4, correct: 3 }, tech: { answered: 6, correct: 3 } },
  questionsPlayed: 10,
  correct: 6,
  correctTimeMs: 18_000,
});

describe('computeSettlement', () => {
  it('«Микс»: точность - по темам вопросов, победа в категорию не идёт', () => {
    const [a, b] = computeSettlement([memoryPlayer(1), memoryPlayer(2)], { gameId: 'x', players: [input(1, facts('win')), input(2, facts('loss'))] });
    expect(a.categoryAdd).toEqual({ science: { answered: 4, correct: 3, wins: 0 }, tech: { answered: 6, correct: 3, wins: 0 } });
    expect(a.totals.categoryWins).toEqual({ science: 0, history: 0, culture: 0, sport: 0, tech: 0 });
    expect(b.delta).toBe(-20);
  });

  it('рейтинг считается от сохранённых значений: у каждого свой K', () => {
    const [a, b] = computeSettlement([memoryPlayer(1, { rating: 1016, games: 24 }), memoryPlayer(2, { rating: 1004, games: 31 })], {
      gameId: 'x',
      players: [input(1, facts('win', 'science')), input(2, facts('loss', 'science'))],
    });
    expect([a.before, a.delta, a.totals.rating]).toEqual([1016, 12, 1028]);
    expect([b.before, b.delta, b.totals.rating]).toEqual([1004, -12, 992]);
    expect(a.categoryAdd.science?.wins).toBe(1);
  });

  it('уже полученная ачивка второй раз не выдаётся', () => {
    const [a] = computeSettlement([memoryPlayer(1, { unlocked: new Set(['first_blood']) }), memoryPlayer(2)], {
      gameId: 'x',
      players: [input(1, facts('win')), input(2, facts('loss'))],
    });
    expect(a.achievements).not.toContain('first_blood');
  });

  it('техническая победа: рейтинг и статистика как за победу, ачивки - только «Эрудит»', () => {
    const [a] = computeSettlement([memoryPlayer(1, { totalCorrect: 97 }), memoryPlayer(2)], {
      gameId: 'x',
      players: [input(1, facts('win', 'mix', true)), input(2, facts('loss', 'mix', true))],
    });
    expect(a.delta).toBe(20);
    expect(a.totals.wins).toBe(1);
    expect(a.achievements).toEqual(['erudite']);
  });
});
