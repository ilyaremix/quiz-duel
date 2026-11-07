import { useTranslation } from 'react-i18next';
import type { MatchSummary } from '@quiz-duel/shared';
import { Avatar } from './Avatar';
import { formatNumber } from '../i18n';
import { formatWhen, signed } from '../lib/format';

/** Исход - тонированная стеклянная капсула: победа зелёная, поражение красная, ничья фиолетовая. */
export const OUTCOME_CHIP = {
  win: { bg: 'var(--qd-correct-tint)', ring: 'var(--qd-ok-ring)', fg: 'var(--qd-correct-text)' },
  loss: { bg: 'var(--qd-wrong-tint)', ring: 'var(--qd-bad-ring)', fg: 'var(--qd-wrong-text)' },
  draw: { bg: 'var(--qd-brand-tint)', ring: 'var(--qd-brand-ring)', fg: 'var(--qd-brand-text)' },
} as const;

/** Строка матча: соперник, счёт, когда, итог с изменением рейтинга. Тап - разбор партии. */
export function MatchRow({ match, onPress }: { match: MatchSummary; onPress?: () => void }) {
  const { t, i18n } = useTranslation();
  const lang = i18n.language;
  const c = OUTCOME_CHIP[match.outcome];
  const label = t(`result.${match.outcome}`);
  const delta = match.ratingDelta === null ? '' : ` ${signed(match.ratingDelta, lang)}`;
  return (
    <button
      type="button"
      onClick={onPress}
      disabled={!onPress}
      className="qd-press box-border flex min-h-[58px] w-full cursor-pointer items-center gap-3 rounded-[24px] border-0 py-2 pr-3.5 pl-2.5 text-left text-text disabled:cursor-default"
      style={{ background: 'var(--qd-sheen), var(--qd-glass)', boxShadow: 'var(--qd-glass-edge)' }}
    >
      <Avatar id={match.opponent.id} name={match.opponent.name} photoUrl={match.opponent.photoUrl} size={40} on="card" glow={match.opponent.glow} />
      <div className="flex min-w-0 grow flex-col gap-0.5">
        <span className="truncate text-[16px] font-semibold">{match.opponent.name}</span>
        <span className="qd-num truncate text-[13px] font-medium text-hint">
          {formatNumber(match.myScore, lang)} : {formatNumber(match.oppScore, lang)} · {formatWhen(match.finishedAt, t, lang)}
        </span>
      </div>
      <span
        className="qd-num inline-flex h-7 shrink-0 items-center rounded-[14px] px-[11px] text-[13px] font-bold whitespace-nowrap"
        style={{ background: c.bg, boxShadow: `inset 0 1px 0 rgba(255, 255, 255, 0.3), inset 0 0 0 1px ${c.ring}`, color: c.fg }}
      >
        {label}
        {delta}
      </span>
    </button>
  );
}
