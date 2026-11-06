import { validateQuestionBank, type Category, type Difficulty, type Question } from '@quiz-duel/shared';
// Файл встраивается в сборку сервера (dist/index.js). В мини-апп он не попадает:
// клиент импортирует из shared только типы и функции, но не сами вопросы.
import rawBank from '../../../../data/questions.json' with { type: 'json' };

export interface QuestionBank {
  all: readonly Question[];
  byId: ReadonlyMap<string, Question>;
  /** Вопросы категории нужной сложности - для подбора партии. */
  pool(category: Category, difficulty: Difficulty): readonly Question[];
}

/** Проверяет базу и строит индексы. Ошибка в данных - падение при старте, а не посреди партии. */
export function buildQuestionBank(input: unknown): QuestionBank {
  const check = validateQuestionBank(input);
  if (!check.ok) {
    const list = check.errors.map((e) => `  ${e}`).join('\n');
    throw new Error(`data/questions.json не прошёл проверку (${check.errors.length}):\n${list}`);
  }

  const all = check.questions;
  const byId = new Map(all.map((q) => [q.id, q]));
  const pools = new Map<string, Question[]>();
  for (const q of all) {
    const key = `${q.category}/${q.difficulty}`;
    pools.set(key, [...(pools.get(key) ?? []), q]);
  }

  return {
    all,
    byId,
    pool: (category, difficulty) => pools.get(`${category}/${difficulty}`) ?? [],
  };
}

let cached: QuestionBank | null = null;

/** База из data/questions.json (проверяется один раз). */
export function loadQuestionBank(): QuestionBank {
  cached ??= buildQuestionBank(rawBank);
  return cached;
}
