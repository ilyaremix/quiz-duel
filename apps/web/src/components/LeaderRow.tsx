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

/** Медали топ-3: цвет шара, свечение, цвет цифры. */
const MEDALS: Record<number, [string, string, string]> = {
  1: ['#FFD36B', 'rgba(255, 211, 107, 0.6)', '#3A2600'],
  2: ['#D5DAF0', 'rgba(213, 218, 240, 0.45)', '#22263D'],
  3: ['#E8A56A', 'rgba(232, 165, 106, 0.5)', '#3A1E06'],
};

const GLASS = 'var(--qd-sheen), var(--qd-glass)';
/** Тень закреплённой строки «Вы» над списком. */
const PIN_SHADOW = '0 -12px 28px rgba(3, 4, 20, 0.45)';

/** Строка лидерборда: топ-3 - глянцевые медали, моя строка - синее стекло со свечением и плашкой «Вы». */
export function LeaderRow({ place, player, games, me = false, pinned = false }: LeaderRowProps) {
  const { t, i18n } = useTranslation();
  const medal = place !== null ? MEDALS[place] : undefined;
  const edge = me ? 'var(--qd-me-edge)' : 'var(--qd-glass-edge-flat)';
  const rank = place === null ? '-' : formatNumber(place, i18n.language);
  return (
    <div
      className="box-border flex h-[60px] w-full items-center gap-3 rounded-[24px] pr-3.5 pl-3"
      style={{ background: me ? 'var(--qd-me-glass)' : GLASS, boxShadow: pinned ? `${edge}, ${PIN_SHADOW}` : edge }}
    >
      {medal ? (
        <span
          className="qd-num flex h-7 w-7 shrink-0 items-center justify-center rounded-full text-[13px] font-bold"
          style={{
            background: `radial-gradient(circle at 32% 25%, rgba(255, 255, 255, 0.7), rgba(255, 255, 255, 0) 50%), ${medal[0]}`,
            boxShadow: `inset 0 1px 0 rgba(255, 255, 255, 0.6), 0 0 12px ${medal[1]}`,
            color: medal[2],
          }}
        >
          {rank}
        </span>
      ) : (
        <span className="qd-num w-7 shrink-0 text-center text-[15px] font-bold" style={{ color: me ? 'var(--qd-me-text)' : 'var(--tg-theme-hint-color)' }}>
          {rank}
        </span>
      )}
      <Avatar id={player.id} name={player.name} photoUrl={player.photoUrl} size={38} ring={me ? 'me' : 'none'} on="none" glow={player.glow} />
      <div className="flex min-w-0 grow flex-col gap-px">
        <span className="flex min-w-0 items-center gap-1.5">
          <span className="truncate text-[15px] font-semibold">{player.name}</span>
          {me && (
            <span
              className="flex h-5 shrink-0 items-center rounded-[10px] px-2 text-[11px] font-bold text-white"
              style={{
                background: 'linear-gradient(180deg, #5B95FF, #2F6FEB)',
                boxShadow: 'inset 0 1px 0 rgba(255, 255, 255, 0.45), 0 0 10px var(--qd-me-glow)',
              }}
            >
              {t('common.you')}
            </span>
          )}
        </span>
        <span className="qd-num text-[13px] font-medium text-hint">{t('common.games', { count: games })}</span>
      </div>
      <span className="qd-num flex shrink-0 items-center gap-1 text-[15px] font-bold text-gold-text">
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
      className="box-border flex h-[60px] w-full items-center gap-3 rounded-[24px] pr-3.5 pl-3"
      style={{ background: GLASS, boxShadow: pinned ? `var(--qd-glass-edge-flat), ${PIN_SHADOW}` : 'var(--qd-glass-edge-flat)' }}
    >
      <span className="qd-skel h-3.5 w-[26px] rounded-[7px] bg-track" />
      <span className="qd-skel h-[38px] w-[38px] rounded-full bg-track" />
      <span className="flex grow flex-col gap-1.5">
        <span className="qd-skel h-3 w-3/5 rounded-md bg-track" />
        <span className="qd-skel h-2.5 w-[35%] rounded-[5px] bg-track" />
      </span>
      <span className="qd-skel h-3.5 w-[52px] rounded-[7px] bg-track" />
    </div>
  );
}
