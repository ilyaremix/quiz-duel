import { describe, expect, it } from 'vitest';
import {
  ACHIEVEMENT_CODES,
  ACHIEVEMENTS,
  achievementProgress,
  applyDuel,
  applySolo,
  EMPTY_TOTALS,
  newAchievements,
  type AchievementCode,
  type AnswerFact,
  type DuelFacts,
  type PlayerTotals,
} from '../src/achievements.js';

const ok = (timeMs = 5_000): AnswerFact => ({ correct: true, timeMs });
const bad = (timeMs = 5_000): AnswerFact => ({ correct: false, timeMs });

/** Обычная дуэль: 6 верных из 10, всё время впереди, победа. */
function duel(over: Partial<DuelFacts> = {}): DuelFacts {
  return {
    kind: 'duel',
    outcome: 'win',
    technical: false,
    category: 'science',
    answers: [ok(), bad(), ok(), bad(), ok(), bad(), ok(), bad(), ok(), ok()],
    scoresAfter: Array.from({ length: 10 }, (_, i) => [1000 * (i + 1), 500 * i] as const),
    rematchAfterLoss: false,
    ...over,
  };
}

const totals = (over: Partial<PlayerTotals> = {}): PlayerTotals => ({ ...EMPTY_TOTALS, ...over });
const none = new Set<AchievementCode>();

/** Ачивки после одной партии с указанными цифрами «до». */
function after(before: Partial<PlayerTotals>, facts: DuelFacts, unlocked = none, delta = 0) {
  return newAchievements(applyDuel(totals(before), facts, delta), facts, unlocked);
}

describe('сводные цифры после партии', () => {
  it('победа: +1 игра, +1 победа, серия, верные, рейтинг, победа в категории', () => {
    const t = applyDuel(totals({ currentStreak: 2, bestStreak: 2 }), duel(), 16);
    expect(t).toMatchObject({ games: 1, wins: 1, currentStreak: 3, bestStreak: 3, totalCorrect: 6, rating: 1016 });
    expect(t.categoryWins).toEqual({ science: 1 });
  });

  it('поражение и ничья обнуляют серию, лучшая серия остаётся', () => {
    expect(applyDuel(totals({ currentStreak: 4, bestStreak: 4 }), duel({ outcome: 'loss' }), -16)).toMatchObject({
      losses: 1,
      currentStreak: 0,
      bestStreak: 4,
    });
    expect(applyDuel(totals({ currentStreak: 2 }), duel({ outcome: 'draw' }), 0)).toMatchObject({
      draws: 1,
      currentStreak: 0,
    });
  });

  it('техническое поражение считается обычным поражением', () => {
    expect(applyDuel(totals(), duel({ outcome: 'loss', technical: true }), -20)).toMatchObject({ games: 1, losses: 1 });
  });

  it('победа в «Миксе» не идёт в победы по категориям', () => {
    expect(applyDuel(totals(), duel({ category: 'mix' }), 0).categoryWins).toEqual({});
  });

  it('тренировка добавляет только верные ответы', () => {
    expect(applySolo(totals({ totalCorrect: 5 }), { kind: 'solo', correct: 7 })).toEqual(totals({ totalCorrect: 12 }));
  });
});

