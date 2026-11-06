import { useTranslation } from 'react-i18next';
import type { PlayerBrief } from '@quiz-duel/shared';
import { Avatar } from './Avatar';
import { Icon } from './Icon';
import { formatNumber } from '../i18n';

interface LeaderRowProps {
  /** null - игрок ещё не в рейтинге (меньше 5 партий). */
  place: number | null;
  player: PlayerBrief;
  games: number;
  me?: boolean;
  pinned?: boolean;
}

/** Строка лидерборда: место, аватар, имя (моя строка - с плашкой «Вы»), партии и рейтинг. */
export function LeaderRow({ place, player, games, me = false, pinned = false }: LeaderRowProps) {
  const { t, i18n } = useTranslation();
  return (
    <div
      className="box-border flex h-[60px] w-full items-center gap-3 rounded-[18px] px-3.5"
      style={{
        background: me ? 'var(--qd-brand-tint)' : 'var(--tg-theme-section-bg-color)',
        boxShadow: pinned ? '0 4px 0 var(--qd-lip), 0 -10px 24px rgba(10, 8, 16, 0.35)' : 'none',
      }}
    >
      <span className="qd-num w-7 shrink-0 text-center text-[15px] font-black" style={{ color: me ? 'var(--qd-brand-text)' : 'var(--tg-theme-hint-color)' }}>
        {place === null ? '-' : formatNumber(place, i18n.language)}
      </span>
      <Avatar id={player.id} name={player.name} photoUrl={player.photoUrl} size={38} ring={me ? 'me' : 'none'} on="none" />
      <div className="flex min-w-0 grow flex-col gap-px">
        <span className="flex min-w-0 items-center gap-1.5">
          <span className="truncate text-[15px] font-extrabold">{player.name}</span>
          {me && (
            <span className="flex h-5 shrink-0 items-center rounded-[10px] px-[7px] text-[11px] font-black text-white" style={{ background: 'var(--qd-me)' }}>
              {t('common.you')}
            </span>
          )}
        </span>
        <span className="qd-num text-[13px] font-semibold text-hint">{t('common.games', { count: games })}</span>
      </div>
      <span className="qd-num flex shrink-0 items-center gap-1 text-[15px] font-black text-gold-text">
        <Icon glyph="rating" size={14} stroke={2.5} />
        {formatNumber(player.rating, i18n.language)}
      </span>
    </div>
  );
}

/** Скелетон строки, пока рейтинг загружается. */
export function LeaderRowSkeleton({ pinned = false }: { pinned?: boolean }) {
  return (
    <div
      aria-hidden="true"
      className="box-border flex h-[60px] w-full items-center gap-3 rounded-[18px] bg-section px-3.5"
      style={{ boxShadow: pinned ? '0 4px 0 var(--qd-lip), 0 -10px 24px rgba(10, 8, 16, 0.35)' : 'none' }}
    >
      <span className="qd-skel h-3.5 w-6 rounded-[7px] bg-surface-2" />
      <span className="qd-skel h-[38px] w-[38px] rounded-full bg-surface-2" />
      <span className="flex grow flex-col gap-1.5">
        <span className="qd-skel h-3 w-3/5 rounded-md bg-surface-2" />
        <span className="qd-skel h-2.5 w-[35%] rounded-[5px] bg-surface-2" />
      </span>
      <span className="qd-skel h-3.5 w-[52px] rounded-[7px] bg-surface-2" />
    </div>
  );
}
