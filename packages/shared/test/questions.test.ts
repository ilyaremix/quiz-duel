/// <reference types="node" />
import { readFileSync } from 'node:fs';
import { describe, expect, it } from 'vitest';
import { ALL_CATEGORIES, DIFFICULTIES } from '../src/categories.js';
import { BANK_RULES, MIX_SPLIT, QUESTIONS_PER_GAME, validateQuestionBank } from '../src/questions.js';

// Сама база лежит в data/ и попадает только в сервер; здесь читаем её с диска.
const bankUrl = new URL('../../../data/questions.json', import.meta.url);
/** Вопрос из JSON как есть: тесты валидатора портят его как угодно, типы проверяет сам валидатор. */
interface RawQuestion {
  id: string;
  category: string;
  difficulty: string;
  correct: number;
  ru: { text: string; options: string[] };
  en: { text: string; options: string[] };
  [extra: string]: unknown;
}
const loadBank = (): RawQuestion[] => JSON.parse(readFileSync(bankUrl, 'utf8'));

function errorsOf(bank: unknown): string[] {
  const result = validateQuestionBank(bank);
  return result.ok ? [] : result.errors;
}

describe('data/questions.json', () => {
  const bank = loadBank();

  it('проходит валидатор без единой ошибки', () => {
    expect(errorsOf(bank)).toEqual([]);
  });

  it('180 вопросов: 9 тем (5 из ТЗ и 4 платные) по 20, в каждой 6/8/6 по сложности', () => {
    expect(bank).toHaveLength(BANK_RULES.total);
    expect(ALL_CATEGORIES).toHaveLength(9);
    for (const category of ALL_CATEGORIES) {
      const inCategory = bank.filter((q) => q.category === category);
      expect(inCategory, category).toHaveLength(BANK_RULES.perCategory);
      for (const d of DIFFICULTIES) {
        expect(
          inCategory.filter((q) => q.difficulty === d),
          `${category} ${d}`,
        ).toHaveLength(BANK_RULES.perDifficulty[d]);
      }
    }
  });

  it('у каждого вопроса 4 разных варианта на обоих языках', () => {
    for (const q of bank) {
      for (const lang of ['ru', 'en'] as const) {
        expect(new Set(q[lang].options).size, `${q.id} ${lang}`).toBe(4);
      }
    }
  });

  it('верные ответы разбросаны по позициям, а не стоят всегда первыми', () => {
    const positions = new Set(bank.map((q) => q.correct));
    expect(positions.size).toBe(4);
  });

  it('«Микс» можно собрать из базы: 3 + 4 + 3 = 10', () => {
    const total = DIFFICULTIES.reduce((sum, d) => sum + MIX_SPLIT[d], 0);
    expect(total).toBe(QUESTIONS_PER_GAME);
    for (const d of DIFFICULTIES) {
      expect(bank.filter((q) => q.difficulty === d).length).toBeGreaterThanOrEqual(MIX_SPLIT[d]);
    }
  });
});

describe('validateQuestionBank ловит ошибки', () => {
  // В базе заведомо есть первые два вопроса - их и портим.
  type Bank = [RawQuestion, RawQuestion, ...RawQuestion[]];
  const broken = (mutate: (bank: Bank) => void) => {
    const bank = loadBank() as Bank;
    mutate(bank);
    return errorsOf(bank);
  };

  it('не массив', () => {
    expect(errorsOf({})).toEqual(['база должна быть массивом вопросов']);
  });

  it('на один вопрос меньше', () => {
    const errors = broken((b) => b.pop());
    expect(errors).toContain('вопросов 179, нужно 180');
    expect(errors).toContain('crypto: вопросов 19, нужно 20');
    expect(errors).toContain('crypto/hard: вопросов 5, нужно 6');
  });

  it('повторяющийся id', () => {
    expect(broken((b) => (b[1].id = b[0].id))).toContain('sci-01: повторяющийся id');
  });

  it('id не своей категории', () => {
    expect(broken((b) => (b[0].category = 'sport'))).toContain('sci-01: id категории sport должен начинаться с spo-');
  });

  it('повтор текста вопроса без учёта регистра и кавычек', () => {
    const errors = broken((b) => (b[1].ru.text = b[0].ru.text.toUpperCase()));
    expect(errors).toContain('sci-02: ru-текст повторяет sci-01');
  });

  it('одинаковые варианты', () => {
    expect(broken((b) => (b[0].en.options[1] = 'mercury'))).toContain('sci-01: en-варианты повторяются');
  });

  it('три варианта вместо четырёх', () => {
    const errors = broken((b) => b[0].ru.options.pop());
    expect(errors.some((e) => e.startsWith('sci-01: ru.options'))).toBe(true);
  });

  it('индекс верного ответа вне 0-3', () => {
    const errors = broken((b) => (b[0].correct = 4));
    expect(errors.some((e) => e.startsWith('sci-01: correct'))).toBe(true);
  });

  it('кириллица в английской версии', () => {
    expect(broken((b) => (b[0].en.options[0] = 'Меркурий'))).toContain('sci-01: кириллица в en');
  });

  it('русская версия не на русском', () => {
    expect(broken((b) => (b[0].ru.text = 'Which planet?'))).toContain('sci-01: ru-текст без кириллицы');
  });

  it('лишнее поле, пробел по краям, нет «?»', () => {
    expect(broken((b) => (b[0].answer = 0)).some((e) => e.startsWith('sci-01: (вопрос)'))).toBe(true);
    expect(broken((b) => (b[0].ru.options[0] = ' Меркурий'))).toContain('sci-01: ru.options.0 - пробелы по краям');
    expect(broken((b) => (b[0].en.text = 'Closest planet to the Sun'))).toContain('sci-01: en.text - вопрос должен заканчиваться «?»');
  });

  it('слишком длинный вариант не влезет в кнопку', () => {
    const errors = broken((b) => (b[0].ru.options[0] = 'Очень '.repeat(10).trim()));
    expect(errors.some((e) => e.startsWith('sci-01: ru.options.0'))).toBe(true);
  });
});
