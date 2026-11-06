import { describe, expect, it } from 'vitest';
import { isAnswerInTime, MAX_GAME_SCORE, pointsFor } from '../src/scoring.js';
import { ELO, eloDelta, expectedScore, kFactor, rateGame } from '../src/elo.js';

describe('очки за ответ', () => {
  it.each([
    [0, 1000],
    [1, 1000],
    [7_500, 750],
    [3_900, 870], // «+870» из макетов: осталось 11,1 с
    [14_999, 500],
    [15_000, 500],
    [15_300, 500], // допуск на сеть: 500
    [-50, 1000], // часы не идеальны - не больше максимума
  ])('верно за %i мс → %i', (ms, points) => {
    expect(pointsFor(true, ms)).toBe(points);
  });

  it('неверный или нет ответа - 0', () => {
    expect(pointsFor(false, 100)).toBe(0);
  });

  it('никогда не меньше 500 и не больше 1000 за верный', () => {
    for (let ms = -1000; ms <= 20_000; ms += 37) {
      const p = pointsFor(true, ms);
      expect(p).toBeGreaterThanOrEqual(500);
      expect(p).toBeLessThanOrEqual(1000);
      expect(Number.isInteger(p)).toBe(true);
    }
  });

  it('ответ принимается до 15 с + 300 мс допуска', () => {
    expect(isAnswerInTime(0)).toBe(true);
    expect(isAnswerInTime(15_000)).toBe(true);
    expect(isAnswerInTime(15_300)).toBe(true);
    expect(isAnswerInTime(15_301)).toBe(false);
    expect(isAnswerInTime(-1)).toBe(false);
  });

  it('максимум за партию 10 000', () => {
    expect(MAX_GAME_SCORE).toBe(10_000);
  });
});

describe('Эло', () => {
  it('K = 40 первые 10 партий, потом 24', () => {
    expect(kFactor(0)).toBe(40);
    expect(kFactor(9)).toBe(40);
    expect(kFactor(10)).toBe(24);
  });

  it('равные рейтинги: ожидание 0,5', () => {
    expect(expectedScore(1000, 1000)).toBe(0.5);
  });

  it('равные новички: победа +20, поражение -20, ничья 0', () => {
    expect(eloDelta(1000, 1000, 'win', 0)).toBe(20);
    expect(eloDelta(1000, 1000, 'loss', 0)).toBe(-20);
    expect(eloDelta(1000, 1000, 'draw', 0)).toBe(0);
    expect(Object.is(eloDelta(1000, 1000, 'draw', 0), -0)).toBe(false);
  });

  it('опытные игроки: K = 24', () => {
    expect(eloDelta(1000, 1000, 'win', 30)).toBe(12);
  });

  it('победа над сильным даёт больше, над слабым - меньше', () => {
    expect(eloDelta(1000, 1200, 'win', 30)).toBeGreaterThan(eloDelta(1000, 800, 'win', 30));
    expect(eloDelta(1200, 1000, 'win', 30)).toBe(6);
    expect(eloDelta(1000, 1200, 'win', 30)).toBe(18);
  });

  it('ничья с сильным - плюс слабому', () => {
    expect(eloDelta(1000, 1200, 'draw', 30)).toBeGreaterThan(0);
    expect(eloDelta(1200, 1000, 'draw', 30)).toBeLessThan(0);
  });

  it('rateGame: у каждого свой K', () => {
    // 1016 (24 партии) против 1004 (31 партия): E = 0,517, 24 × 0,483 = 11,6 → +12 / -12
    expect(rateGame({ rating: 1016, games: 24 }, { rating: 1004, games: 31 }, 'win')).toEqual({ a: 12, b: -12 });
    // новичок против опытного: новичок получает больше
    const r = rateGame({ rating: ELO.start, games: 0 }, { rating: ELO.start, games: 50 }, 'win');
    expect(r).toEqual({ a: 20, b: -12 });
  });
});
