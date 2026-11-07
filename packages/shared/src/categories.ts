/*
 * Категории и сложности - отдельно от схем вопросов: мини-апп импортирует их,
 * и при этом в его бандл не должен попадать zod (схемы нужны только серверу).
 */

/** 5 тематических категорий. «Микс» - не категория вопроса, а режим подбора (только из этих пяти). */
export const CATEGORIES = ['science', 'history', 'culture', 'sport', 'tech'] as const;
export type BaseCategory = (typeof CATEGORIES)[number];

/** Обновление 2.0: платные темы - на 1 игру за рекламу или навсегда за монеты. В «Микс» не входят. */
export const PREMIUM_CATEGORIES = ['games', 'space', 'food', 'crypto'] as const;
export type PremiumCategory = (typeof PREMIUM_CATEGORIES)[number];

export const ALL_CATEGORIES = [...CATEGORIES, ...PREMIUM_CATEGORIES] as const;
export type Category = (typeof ALL_CATEGORIES)[number];

export const isPremiumCategory = (c: string): c is PremiumCategory => (PREMIUM_CATEGORIES as readonly string[]).includes(c);

/** Категория партии: одна из тем или «Микс». */
export type GameCategory = Category | 'mix';
export const GAME_CATEGORIES: readonly GameCategory[] = ['mix', ...ALL_CATEGORIES];

export const DIFFICULTIES = ['easy', 'medium', 'hard'] as const;
export type Difficulty = (typeof DIFFICULTIES)[number];
