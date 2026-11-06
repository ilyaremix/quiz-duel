import { z } from 'zod';
import { LANGS, type Lang } from './lang.js';

import { CATEGORIES, DIFFICULTIES, type Category, type Difficulty, type GameCategory } from './categories.js';

/** Префикс id вопроса по категории: sci-01 … tec-20. */
export const CATEGORY_ID_PREFIX: Record<Category, string> = {
  science: 'sci',
  history: 'his',
  culture: 'cul',
  sport: 'spo',
  tech: 'tec',
};

/** Правила базы вопросов из ТЗ. */
export const BANK_RULES = {
  total: 100,
  perCategory: 20,
  perDifficulty: { easy: 6, medium: 8, hard: 6 } satisfies Record<Difficulty, number>,
  optionsCount: 4,
  /** Вопрос помещается в 3 строки на экране 390 px. */
  maxTextLength: 120,
  /** Вариант помещается в 2 строки кнопки ответа. */
  maxOptionLength: 40,
} as const;

/** Состав партии «Микс»: 3 лёгких, 4 средних, 3 сложных. */
export const MIX_SPLIT: Record<Difficulty, number> = { easy: 3, medium: 4, hard: 3 };
export const QUESTIONS_PER_GAME = 10;

/** Строка без пробелов по краям, без двойных пробелов и переносов. */
const cleanText = (max: number) =>
  z
    .string()
    .min(1)
    .max(max)
    .refine((s) => s === s.trim(), 'пробелы по краям')
    .refine((s) => !/\s{2,}/.test(s), 'двойной пробел')
    .refine((s) => !/[\n\r\t]/.test(s), 'перенос строки или табуляция')
    .refine((s) => !/[—–]/.test(s), 'длинное тире: используйте дефис');

const LocalizedSchema = z.strictObject({
  text: cleanText(BANK_RULES.maxTextLength).refine((s) => s.endsWith('?'), 'вопрос должен заканчиваться «?»'),
  options: z.array(cleanText(BANK_RULES.maxOptionLength)).length(BANK_RULES.optionsCount),
});

export const QuestionSchema = z.strictObject({
  id: z.string().regex(/^[a-z]{3}-\d{2}$/, 'id вида sci-01'),
  category: z.enum(CATEGORIES),
  difficulty: z.enum(DIFFICULTIES),
  /** Индекс верного варианта, общий для обоих языков. */
  correct: z.int().min(0).max(BANK_RULES.optionsCount - 1),
  ru: LocalizedSchema,
  en: LocalizedSchema,
});

/** Вопрос базы целиком, с верным ответом. Живёт только на сервере. */
export type Question = z.infer<typeof QuestionSchema>;

export type BankCheck = { ok: true; questions: Question[] } | { ok: false; errors: string[] };

const CYRILLIC = /[а-яё]/i;

/** Для сравнения на дубли: регистр, ё/е, кавычки и знаки препинания не важны. */
function normalize(s: string): string {
  return s
    .toLowerCase()
    .replace(/ё/g, 'е')
    .replace(/[«»"'„“”.,!?:;()]/g, '')
    .replace(/\s+/g, ' ')
    .trim();
}

/**
 * Проверяет базу вопросов: схему каждого вопроса и правила базы целиком
 * (100 штук, 20 на категорию, 6/8/6 по сложности, уникальные id и тексты,
 * 4 разных варианта, русский текст на русском, английский - без кириллицы).
 * Возвращает все ошибки сразу, чтобы чинить их за один проход.
 */
export function validateQuestionBank(input: unknown): BankCheck {
  const errors: string[] = [];

  if (!Array.isArray(input)) return { ok: false, errors: ['база должна быть массивом вопросов'] };

  const questions: Question[] = [];
  input.forEach((raw, i) => {
    const parsed = QuestionSchema.safeParse(raw);
    if (parsed.success) {
      questions.push(parsed.data);
      return;
    }
    const id = typeof (raw as { id?: unknown })?.id === 'string' ? (raw as { id: string }).id : `#${i}`;
    for (const issue of parsed.error.issues) {
      errors.push(`${id}: ${issue.path.join('.') || '(вопрос)'} - ${issue.message}`);
    }
  });

  // Правила ниже имеют смысл, только если каждый вопрос прошёл схему.
  if (errors.length > 0) return { ok: false, errors };

  if (questions.length !== BANK_RULES.total) {
    errors.push(`вопросов ${questions.length}, нужно ${BANK_RULES.total}`);
  }

  const ids = new Set<string>();
  const texts: Record<Lang, Map<string, string>> = { ru: new Map(), en: new Map() };

  for (const q of questions) {
    if (ids.has(q.id)) errors.push(`${q.id}: повторяющийся id`);
    ids.add(q.id);

    const prefix = CATEGORY_ID_PREFIX[q.category];
    if (!q.id.startsWith(`${prefix}-`)) errors.push(`${q.id}: id категории ${q.category} должен начинаться с ${prefix}-`);

    for (const lang of LANGS) {
      const { text, options } = q[lang];

      const key = normalize(text);
      const twin = texts[lang].get(key);
      if (twin) errors.push(`${q.id}: ${lang}-текст повторяет ${twin}`);
      else texts[lang].set(key, q.id);

      if (new Set(options.map(normalize)).size !== options.length) {
        errors.push(`${q.id}: ${lang}-варианты повторяются`);
      }

      const all = [text, ...options];
      if (lang === 'ru' && !CYRILLIC.test(text)) errors.push(`${q.id}: ru-текст без кириллицы`);
      if (lang === 'en' && all.some((s) => CYRILLIC.test(s))) errors.push(`${q.id}: кириллица в en`);
    }
  }

  for (const category of CATEGORIES) {
    const inCategory = questions.filter((q) => q.category === category);
    if (inCategory.length !== BANK_RULES.perCategory) {
      errors.push(`${category}: вопросов ${inCategory.length}, нужно ${BANK_RULES.perCategory}`);
    }
    for (const difficulty of DIFFICULTIES) {
      const n = inCategory.filter((q) => q.difficulty === difficulty).length;
      const need = BANK_RULES.perDifficulty[difficulty];
      if (n !== need) errors.push(`${category}/${difficulty}: вопросов ${n}, нужно ${need}`);
    }
  }

  return errors.length > 0 ? { ok: false, errors } : { ok: true, questions };
}
