/*
 * Категории и сложности - отдельно от схем вопросов: мини-апп импортирует их,
 * и при этом в его бандл не должен попадать zod (схемы нужны только серверу).
 */

/** 5 тематических категорий. «Микс» - не категория вопроса, а режим подбора. */
export const CATEGORIES = ['science', 'history', 'culture', 'sport', 'tech'] as const;
export type Category = (typeof CATEGORIES)[number];

/** Категория партии: одна из пяти или «Микс». */
export type GameCategory = Category | 'mix';
export const GAME_CATEGORIES: readonly GameCategory[] = ['mix', ...CATEGORIES];

export const DIFFICULTIES = ['easy', 'medium', 'hard'] as const;
export type Difficulty = (typeof DIFFICULTIES)[number];
