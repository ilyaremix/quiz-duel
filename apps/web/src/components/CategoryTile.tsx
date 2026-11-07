import { useTranslation } from 'react-i18next';
import type { GameCategory } from '@quiz-duel/shared';
import { Ball, BALLS } from './Ball';
import { Icon } from './Icon';
import { CATEGORY_LOOK } from './Category';

interface CategoryTileProps {
  cat: GameCategory;
  selected: boolean;
  onPick: () => void;
  /** Платная тема: закрыта, открыта на 1 игру или куплена. */
  access?: 'locked' | 'pass' | 'owned';
}

/** Плитка категории в шторке выбора: глянцевый шар категории, название, число вопросов; выбранная - фиолетовое стекло с галочкой. */
export function CategoryTile({ cat, selected, onPick, access }: CategoryTileProps) {
  const { t } = useTranslation();
  const look = CATEGORY_LOOK[cat];
  return (
    <button
      type="button"
      aria-pressed={selected}
      onClick={onPick}
      className="qd-press relative box-border flex h-full min-h-[116px] w-full cursor-pointer flex-col items-start gap-2.5 rounded-[26px] border-0 px-3.5 pt-3.5 pb-4 text-left text-text"
      style={{
        background: selected ? 'var(--qd-brand-glass)' : 'var(--qd-sheen), var(--qd-glass)',
        boxShadow: selected ? 'var(--qd-brand-edge)' : 'var(--qd-glass-edge)',
      }}
    >
      <Ball size={42} color={look.ball} glow={look.glow} ink={look.ink} style={{ boxShadow: `inset 0 1px 0 rgba(255, 255, 255, 0.6), inset 0 -5px 12px rgba(0, 0, 0, 0.16), 0 0 20px ${look.glow}` }}>
        <Icon glyph={look.glyph} size={20} stroke={2.3} />
      </Ball>
      <span className="flex flex-col gap-[3px]">
        <span className="text-[16px] leading-[1.2] font-bold tracking-[-0.01em]">{t(`cat.${cat}.title`)}</span>
        {access ? (
          <span className="text-[12px] font-semibold" style={{ color: access === 'locked' ? 'var(--qd-gold-text)' : access === 'pass' ? 'var(--qd-brand-text)' : 'var(--qd-correct-text)' }}>
            {access === 'locked' ? t('s04.lockAd') : access === 'pass' ? t('s04.pass') : t('s04.owned')}
          </span>
        ) : (
          <span className="text-[12px] font-medium text-hint">{t(`cat.${cat}.count`)}</span>
        )}
      </span>
      {access === 'locked' && !selected && (
        <Ball size={26} {...BALLS.gold} className="absolute top-3 right-3" style={{ boxShadow: 'inset 0 1px 0 rgba(255, 255, 255, 0.55), 0 0 12px var(--qd-gold-glow)' }}>
          <Icon glyph="lock" size={13} stroke={2.8} />
        </Ball>
      )}
      {selected && (
        <Ball
          size={26}
          {...BALLS.brand}
          className="qd-pop absolute top-3 right-3"
          style={{ boxShadow: 'inset 0 1px 0 rgba(255, 255, 255, 0.55), 0 0 14px var(--qd-brand-glow)' }}
        >
          <Icon glyph="check" size={14} stroke={3.5} />
        </Ball>
      )}
    </button>
  );
}

/** Метка категории в шапке лобби и на экране вопроса: стеклянная капсула с мини-шаром категории. */
export function CategoryChip({ cat, height = 30 }: { cat: GameCategory; height?: number }) {
  const { t } = useTranslation();
  const look = CATEGORY_LOOK[cat];
  return (
    <span className="qd-chip" style={{ height, borderRadius: height / 2, padding: '0 12px 0 5px' }}>
      <Ball size={20} color={look.ball} glow={look.glow} ink={look.ink} style={{ boxShadow: `inset 0 1px 0 rgba(255, 255, 255, 0.6), 0 0 10px ${look.glow}` }}>
        <Icon glyph={look.glyph} size={12} stroke={2.6} />
      </Ball>
      {t(`cat.${cat}.title`)}
    </span>
  );
}
