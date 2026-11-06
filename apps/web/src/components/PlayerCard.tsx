import { useTranslation } from 'react-i18next';
import { Avatar, type AvatarBadge } from './Avatar';
import { Icon, type IconGlyph } from './Icon';
import { formatNumber } from '../i18n';

export type PlayerStatus = 'ready' | 'notready' | 'offline' | 'host';

const CHIPS: Record<PlayerStatus, { bg: string; fg: string; glyph: IconGlyph; badge: AvatarBadge }> = {
  ready: { bg: 'var(--qd-correct-tint)', fg: 'var(--qd-correct-text)', glyph: 'check', badge: 'ready' },
  notready: { bg: 'var(--qd-surface-2)', fg: 'var(--tg-theme-hint-color)', glyph: 'clock', badge: 'online' },
  offline: { bg: 'var(--qd-gold-tint)', fg: 'var(--qd-gold-text)', glyph: 'offline', badge: 'offline' },
  host: { bg: 'var(--qd-brand-tint)', fg: 'var(--qd-brand-text)', glyph: 'duel', badge: 'online' },
};

interface PlayerCardProps {
  id: number;
  name: string;
  photoUrl: string | null;
  rating: number;
  side: 'me' | 'opp';
  status: PlayerStatus;
}

/** Карточка игрока в лобби: аватар с кольцом своей стороны, имя, рейтинг и статус. */
export function PlayerCard({ id, name, photoUrl, rating, side, status }: PlayerCardProps) {
  const { t, i18n } = useTranslation();
  const c = CHIPS[status];
  return (
    <div className="box-border flex min-h-[220px] w-full flex-col items-center gap-2.5 rounded-[24px] bg-section px-3.5 pt-[22px] pb-[18px] text-center shadow-[0_4px_0_var(--qd-lip)]">
      <Avatar id={id} name={name} photoUrl={photoUrl} size={64} ring={side} on="card" badge={c.badge} />
      <div className="mt-1 max-w-[calc(100%-12px)] truncate text-[17px] font-extrabold">{name}</div>
      <div className="qd-num flex items-center gap-1 text-[14px] font-extrabold text-gold-text">
        <Icon glyph="rating" size={14} stroke={2.5} />
        {formatNumber(rating, i18n.language)}
      </div>
      <span
        className="flex h-[30px] items-center gap-[5px] rounded-[15px] px-3 text-[13px] font-extrabold transition-colors duration-200"
        style={{ background: c.bg, color: c.fg }}
      >
        <Icon glyph={c.glyph} size={14} stroke={3} />
        {t(`status.${status}`)}
      </span>
    </div>
  );
}

/** Пустое место соперника: пульсирующий «?» и подсказка. */
export function EmptySeat() {
  const { t } = useTranslation();
  return (
    <div className="box-border flex min-h-[220px] w-full flex-col items-center justify-center gap-2.5 rounded-[24px] border-2 border-dashed border-brand px-3.5 pt-[22px] pb-[18px] text-center">
      <div
        aria-hidden="true"
        className="qd-pulse box-border flex h-16 w-16 items-center justify-center rounded-full border-2 border-dashed border-brand bg-brand-tint text-[26px] font-black text-brand-text"
      >
        ?
      </div>
      <div className="text-[16px] font-extrabold">{t('status.waiting')}</div>
      <div className="text-[13px] leading-[1.3] font-semibold text-hint">{t('status.waitingHint')}</div>
    </div>
  );
}
