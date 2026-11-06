import { useTranslation } from 'react-i18next';
import type { MatchSummary } from '@quiz-duel/shared';
import { Avatar } from './Avatar';
import { formatNumber } from '../i18n';
import { formatWhen, signed } from '../lib/format';

const CHIP = {
  win: { bg: 'var(--qd-correct-tint)', fg: 'var(--qd-correct-text)' },
  loss: { bg: 'var(--qd-wrong-tint)', fg: 'var(--qd-wrong-text)' },
  draw: { bg: 'var(--qd-surface-2)', fg: 'var(--tg-theme-hint-color)' },
} as const;

/** Строка матча: соперник, счёт, когда, итог с изменением рейтинга. Тап - разбор партии. */
export function MatchRow({ match, onPress }: { match: MatchSummary; onPress?: () => void }) {
  const { t, i18n } = useTranslation();
  const lang = i18n.language;
  const c = CHIP[match.outcome];
  const label = t(`result.${match.outcome}`);
  const delta = match.ratingDelta === null ? '' : ` ${signed(match.ratingDelta, lang)}`;
  return (
    <button
      type="button"
      onClick={onPress}
      disabled={!onPress}
      className="qd-press box-border flex min-h-[58px] w-full cursor-pointer items-center gap-3 rounded-[18px] border-0 bg-section px-3.5 py-2 text-left font-[inherit] text-text disabled:cursor-default"
    >
      <Avatar id={match.opponent.id} name={match.opponent.name} photoUrl={match.opponent.photoUrl} size={38} on="card" />
      <div className="flex min-w-0 grow flex-col gap-px">
        <span className="truncate text-[15px] font-extrabold">{match.opponent.name}</span>
        <span className="qd-num truncate text-[13px] font-semibold text-hint">
          {formatNumber(match.myScore, lang)} : {formatNumber(match.oppScore, lang)} · {formatWhen(match.finishedAt, t, lang)}
        </span>
      </div>
      <span className="qd-num flex h-7 shrink-0 items-center rounded-[14px] px-2.5 text-[13px] font-extrabold" style={{ background: c.bg, color: c.fg }}>
        {label}
        {delta}
      </span>
    </button>
  );
}
