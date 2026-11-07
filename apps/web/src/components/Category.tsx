import type { GameCategory } from '@quiz-duel/shared';
import type { IconGlyph } from './Icon';

/**
 * Оформление категорий в стиле C: иконка и глянцевый шар своего цвета
 * (ball - цвет шара, glow - свечение, ink - цвет иконки на шаре).
 */
export const CATEGORY_LOOK: Record<GameCategory, { glyph: IconGlyph; ball: string; glow: string; ink: string }> = {
  mix: { glyph: 'shuffle', ball: '#9B5CFF', glow: 'rgba(155, 92, 255, 0.55)', ink: '#FFFFFF' },
  science: { glyph: 'leaf', ball: '#19C2DB', glow: 'rgba(25, 194, 219, 0.5)', ink: '#032A30' },
  history: { glyph: 'globe', ball: '#F5A524', glow: 'rgba(245, 165, 36, 0.5)', ink: '#3A2600' },
  culture: { glyph: 'music', ball: '#F0569B', glow: 'rgba(240, 86, 155, 0.5)', ink: '#FFFFFF' },
  sport: { glyph: 'ball', ball: '#6CC63B', glow: 'rgba(108, 198, 59, 0.5)', ink: '#0E2A05' },
  tech: { glyph: 'chip', ball: '#3F86FF', glow: 'rgba(63, 134, 255, 0.55)', ink: '#FFFFFF' },
};
