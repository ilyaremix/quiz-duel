import { BANK_RULES, CATEGORIES, DIFFICULTIES, QUESTIONS_PER_GAME, type Category, type Difficulty, type GameCategory, type Question } from '@quiz-duel/shared';
import type { QuestionBank } from '../questions/bank.js';
import { secureRng, shuffle, type Rng } from './rng.js';

/** Вопрос партии: id и порядок вариантов на экране (order[позиция] = индекс варианта в базе). */
export interface GameQuestion {
  id: string;
  order: number[];
}

export interface PickInput {
  bank: QuestionBank;
  category: GameCategory;
  /**
   * Когда кто-то из игроков последний раз видел вопрос (id → мс).
   * Вопроса нет в карте - его не видел ни один из двоих.
   */
  seen?: ReadonlyMap<string, number>;
  rng?: Rng;
  /** Сколько вопросов (5, 10, 15 или 20); по умолчанию 10. */
  count?: number;
  /** «Микс» после выбора тем: вопросы только из этих тем, поровну. */
  topics?: readonly Category[];
}

/** В «Миксе» не больше стольких вопросов из одной категории (10 вопросов / 5 категорий). */
export const MIX_PER_CATEGORY = QUESTIONS_PER_GAME / CATEGORIES.length;

/** Сложность партии из count вопросов: 30% лёгких, 30% сложных, остальное средние (10 → 3/4/3, 20 → 6/8/6). */
export function splitFor(count: number): Record<(typeof DIFFICULTIES)[number], number> {
  const edge = Math.floor(count * 0.3);
  return { easy: edge, medium: count - 2 * edge, hard: edge };
}

/**
 * 10 вопросов партии: 3 лёгких, 4 средних, 3 сложных - и в «Миксе», и в одной категории,
 * чтобы сложность партий была одинаковой. Идут по возрастанию сложности.
 *
 * Свежесть: сначала вопросы, которых не видел ни один из игроков (в случайном порядке),
 * потом - самые давно сыгранные. Партия всегда из 10 вопросов, даже если всё уже видели.
 * В «Миксе» вдобавок не больше 2 вопросов из одной категории, пока это возможно.
 */
export function pickQuestions({ bank, category, seen = new Map(), rng = secureRng, count = QUESTIONS_PER_GAME, topics }: PickInput): GameQuestion[] {
  const perCategory = new Map<Category, number>();
  const picked: Question[] = [];
  const split = splitFor(count);
  const pool = category === 'mix' && topics?.length ? topics : null;
  const cap = Math.max(1, Math.ceil(count / (pool ?? CATEGORIES).length));

  for (const difficulty of DIFFICULTIES) {
    const need = split[difficulty];
    const ranked = rank(candidates(bank, category, difficulty, pool), seen, rng);
    if (ranked.length < need) {
      throw new Error(`мало вопросов ${category}/${difficulty}: ${ranked.length}, нужно ${need}`);
    }

    const chosen: Question[] = [];
    const take = (q: Question) => {
      chosen.push(q);
      perCategory.set(q.category, (perCategory.get(q.category) ?? 0) + 1);
    };
    const underCap = (q: Question) => category !== 'mix' || (perCategory.get(q.category) ?? 0) < cap;

    // 1) несыгранные с учётом разброса, 2) любые по давности с учётом разброса, 3) любые.
    const passes: ((q: Question) => boolean)[] = [(q) => !seen.has(q.id) && underCap(q), underCap, () => true];
    for (const fits of passes) {
      for (const q of ranked) {
        if (chosen.length === need) break;
        if (!chosen.includes(q) && fits(q)) take(q);
      }
    }
    picked.push(...chosen);
  }

  return picked.map((q) => ({
    id: q.id,
    order: shuffle(
      Array.from({ length: BANK_RULES.optionsCount }, (_, i) => i),
      rng,
    ),
  }));
}

function candidates(bank: QuestionBank, category: GameCategory, difficulty: Difficulty, pool: readonly Category[] | null): Question[] {
  const categories = pool ?? (category === 'mix' ? CATEGORIES : [category]);
  return categories.flatMap((c) => bank.pool(c, difficulty));
}

/** Случайный порядок, затем стабильно: несыгранные первыми, потом от самых давних. */
function rank(pool: readonly Question[], seen: ReadonlyMap<string, number>, rng: Rng): Question[] {
  const lastSeen = (q: Question) => seen.get(q.id) ?? -Infinity;
  // Без вычитания: -Infinity - -Infinity = NaN ломает сортировку.
  return shuffle(pool, rng).sort((a, b) => {
    const x = lastSeen(a);
    const y = lastSeen(b);
    return x === y ? 0 : x < y ? -1 : 1;
  });
}
