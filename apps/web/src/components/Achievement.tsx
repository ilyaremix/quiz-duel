import { useTranslation } from 'react-i18next';
import type { AchievementCode } from '@quiz-duel/shared';
import { formatNumber } from '../i18n';
import { Icon, type IconGlyph } from './Icon';

/** Иконка каждой из 12 ачивок - как в макете. */
export const ACH_GLYPH: Record<AchievementCode, IconGlyph> = {
  first_blood: 'duel',
  on_a_roll: 'medal',
  unstoppable: 'send',
  perfect_game: 'check',
  lightning: 'bolt',
  ice_cold: 'clock',
  comeback: 'chevron',
  revenge: 'rematch',
  erudite: 'info',
  category_master: 'leaf',
  veteran: 'globe',
  summit: 'rating',
};

export type AchievementState = 'new' | 'unlocked' | 'locked';

interface Props {
  code: AchievementCode;
  state: AchievementState;
  layout?: 'row' | 'tile';
  current?: number;
  goal?: number;
}

/**
 * Ачивка строкой (на итогах) или плиткой (экран 18). Новая - золотое стекло и блеск бейджа;
 * полученная - стекло с золотым шаром; закрытая - тусклый шар и прогресс «37/100».
 */
export function Achievement({ code, state, layout = 'row', current = 0, goal = 1 }: Props) {
  const { t, i18n } = useTranslation();
  const locked = state === 'locked';
  const fresh = state === 'new';
  const tile = layout === 'tile';
  const title = t(`ach.${code}.t`);
  const desc = t(`ach.${code}.d`);
  const pct = Math.round(Math.min(1, current / Math.max(1, goal)) * 100);

  const surface = {
    background: fresh ? 'var(--qd-gold-glass)' : 'var(--qd-sheen), var(--qd-glass)',
    boxShadow: fresh ? 'var(--qd-gold-edge)' : locked ? 'var(--qd-glass-edge-flat)' : 'var(--qd-glass-edge)',
  };
  const badgeSize = tile ? 56 : 46;
  const badge = (
    <span
      aria-hidden="true"
      className={`${fresh ? 'qd-shine ' : ''}flex shrink-0 items-center justify-center rounded-full ${tile ? 'mb-1' : ''}`}
      style={{
        width: badgeSize,
        height: badgeSize,
        background: locked ? 'var(--qd-chip)' : 'radial-gradient(circle at 32% 25%, #FFF3C4, #FFD36B 55%, #F2B230)',
        boxShadow: locked ? 'inset 0 1px 0 rgba(255, 255, 255, 0.25)' : 'inset 0 1px 0 rgba(255, 255, 255, 0.7), 0 0 20px var(--qd-gold-glow)',
        color: locked ? 'var(--tg-theme-hint-color)' : '#3A2600',
      }}
    >
      <Icon glyph={ACH_GLYPH[code]} size={tile ? 26 : 22} stroke={2.5} />
    </span>
  );
  const progress = (
    <div className={tile ? 'mt-auto flex w-full flex-col gap-1' : 'mt-1 flex items-center gap-2'}>
      <div
        role="progressbar"
        aria-label={t('ach.progress')}
        aria-valuemin={0}
        aria-valuemax={100}
        aria-valuenow={pct}
        className={`h-1.5 overflow-hidden rounded-[3px] ${tile ? '' : 'grow'}`}
        style={{ background: 'var(--qd-track)' }}
      >
        <div className="h-1.5 rounded-[3px]" style={{ width: `${pct}%`, background: 'linear-gradient(90deg, #4F8DFF, #9B5CFF)' }} />
      </div>
      <span className="qd-num text-[12px] font-semibold text-hint">
        {formatNumber(current, i18n.language)}/{formatNumber(goal, i18n.language)}
      </span>
    </div>
  );
  const titleColor = locked ? 'var(--tg-theme-hint-color)' : 'var(--tg-theme-text-color)';

  if (tile) {
    return (
      <div className="box-border flex min-h-[172px] w-full flex-col items-center gap-1.5 rounded-[26px] px-3 pt-4 pb-3.5 text-center" style={surface}>
        {badge}
        <span className="text-[15px] font-bold" style={{ color: titleColor }}>
          {title}
        </span>
        <span className="text-[12px] leading-[1.3] font-medium text-hint">{desc}</span>
        {locked ? (
          progress
        ) : (
          <span
            className="mt-auto flex items-center justify-center gap-1 text-center text-[12px] leading-[1.25] font-semibold"
            style={{ color: fresh ? 'var(--qd-gold-text)' : 'var(--qd-correct-text)' }}
          >
            <Icon glyph="check" size={12} stroke={3.5} />
            {fresh ? t('ach.tileNew') : t('ach.got')}
          </span>
        )}
      </div>
    );
  }

  return (
    <div className="box-border flex w-full items-center gap-3 rounded-[26px] px-3.5 py-3" style={surface}>
      {badge}
      <div className="flex min-w-0 grow flex-col gap-0.5">
        {fresh && <span className="text-[11px] font-semibold tracking-[0.08em] text-gold-text uppercase">{t('ach.newBadge')}</span>}
        <span className="text-[17px] font-bold tracking-[-0.01em]" style={{ color: titleColor }}>
          {title}
        </span>
        <span className="text-[13px] font-medium text-hint">{desc}</span>
        {locked && progress}
      </div>
    </div>
  );
}
