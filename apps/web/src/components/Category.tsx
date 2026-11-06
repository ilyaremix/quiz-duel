import type { GameCategory } from '@quiz-duel/shared';
import type { IconGlyph } from './Icon';

/** Оформление категорий: иконка и цвета (переменные --qd-cat-* в styles.css). */
export const CATEGORY_LOOK: Record<GameCategory, { glyph: IconGlyph; fg: string; bg: string }> = {
  mix: { glyph: 'shuffle', fg: 'var(--qd-brand-text)', bg: 'var(--qd-brand-tint)' },
  science: { glyph: 'leaf', fg: 'var(--qd-cat-science-fg)', bg: 'var(--qd-cat-science-bg)' },
  history: { glyph: 'globe', fg: 'var(--qd-cat-history-fg)', bg: 'var(--qd-cat-history-bg)' },
  culture: { glyph: 'music', fg: 'var(--qd-cat-culture-fg)', bg: 'var(--qd-cat-culture-bg)' },
  sport: { glyph: 'ball', fg: 'var(--qd-cat-sport-fg)', bg: 'var(--qd-cat-sport-bg)' },
  tech: { glyph: 'chip', fg: 'var(--qd-cat-tech-fg)', bg: 'var(--qd-cat-tech-bg)' },
};
