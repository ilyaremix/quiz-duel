/**
 * Обновление 2.0: режимы партии - карточка режима (шторка настроек), жизни и «×2» в партии,
 * строка «Классика · 10 вопросов по 15 с».
 */
import type { CSSProperties } from 'react';
import { useTranslation } from 'react-i18next';
import { DEFAULT_RULES, VARIANT_LIVES, sameRules, type GameRules, type Variant } from '@quiz-duel/shared';
import { Icon, type IconGlyph } from './Icon';

export const MODE_LOOK: Record<Variant, { glyph: IconGlyph; ball: string; glow: string; ink: string }> = {
  classic: { glyph: 'bolt', ball: '#4F8DFF', glow: 'rgba(79,141,255,.55)', ink: '#FFFFFF' },
  lives: { glyph: 'heart', ball: '#FF5A7A', glow: 'rgba(255,90,122,.5)', ink: '#FFFFFF' },
  sudden: { glyph: 'skull', ball: '#9B5CFF', glow: 'rgba(155,92,255,.55)', ink: '#FFFFFF' },
  final: { glyph: 'flame', ball: '#FFD36B', glow: 'rgba(255,211,107,.55)', ink: '#3A2600' },
};

export function useRulesText() {
  const { t } = useTranslation();
  return (rules: GameRules) =>
    t('s32.summary', {
      mode: t(`s32.mode.${rules.variant}.t`),
      n: rules.count,
      questions: t('plural.question', { count: rules.count }),
      t: rules.timeSec,
    });
}

export const isDefaultRules = (rules: GameRules) => sameRules(rules, DEFAULT_RULES);

export function ModeCard({ variant, selected, onPick }: { variant: Variant; selected: boolean; onPick: () => void }) {
  const { t } = useTranslation();
  const look = MODE_LOOK[variant];
  return (
    <button
      type="button"
      role="radio"
      aria-checked={selected}
      onClick={onPick}
      className="qd-press relative box-border flex h-full min-h-[112px] w-full cursor-pointer flex-col items-start gap-2.5 rounded-[24px] border-0 px-3 pt-3 pb-3.5 text-left text-text"
      style={{ background: selected ? 'var(--qd-brand-glass)' : 'var(--qd-sheen), var(--qd-glass)', boxShadow: selected ? 'var(--qd-brand-edge)' : 'var(--qd-glass-edge)' }}
    >
      <span aria-hidden="true" className="qd-ball h-[38px] w-[38px]" style={{ '--qd-ball': look.ball, '--qd-ball-glow': look.glow, color: look.ink } as CSSProperties}>
        <Icon glyph={look.glyph} size={19} stroke={2.3} />
      </span>
      <span className="flex flex-col gap-[3px]">
        <span className="text-[15px] leading-[1.2] font-bold tracking-[-0.01em]">{t(`s32.mode.${variant}.t`)}</span>
        <span className="text-[12px] leading-[1.3] font-medium text-hint">{t(`s32.mode.${variant}.d`)}</span>
      </span>
      {selected && (
        <span aria-hidden="true" className="qd-pop qd-ball absolute top-2.5 right-2.5 h-6 w-6" style={{ '--qd-ball': '#3BE58B', '--qd-ball-glow': 'var(--qd-ok-glow)', color: '#04261A' } as CSSProperties}>
          <Icon glyph="check" size={13} stroke={3.5} />
        </span>
      )}
    </button>
  );
}

/** Жизни игрока: полные сердца - оставшиеся, тусклые - потерянные. */
export function Lives({ who, left, total, side }: { who: string; left: number; total: number; side: 'me' | 'opp' }) {
  const { t } = useTranslation();
  return (
    <span role="img" aria-label={t('s09.livesAria', { who, n: left, m: total })} className={`flex items-center gap-0.5 ${side === 'opp' ? 'flex-row-reverse' : ''}`}>
      {Array.from({ length: total }, (_, i) => (
        <span key={i} className={i < left ? '' : 'opacity-30'} style={{ color: i < left ? '#FF5A7A' : 'var(--tg-theme-hint-color)', filter: i < left ? 'drop-shadow(0 0 6px rgba(255,90,122,.6))' : undefined }}>
          <Icon glyph="heart" size={18} stroke={2.6} />
        </span>
      ))}
    </span>
  );
}

/** Полоса режима под счётом: жизни обоих и «Очки ×2» на финальных вопросах. */
export function RulesStrip({ rules, meName, oppName, meLives, oppLives, doubled }: { rules: GameRules; meName: string; oppName: string | null; meLives: number | null; oppLives: number | null; doubled: boolean }) {
  const { t } = useTranslation();
  const total = VARIANT_LIVES[rules.variant];
  if (total === 0 && !doubled) return null;
  return (
    <div className="flex min-h-7 items-center justify-between gap-2 px-1">
      <span>{total > 0 && meLives !== null && <Lives who={meName} left={meLives} total={total} side="me" />}</span>
      {doubled && (
        <span className="qd-chip qd-chip-gold qd-pop" title={t('s09.x2Hint')}>
          <Icon glyph="flame" size={14} stroke={2.6} />
          {t('s09.x2')}
        </span>
      )}
      <span>{total > 0 && oppLives !== null && oppName !== null && <Lives who={oppName} left={oppLives} total={total} side="opp" />}</span>
    </div>
  );
}
