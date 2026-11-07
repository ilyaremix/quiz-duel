import { useTranslation } from 'react-i18next';
import type { GlowId } from '@quiz-duel/shared';
import { Avatar, type AvatarBadge } from './Avatar';
import { Icon, type IconGlyph } from './Icon';
import { formatNumber } from '../i18n';

export type PlayerStatus = 'ready' | 'notready' | 'offline' | 'host';

const CHIPS: Record<PlayerStatus, { bg: string; edge: string; fg: string; glyph: IconGlyph; badge: AvatarBadge }> = {
  ready: {
    bg: 'var(--qd-correct-tint)',
    edge: 'inset 0 1px 0 rgba(255, 255, 255, 0.3), inset 0 0 0 1px var(--qd-ok-ring)',
    fg: 'var(--qd-correct-text)',
    glyph: 'check',
    badge: 'ready',
  },
  notready: {
    bg: 'var(--qd-chip)',
    edge: 'inset 0 1px 0 rgba(255, 255, 255, 0.25)',
    fg: 'var(--tg-theme-hint-color)',
    glyph: 'clock',
    badge: 'online',
  },
  offline: {
    bg: 'var(--qd-gold-glass)',
    edge: 'inset 0 1px 0 rgba(255, 255, 255, 0.4), inset 0 0 0 1px var(--qd-gold-ring)',
    fg: 'var(--qd-gold-text)',
    glyph: 'offline',
    badge: 'offline',
  },
  host: {
    bg: 'var(--qd-brand-tint)',
    edge: 'inset 0 1px 0 rgba(255, 255, 255, 0.3), inset 0 0 0 1px var(--qd-brand-ring)',
    fg: 'var(--qd-brand-text)',
    glyph: 'duel',
    badge: 'online',
  },
};

interface PlayerCardProps {
  id: number;
  name: string;
  photoUrl: string | null;
  rating: number;
  side: 'me' | 'opp';
  status: PlayerStatus;
  /** Тап по аватарке - профиль игрока (шторка, экран 17). */
  onAvatar?: () => void;
  avatarLabel?: string;
  glow?: GlowId;
}

/**
 * Карточка игрока в лобби: стекло с подсветкой цвета игрока сверху, аватар с кольцом своей стороны,
 * имя, рейтинг и статус. «Готов» - зелёная кромка со свечением.
 */
export function PlayerCard({ id, name, photoUrl, rating, side, status, onAvatar, avatarLabel, glow }: PlayerCardProps) {
  const { t, i18n } = useTranslation();
  const c = CHIPS[status];
  const tint = side === 'me' ? 'var(--qd-me-glow)' : 'var(--qd-opp-glow)';
  const avatar = <Avatar id={id} name={name} photoUrl={photoUrl} size={64} ring={side} on="card" badge={c.badge} glow={glow} />;
  return (
    <div
      className="box-border flex min-h-[220px] w-full flex-col items-center gap-2.5 rounded-[26px] px-3.5 pt-[22px] pb-[18px] text-center"
      style={{
        background: `radial-gradient(90% 55% at 50% 0%, ${tint}, rgba(0, 0, 0, 0) 72%), var(--qd-sheen), var(--qd-glass)`,
        boxShadow:
          status === 'ready'
            ? 'inset 0 1px 0 rgba(255, 255, 255, 0.4), inset 0 0 0 1.5px var(--qd-correct), 0 0 26px var(--qd-ok-glow), 0 12px 30px rgba(3, 4, 20, 0.3)'
            : 'var(--qd-glass-edge)',
        transition: 'box-shadow 200ms ease',
      }}
    >
      {onAvatar ? (
        <button type="button" aria-label={avatarLabel} onClick={onAvatar} className="qd-press cursor-pointer rounded-full border-0 bg-transparent p-0">
          {avatar}
        </button>
      ) : (
        avatar
      )}
      <div className="mt-1 max-w-full truncate text-[17px] font-bold tracking-[-0.01em]">{name}</div>
      <span
        className="qd-num inline-flex h-[26px] items-center gap-1 rounded-[13px] px-2.5 text-[13px] font-bold"
        style={{
          background: 'var(--qd-gold-glass)',
          boxShadow: 'inset 0 1px 0 rgba(255, 255, 255, 0.4), inset 0 0 0 1px var(--qd-gold-ring)',
          color: 'var(--qd-gold-text)',
        }}
      >
        <Icon glyph="rating" size={13} stroke={2.6} />
        {formatNumber(rating, i18n.language)}
      </span>
      <span
        className="inline-flex h-[30px] items-center gap-[5px] rounded-[15px] px-3 text-[13px] font-semibold"
        style={{ background: c.bg, boxShadow: c.edge, color: c.fg, transition: 'background-color 200ms ease, color 200ms ease' }}
      >
        <Icon glyph={c.glyph} size={14} stroke={3} />
        {t(`status.${status}`)}
      </span>
    </div>
  );
}

/** Пустое место соперника: стеклянный «?» с расходящимися волнами и подсказка. */
export function EmptySeat() {
  const { t } = useTranslation();
  return (
    <div
      className="box-border flex min-h-[220px] w-full flex-col items-center justify-center gap-2.5 rounded-[26px] px-3.5 pt-[22px] pb-[18px] text-center"
      style={{ border: '1.5px dashed var(--qd-dash)', background: 'var(--qd-glass)' }}
    >
      <div aria-hidden="true" className="relative mb-1 h-16 w-16">
        <span className="qd-ripple absolute inset-0 rounded-full" />
        <span className="qd-ripple qd-r2 absolute inset-0 rounded-full" />
        <div
          className="relative flex h-16 w-16 items-center justify-center rounded-full text-[28px] font-bold"
          style={{
            background: 'linear-gradient(155deg, rgba(255, 255, 255, 0.22), rgba(255, 255, 255, 0.05)), var(--qd-glass)',
            boxShadow: 'inset 0 1px 0 rgba(255, 255, 255, 0.45), inset 0 0 0 1px rgba(255, 255, 255, 0.18), 0 0 24px var(--qd-opp-glow)',
            color: 'var(--qd-opp-text)',
          }}
        >
          ?
        </div>
      </div>
      <div className="text-[16px] font-bold">{t('status.waiting')}</div>
      <div className="text-[13px] leading-[1.3] font-medium text-hint">{t('status.waitingHint')}</div>
    </div>
  );
}
