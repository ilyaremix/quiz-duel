import type { CSSProperties } from 'react';
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
  /** Вторая строка под названием: у «Микса» - как выбираются темы, у платных - сколько вопросов. */
  sub?: string;
  /** wide - на всю ширину шторки (у «Микса» длинное описание). */
  wide?: boolean;
}

/** Значок у шара категории: выбрана - фиолетовая галочка, закрыта - золотой замок. */
function Corner({ kind }: { kind: 'check' | 'lock' }) {
  const ball = kind === 'check' ? BALLS.brand : BALLS.gold;
  const glow = kind === 'check' ? 'var(--qd-brand-glow)' : 'var(--qd-gold-glow)';
  return (
    <Ball
      size={22}
      {...ball}
      className={`absolute -right-1.5 -bottom-1 ${kind === 'check' ? 'qd-pop' : ''}`}
      style={{ boxShadow: `0 0 0 2px var(--qd-ring-gap), inset 0 1px 0 rgba(255, 255, 255, 0.55), 0 0 12px ${glow}` }}
    >
      <Icon glyph={kind} size={11} stroke={3.2} />
    </Ball>
  );
}

/**
 * Плитка темы в шторке выбора: глянцевый шар категории слева, название и (не у всех) вторая строка.
 * Выбранная - фиолетовое стекло, галочка на шаре; закрытая платная - замок на шаре.
 */
export function CategoryTile({ cat, selected, onPick, access, sub, wide = false }: CategoryTileProps) {
  const { t } = useTranslation();
  const look = CATEGORY_LOOK[cat];
  const ball = wide ? 44 : 38;
  const subColor =
    access === 'pass' ? 'var(--qd-brand-text)' : access === 'owned' ? 'var(--qd-correct-text)' : 'var(--tg-theme-hint-color)';
  return (
    <button
      type="button"
      aria-pressed={selected}
      onClick={onPick}
      className={`qd-press relative box-border flex h-full w-full cursor-pointer items-center gap-3 rounded-[22px] border-0 text-left text-text ${
        wide ? 'min-h-[74px] py-3 pr-4 pl-3' : 'min-h-[66px] py-2.5 pr-2.5 pl-2.5'
      }`}
      style={{
        background: selected ? 'var(--qd-brand-glass)' : 'var(--qd-sheen), var(--qd-glass)',
        boxShadow: selected ? 'var(--qd-brand-edge)' : 'var(--qd-glass-edge)',
      }}
    >
      <span className="relative shrink-0">
        <Ball
          size={ball}
          color={look.ball}
          glow={look.glow}
          ink={look.ink}
          style={{ boxShadow: `inset 0 1px 0 rgba(255, 255, 255, 0.6), inset 0 -5px 12px rgba(0, 0, 0, 0.16), 0 0 18px ${look.glow}` } as CSSProperties}
        >
          <Icon glyph={look.glyph} size={wide ? 21 : 18} stroke={2.3} />
        </Ball>
        {selected ? <Corner kind="check" /> : access === 'locked' ? <Corner kind="lock" /> : null}
      </span>
      <span className="flex min-w-0 flex-col gap-[3px]">
        <span className={`${wide ? 'text-[16px]' : 'text-[14px]'} leading-[1.2] font-bold tracking-[-0.01em]`}>{t(`cat.${cat}.title`)}</span>
        {sub && (
          <span className="text-[12px] leading-[1.3] font-medium" style={{ color: subColor }}>
            {sub}
          </span>
        )}
      </span>
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
