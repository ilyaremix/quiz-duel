import type { CSSProperties } from 'react';
import { useTranslation } from 'react-i18next';
import type { GameCategory } from '@quiz-duel/shared';
import { Icon } from './Icon';
import { CATEGORY_LOOK } from './Category';

interface CategoryTileProps {
  cat: GameCategory;
  selected: boolean;
  onPick: () => void;
}

/** Плитка категории в шторке выбора: иконка, название, число вопросов, галочка выбора. */
export function CategoryTile({ cat, selected, onPick }: CategoryTileProps) {
  const { t } = useTranslation();
  const look = CATEGORY_LOOK[cat];
  return (
    <button
      type="button"
      aria-pressed={selected}
      onClick={onPick}
      className="qd-press relative box-border flex h-full min-h-[108px] w-full cursor-pointer flex-col items-start gap-2.5 rounded-[20px] border-2 p-3.5 text-left font-[inherit] text-text"
      style={{
        '--qd-shadow': '0 4px 0 var(--qd-lip)',
        borderColor: selected ? 'var(--qd-brand)' : 'transparent',
        background: selected ? 'var(--qd-brand-tint)' : 'var(--tg-theme-section-bg-color)',
      } as CSSProperties}
    >
      <span aria-hidden="true" className="flex h-10 w-10 items-center justify-center rounded-full" style={{ background: look.bg, color: look.fg }}>
        <Icon glyph={look.glyph} size={20} stroke={2.2} />
      </span>
      <span className="flex flex-col gap-[3px]">
        <span className="text-[15px] leading-[1.2] font-extrabold">{t(`cat.${cat}.title`)}</span>
        <span className="text-[12px] font-bold text-hint">{t(`cat.${cat}.count`)}</span>
      </span>
      {selected && (
        <span aria-hidden="true" className="qd-pop absolute top-3 right-3 flex h-6 w-6 items-center justify-center rounded-full bg-brand text-white">
          <Icon glyph="check" size={14} stroke={3.5} />
        </span>
      )}
    </button>
  );
}

/** Метка категории в шапке лобби. */
export function CategoryChip({ cat }: { cat: GameCategory }) {
  const { t } = useTranslation();
  const look = CATEGORY_LOOK[cat];
  return (
    <span className="flex h-[30px] items-center gap-1.5 rounded-[15px] bg-section px-3 text-[13px] font-extrabold" style={{ color: look.fg }}>
      <Icon glyph={look.glyph} size={14} stroke={2.5} />
      {t(`cat.${cat}.title`)}
    </span>
  );
}
