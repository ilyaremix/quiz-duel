import { useState } from 'react';
import { useTranslation } from 'react-i18next';
import { Icon } from './Icon';

/** Цвета круга без фото, как на макетах; выбираются по id, чтобы не меняться между входами. */
const COLORS = ['#2F6FEB', '#C2569B', '#4F9A6A', '#B9782E', '#6C4CF0', '#3F8FA6'];

export function initialsOf(name: string): string {
  const letter = [...name.trim()][0];
  return letter ? letter.toLocaleUpperCase() : '?';
}

export function avatarColor(id: number): string {
  return COLORS[Math.abs(id) % COLORS.length]!;
}

export type AvatarBadge = 'none' | 'online' | 'ready' | 'answered' | 'offline';

interface AvatarProps {
  id: number;
  name: string;
  photoUrl?: string | null;
  size?: number;
  ring?: 'none' | 'me' | 'opp';
  /** На каком фоне стоит аватар: зазор кольца и бейджа красится в этот цвет. */
  on?: 'page' | 'card' | 'none';
  badge?: AvatarBadge;
}

const BADGES = {
  online: { bg: 'var(--qd-correct)', fg: 'var(--qd-on-fill)', glyph: null },
  ready: { bg: 'var(--qd-correct)', fg: 'var(--qd-on-fill)', glyph: 'check' },
  /** Ответил на текущий вопрос (какой вариант - не видно). */
  answered: { bg: 'var(--qd-brand)', fg: '#FFFFFF', glyph: 'check' },
  offline: { bg: 'var(--tg-theme-hint-color)', fg: 'var(--qd-on-fill)', glyph: 'offline' },
} as const;

/** Аватар из Telegram; без фото - цветной круг с инициалом. Бейдж: в сети, готов, ответил, не в сети. */
export function Avatar({ id, name, photoUrl, size = 44, ring = 'none', on = 'page', badge = 'none' }: AvatarProps) {
  const { t } = useTranslation();
  const [broken, setBroken] = useState(false);
  const gap = size >= 40 ? 3 : 2;
  const gapColor = on === 'card' ? 'var(--tg-theme-section-bg-color)' : 'var(--tg-theme-secondary-bg-color)';
  const ringColor = ring === 'me' ? 'var(--qd-me)' : 'var(--qd-opp)';
  const shadow =
    ring === 'none' ? undefined : on === 'none' ? `0 0 0 2px ${ringColor}` : `0 0 0 ${gap}px ${gapColor}, 0 0 0 ${gap * 2}px ${ringColor}`;

  const b = badge === 'none' ? null : BADGES[badge];
  const border = size >= 40 ? 3 : 2;
  const bs = badge === 'online' ? Math.max(12, Math.round(size * 0.3)) : Math.max(16, Math.round(size * 0.44));
  const bOff = badge === 'online' ? 0 : -Math.round(bs * 0.18);

  return (
    <div className="relative shrink-0" style={{ width: size, height: size }}>
      <div
        className="flex items-center justify-center overflow-hidden rounded-full font-extrabold leading-none text-white"
        style={{ width: size, height: size, fontSize: Math.round(size * 0.42), background: avatarColor(id), boxShadow: shadow }}
      >
        {photoUrl && !broken ? (
          <img
            src={photoUrl}
            alt=""
            width={size}
            height={size}
            className="h-full w-full rounded-full object-cover"
            referrerPolicy="no-referrer"
            draggable={false}
            onError={() => setBroken(true)}
          />
        ) : (
          <span aria-hidden="true">{initialsOf(name)}</span>
        )}
      </div>
      {b && (
        <div
          role="img"
          aria-label={t(`badge.${badge}`)}
          className="qd-pop absolute box-border flex items-center justify-center rounded-full"
          style={{ right: bOff, bottom: bOff, width: bs, height: bs, border: `${border}px solid ${gapColor}`, background: b.bg, color: b.fg }}
        >
          {b.glyph && <Icon glyph={b.glyph} size={Math.max(8, Math.round((bs - border * 2) * 0.75))} stroke={3.5} />}
        </div>
      )}
    </div>
  );
}
