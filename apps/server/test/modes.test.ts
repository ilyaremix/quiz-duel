/**
 * Обновление 2.0: режимы партии. Время на ответ и число вопросов, «Три жизни» и «Внезапная смерть»
 * (досрочный конец, у кого кончились жизни - тот проиграл), «Финал ×2», рейтинг только в «Классике».
 */
import { describe, expect, it } from 'vitest';
import { DEFAULT_RULES, TIMINGS, pointsFor, type GameRules } from '@quiz-duel/shared';
import { loadQuestionBank } from '../src/questions/bank.js';
import { pickQuestions, splitFor } from '../src/game/picker.js';
import { seededRng } from '../src/game/rng.js';
import { answer, createGame, livesLeft, setReady, tick, join, rulesOf, type GameState, type MachineDeps, type Step } from '../src/game/machine.js';
import { computeSettlement, settleInput } from '../src/game/settle.js';
import { memoryPlayer } from '../src/game/repo.js';
import { viewFor } from '../src/game/view.js';

const bank = loadQuestionBank();
const deps: MachineDeps = {
  correctOf: (id) => bank.byId.get(id)!.correct,
  pickQuestions: (s) => pickQuestions({ bank, category: s.category, rng: seededRng(7), count: rulesOf(s).count }),
};
const A = 1;
const B = 2;
const T0 = 1_800_000_000_000;

function ok(step: Step): GameState {
  if (!step.ok) throw new Error(`ожидался успех, получено ${step.error}`);
  return step.state;
}

function positionOf(s: GameState, correct: boolean): number {
  const q = s.questions[s.questionIndex]!;
  const right = q.order.indexOf(bank.byId.get(q.id)!.correct);
  return correct ? right : (right + 1) % 4;
}

function started(rules: GameRules): { s: GameState; now: number } {
  let s = createGame({ id: 'm1', mode: 'link', category: 'mix', creatorId: A, rules }, T0, deps);
  s = ok(join(s, B, T0 + 1000));
  s = ok(setReady(s, A, true, T0 + 2000, deps));
  s = ok(setReady(s, B, true, T0 + 3000, deps));
  const now = T0 + 3000 + TIMINGS.countdownMs;
  return { s: ok(tick(s, now, deps)), now };
}

/** Один вопрос: оба отвечают (true - верно, false - неверно, null - молчит), потом раскрытие. */
function round(s: GameState, now: number, a: boolean | null, b: boolean | null, rules: GameRules) {
  const i = s.questionIndex;
  if (a !== null) s = ok(answer(s, A, i, positionOf(s, a), now + 1000, deps));
  if (b !== null) s = ok(answer(s, B, i, positionOf(s, b), now + 2000, deps));
  // Кто-то молчит - вопрос закрывается по таймеру этой партии.
  const closeAt = a === null || b === null ? now + rules.timeSec * 1000 + TIMINGS.answerGraceMs : now + 2000;
  s = ok(tick(s, closeAt, deps));
  expect(s.phase).toBe('reveal');
  const next = closeAt + TIMINGS.revealMs;
  return { s: ok(tick(s, next, deps)), now: next };
}

describe('время на ответ и число вопросов', () => {
  it('5 вопросов по 5 с: таймер, поздний ответ, конец после 5-го', () => {
    const rules: GameRules = { variant: 'classic', timeSec: 5, count: 5 };
    let { s, now } = started(rules);
    expect(s.questions).toHaveLength(5);
    expect(s.phaseEndsAt).toBe(now + 5000);
    const v = viewFor(s, A, 'ru', bank, now)!;
    expect(v.question).toMatchObject({ total: 5, endsAt: now + 5000, doubled: false });
    expect(v.rules).toEqual(rules);
    expect(answer(s, A, 0, 0, now + 5000 + TIMINGS.answerGraceMs + 1, deps)).toEqual({ ok: false, error: 'late' });
    for (let i = 0; i < 5; i++) ({ s, now } = round(s, now, true, true, rules));
    // Очки за скорость считаются от 5 с: ответ на 1 с - 900 (из 1 000).
    expect(s.creator.answers[0]!.points).toBe(pointsFor(true, 1000, 5000));
    expect(pointsFor(true, 1000, 5000)).toBe(900);
    expect(s.phase).toBe('finished');
    expect(s.closed).toBe(5);
  });

  it('сложность партии: 30% лёгких и сложных', () => {
    expect(splitFor(5)).toEqual({ easy: 1, medium: 3, hard: 1 });
    expect(splitFor(10)).toEqual({ easy: 3, medium: 4, hard: 3 });
    expect(splitFor(15)).toEqual({ easy: 4, medium: 7, hard: 4 });
    expect(splitFor(20)).toEqual({ easy: 6, medium: 8, hard: 6 });
    for (const count of [5, 10, 15, 20]) {
      const qs = pickQuestions({ bank, category: 'science', count, rng: seededRng(count) });
      expect(new Set(qs.map((q) => q.id)).size).toBe(count);
      const mix = pickQuestions({ bank, category: 'mix', count, rng: seededRng(count) });
      expect(mix).toHaveLength(count);
    }
  });

  it('без настроек - как в ТЗ: 10 вопросов по 15 с', () => {
    const { s, now } = started(DEFAULT_RULES);
    expect(s.questions).toHaveLength(10);
    expect(s.phaseEndsAt).toBe(now + 15_000);
    // Партия до обновления (в снимке нет rules) - тоже по умолчанию.
    const legacy = { ...s, rules: undefined };
    expect(rulesOf(legacy)).toEqual(DEFAULT_RULES);
  });
});

