import type { CSSProperties } from 'react';
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

/** Ачивка: строкой (на итогах) или плиткой (экран 18). Закрытая - серая с прогрессом «37/100». */
export function Achievement({ code, state, layout = 'row', current = 0, goal = 1 }: Props) {
  const { t, i18n } = useTranslation();
  const locked = state === 'locked';
  const badge: CSSProperties = locked
    ? { background: 'var(--qd-surface-2)', color: 'var(--tg-theme-hint-color)' }
    : { background: 'var(--qd-gold)', color: '#2A1F05' };
  const title = t(`ach.${code}.t`);
  const desc = t(`ach.${code}.d`);
  const pct = Math.round(Math.min(1, current / Math.max(1, goal)) * 100);
  const progress = (
    <div className={layout === 'tile' ? 'mt-auto flex w-full flex-col gap-1' : 'mt-1 flex items-center gap-2'}>
      <div
        role="progressbar"
        aria-label={t('ach.progress')}
        aria-valuemin={0}
        aria-valuemax={100}
        aria-valuenow={pct}
        className={`h-1.5 overflow-hidden rounded-[3px] bg-surface-2 ${layout === 'row' ? 'grow' : ''}`}
      >
        <div className="h-1.5 rounded-[3px] bg-hint" style={{ width: `${pct}%` }} />
      </div>
      <span className="qd-num text-[12px] font-extrabold text-hint">
        {formatNumber(current, i18n.language)}/{formatNumber(goal, i18n.language)}
      </span>
    </div>
  );
  const shine = state === 'new' ? 'qd-shine' : '';

  if (layout === 'tile') {
    return (
      <div
        className="box-border flex min-h-[172px] w-full flex-col items-center gap-1.5 rounded-[20px] bg-section px-3 pt-4 pb-3.5 text-center"
        style={{ boxShadow: locked ? 'none' : '0 4px 0 var(--qd-lip)' }}
      >
        <span aria-hidden="true" className={`${shine} mb-1 flex h-14 w-14 shrink-0 items-center justify-center rounded-full`} style={badge}>
          <Icon glyph={ACH_GLYPH[code]} size={26} stroke={2.5} />
        </span>
        <span className="text-[15px] font-extrabold" style={{ color: locked ? 'var(--tg-theme-hint-color)' : undefined }}>
          {title}
        </span>
        <span className="text-[12px] leading-[1.3] font-semibold text-hint">{desc}</span>
        {locked ? (
          progress
        ) : (
          <span
            className="mt-auto flex items-center gap-1 text-[12px] font-extrabold"
            style={{ color: state === 'new' ? 'var(--qd-gold-text)' : 'var(--qd-correct-text)' }}
          >
            <Icon glyph="check" size={12} stroke={3.5} />
            {state === 'new' ? t('ach.newBadge') : t('ach.got')}
          </span>
        )}
      </div>
    );
  }

  return (
    <div className="box-border flex w-full items-center gap-3 rounded-[20px] bg-section px-3.5 py-3">
      <span aria-hidden="true" className={`${shine} flex h-[46px] w-[46px] shrink-0 items-center justify-center rounded-full`} style={badge}>
        <Icon glyph={ACH_GLYPH[code]} size={22} stroke={2.5} />
      </span>
      <div className="flex min-w-0 grow flex-col gap-0.5">
        {state === 'new' && <span className="text-[13px] font-extrabold text-gold-text">{t('ach.newBadge')}</span>}
        <span className="text-[16px] font-extrabold" style={{ color: locked ? 'var(--tg-theme-hint-color)' : undefined }}>
          {title}
        </span>
        <span className="text-[13px] font-semibold text-hint">{desc}</span>
        {locked && progress}
      </div>
    </div>
  );
}