describe('12 ачивок', () => {
  it('в списке ровно 12 кодов, у каждого есть определение', () => {
    expect(ACHIEVEMENT_CODES).toHaveLength(12);
    expect(ACHIEVEMENTS.map((a) => a.code)).toEqual([...ACHIEVEMENT_CODES]);
  });

  it('Первая кровь - первая победа', () => {
    expect(after({}, duel())).toContain('first_blood');
    expect(after({}, duel({ outcome: 'loss' }))).not.toContain('first_blood');
  });

  it('На волне и Неудержимый - 3 и 5 побед подряд', () => {
    expect(after({ wins: 1, currentStreak: 1 }, duel())).not.toContain('on_a_roll');
    expect(after({ wins: 2, currentStreak: 2 }, duel())).toContain('on_a_roll');
    expect(after({ wins: 4, currentStreak: 4 }, duel())).toEqual(expect.arrayContaining(['on_a_roll', 'unstoppable']));
  });

  it('Идеальная партия - 10 из 10', () => {
    expect(after({}, duel({ answers: Array.from({ length: 10 }, () => ok()) }))).toContain('perfect_game');
    expect(after({}, duel())).not.toContain('perfect_game');
  });

  it('Идеальная партия даётся и при поражении', () => {
    const perfect = duel({ outcome: 'loss', answers: Array.from({ length: 10 }, () => ok()) });
    expect(after({}, perfect)).toContain('perfect_game');
  });

  it('Молния - верный быстрее 2 с, неверный быстрый не считается', () => {
    expect(after({}, duel({ answers: [ok(1_999)] }))).toContain('lightning');
    expect(after({}, duel({ answers: [ok(2_000)] }))).not.toContain('lightning');
    expect(after({}, duel({ answers: [bad(500)] }))).not.toContain('lightning');
  });

  it('Хладнокровие - верный, когда оставалось меньше 1 с (и в допуске на сеть)', () => {
    expect(after({}, duel({ answers: [ok(14_001)] }))).toContain('ice_cold');
    expect(after({}, duel({ answers: [ok(15_250)] }))).toContain('ice_cold');
    expect(after({}, duel({ answers: [ok(14_000)] }))).not.toContain('ice_cold');
    expect(after({}, duel({ answers: [bad(14_500)] }))).not.toContain('ice_cold');
  });

  it('Камбэк - победа после отставания после 5-го вопроса', () => {
    const behind = Array.from({ length: 10 }, (_, i): readonly [number, number] => (i < 5 ? [100 * i, 900 * (i + 1)] : [9000, 5000]));
    expect(after({}, duel({ scoresAfter: behind }))).toContain('comeback');
    expect(after({}, duel({ scoresAfter: behind, outcome: 'loss' }))).not.toContain('comeback');
    expect(after({}, duel())).not.toContain('comeback');
    // ничья после 5-го - не отставание
    const level = behind.map((s, i): readonly [number, number] => (i === 4 ? [3000, 3000] : s));
    expect(after({}, duel({ scoresAfter: level }))).not.toContain('comeback');
  });

  it('Реваншист - победа в реванше после поражения', () => {
    expect(after({}, duel({ rematchAfterLoss: true }))).toContain('revenge');
    expect(after({}, duel({ rematchAfterLoss: true, outcome: 'draw' }))).not.toContain('revenge');
  });

  it('Эрудит - 100 верных всего, в том числе в тренировках', () => {
    expect(after({ totalCorrect: 93 }, duel({ outcome: 'loss' }))).not.toContain('erudite');
    expect(after({ totalCorrect: 94 }, duel({ outcome: 'loss' }))).toContain('erudite');
    const t = applySolo(totals({ totalCorrect: 95 }), { kind: 'solo', correct: 5 });
    expect(newAchievements(t, { kind: 'solo', correct: 5 }, none)).toEqual(['erudite']);
  });

  it('Знаток темы - 10 побед в одной категории', () => {
    expect(after({ wins: 9, categoryWins: { sport: 9 } }, duel({ category: 'sport' }))).toContain('category_master');
    expect(after({ wins: 9, categoryWins: { sport: 9 } }, duel({ category: 'tech' }))).not.toContain('category_master');
    expect(after({ wins: 9, categoryWins: { sport: 9 } }, duel({ category: 'mix' }))).not.toContain('category_master');
  });

  it('Ветеран - 50 дуэлей, любой исход', () => {
    expect(after({ games: 49 }, duel({ outcome: 'loss' }))).toContain('veteran');
    expect(after({ games: 48 }, duel({ outcome: 'loss' }))).not.toContain('veteran');
  });

  it('На вершине - рейтинг 1200', () => {
    expect(after({ rating: 1190 }, duel(), none, 10)).toContain('summit');
    expect(after({ rating: 1190 }, duel(), none, 9)).not.toContain('summit');
  });

  it('технический исход не даёт ничего, кроме Эрудита', () => {
    const tech = duel({ technical: true, answers: [ok(1_000)] });
    expect(after({ totalCorrect: 99, games: 49, rating: 1199 }, tech, none, 20)).toEqual(['erudite']);
  });

  it('первая победа техническая - Первая кровь придёт со следующей обычной победой, а не на поражении', () => {
    const t1 = applyDuel(totals(), duel({ technical: true }), 20);
    expect(newAchievements(t1, duel({ technical: true }), none)).toEqual([]);
    const lossFacts = duel({ outcome: 'loss' });
    expect(newAchievements(applyDuel(t1, lossFacts, -20), lossFacts, none)).not.toContain('first_blood');
    expect(newAchievements(applyDuel(t1, duel(), 20), duel(), none)).toContain('first_blood');
  });

  it('уже полученные не выдаются повторно', () => {
    expect(after({}, duel(), new Set(['first_blood']))).not.toContain('first_blood');
  });
});

describe('прогресс ачивок', () => {
  it('«37/100» у Эрудита, рейтинг до 1200, разовые 0/1', () => {
    const t = totals({ totalCorrect: 37, rating: 1016 });
    expect(achievementProgress('erudite', t, none)).toEqual({ current: 37, goal: 100 });
    expect(achievementProgress('summit', t, none)).toEqual({ current: 1016, goal: 1200 });
    expect(achievementProgress('lightning', t, none)).toEqual({ current: 0, goal: 1 });
  });

  it('полученная - полная полоска, прогресс не больше цели', () => {
    expect(achievementProgress('lightning', totals(), new Set(['lightning']))).toEqual({ current: 1, goal: 1 });
    expect(achievementProgress('erudite', totals({ totalCorrect: 140 }), none)).toEqual({ current: 100, goal: 100 });
  });
});
