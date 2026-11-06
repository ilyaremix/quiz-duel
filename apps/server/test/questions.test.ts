import { describe, expect, it } from 'vitest';
import { CATEGORIES, DIFFICULTIES } from '@quiz-duel/shared';
import { buildQuestionBank, loadQuestionBank } from '../src/questions/bank.js';

describe('база вопросов сервера', () => {
  it('загружается из data/questions.json и строит индексы', () => {
    const bank = loadQuestionBank();
    expect(bank.all).toHaveLength(100);
    expect(bank.byId.get('sci-01')?.en.text).toBe('Which planet is closest to the Sun?');
    for (const category of CATEGORIES) {
      for (const difficulty of DIFFICULTIES) {
        const pool = bank.pool(category, difficulty);
        expect(pool.length, `${category}/${difficulty}`).toBe(difficulty === 'medium' ? 8 : 6);
        expect(pool.every((q) => q.category === category && q.difficulty === difficulty)).toBe(true);
      }
    }
  });

  it('битые данные не дают серверу стартовать и перечисляют все ошибки', () => {
    const broken = structuredClone(loadQuestionBank().all) as unknown as Array<Record<string, unknown>>;
    broken.pop();
    expect(() => buildQuestionBank(broken)).toThrow(/не прошёл проверку[\s\S]*вопросов 99, нужно 100[\s\S]*tech: вопросов 19/);
  });
});