describe('«Три жизни» и «Внезапная смерть»', () => {
  it('три ошибки - поражение досрочно, даже при равном счёте до этого', () => {
    const rules: GameRules = { variant: 'lives', timeSec: 15, count: 10 };
    let { s, now } = started(rules);
    ({ s, now } = round(s, now, true, false, rules));
    expect(livesLeft(s, s.opponent!)).toBe(2);
    expect(viewFor(s, A, 'ru', bank, now)!.opponent!.lives).toBe(2);
    ({ s, now } = round(s, now, false, null, rules));
    expect(livesLeft(s, s.creator)).toBe(2);
    expect(livesLeft(s, s.opponent!)).toBe(1);
    // Третья ошибка Марка - партия кончается после раскрытия, а не через 10 вопросов.
    ({ s, now } = round(s, now, true, false, rules));
    expect(s.phase).toBe('finished');
    expect(s.closed).toBe(3);
    expect(s.finish).toMatchObject({ reason: 'completed', winnerId: A });
  });

  it('жизни кончились у обоих на одном вопросе - решает счёт', () => {
    const rules: GameRules = { variant: 'sudden', timeSec: 15, count: 10 };
    let { s, now } = started(rules);
    ({ s, now } = round(s, now, true, true, rules));
    ({ s, now } = round(s, now, false, false, rules));
    expect(s.phase).toBe('finished');
    expect(s.closed).toBe(2);
    // Илья ответил на первый вопрос быстрее - у него больше очков.
    expect(s.finish!.winnerId).toBe(A);
  });

  it('ошибка - конец только для ошибившегося, даже если очков у него больше', () => {
    const rules: GameRules = { variant: 'sudden', timeSec: 15, count: 10 };
    let { s, now } = started(rules);
    // Илья быстрее и верно, Марк медленнее, но верно.
    ({ s, now } = round(s, now, true, true, rules));
    expect(s.creator.score).toBeGreaterThan(s.opponent!.score);
    ({ s, now } = round(s, now, false, true, rules));
    expect(s.phase).toBe('finished');
    expect(s.finish!.winnerId).toBe(B);
  });
});

describe('«Финал ×2» и рейтинг', () => {
  it('последние 3 вопроса дают двойные очки', () => {
    const rules: GameRules = { variant: 'final', timeSec: 15, count: 5 };
    let { s, now } = started(rules);
    const doubled: boolean[] = [];
    for (let i = 0; i < 5; i++) {
      doubled.push(viewFor(s, A, 'ru', bank, now)!.question!.doubled);
      ({ s, now } = round(s, now, true, false, rules));
    }
    expect(doubled).toEqual([false, false, true, true, true]);
    const pts = s.creator.answers.map((a) => a!.points);
    expect(pts[2]).toBe(2 * pointsFor(true, 1000));
    expect(pts[0]).toBe(pointsFor(true, 1000));
    expect(s.finish!.winnerId).toBe(A);
  });

  it('рейтинг меняется только в «Классике»', () => {
    const settle = (rules: GameRules) => {
      let { s, now } = started(rules);
      for (let i = 0; i < 5; i++) ({ s, now } = round(s, now, true, false, rules));
      if (s.phase !== 'finished') throw new Error('партия не закончилась');
      const input = settleInput(s, bank);
      return computeSettlement([memoryPlayer(A), memoryPlayer(B)], input);
    };
    const [ca, cb] = settle({ variant: 'classic', timeSec: 15, count: 5 });
    expect(ca.delta).toBeGreaterThan(0);
    expect(cb.delta).toBeLessThan(0);
    const [fa, fb] = settle({ variant: 'final', timeSec: 15, count: 5 });
    expect([fa.delta, fb.delta]).toEqual([0, 0]);
    expect(fa.totals.rating).toBe(1000);
    // Статистика при этом идёт: партия и победа засчитаны.
    expect(fa.totals.games).toBe(1);
    expect(fa.totals.wins).toBe(1);
  });
});
