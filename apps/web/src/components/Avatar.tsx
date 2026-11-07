import { useState } from 'react';
import { useTranslation } from 'react-i18next';
import type { GlowId } from '@quiz-duel/shared';
import { Icon } from './Icon';

/** Свечение из магазина: внешний ореол за кольцом игрока; радуга - крутящееся кольцо. */
export const GLOW_LOOK: Record<Exclude<GlowId, 'none'>, { ring: string; shadow: string; anim: 'pulse' | 'spin' | 'flame' }> = {
  neon: { ring: '#22D3EE', shadow: '0 0 0 2px #22D3EE, 0 0 14px rgba(34,211,238,.95), 0 0 30px rgba(155,92,255,.75)', anim: 'pulse' },
  gold: { ring: '#FFD36B', shadow: '0 0 0 2px #FFD36B, 0 0 16px rgba(255,211,107,.95), 0 0 34px rgba(242,178,48,.6)', anim: 'pulse' },
  ice: { ring: '#CDEFFF', shadow: '0 0 0 2px #CDEFFF, 0 0 16px rgba(160,220,255,.95), 0 0 32px rgba(79,141,255,.6)', anim: 'pulse' },
  rainbow: { ring: 'conic', shadow: '0 0 18px rgba(155,92,255,.75), 0 0 34px rgba(34,211,238,.5)', anim: 'spin' },
  fire: { ring: '#FF8A3D', shadow: '0 0 0 2px #FF8A3D, 0 0 18px rgba(255,106,61,.95), 0 0 38px rgba(255,59,59,.65)', anim: 'flame' },
};

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
  /** none - тонкое кольцо вплотную; page / card - кольцо через зазор и свечение. */
  on?: 'page' | 'card' | 'none';
  badge?: AvatarBadge;
  /** Свечение аватарки из магазина. */
  glow?: GlowId;
}

const BADGES = {
  online: { bg: 'var(--qd-correct)', fg: 'var(--qd-on-fill)', glyph: null, glow: 'var(--qd-ok-glow)' },
  ready: { bg: 'var(--qd-correct)', fg: 'var(--qd-on-fill)', glyph: 'check', glow: 'var(--qd-ok-glow)' },
  /** Ответил на текущий вопрос (какой вариант - не видно). */
  answered: { bg: 'var(--qd-brand)', fg: '#FFFFFF', glyph: 'check', glow: 'var(--qd-brand-glow)' },
  offline: { bg: 'var(--tg-theme-hint-color)', fg: 'var(--qd-on-fill)', glyph: 'offline', glow: 'transparent' },
} as const;

/**
 * Аватар из Telegram; без фото - глянцевая «сфера» с инициалом. Кольцо со свечением - чей игрок
 * (я - синий, соперник - оранжевый). Бейдж: в сети, готов, ответил, не в сети.
 */
export function Avatar({ id, name, photoUrl, size = 44, ring = 'none', on = 'page', badge = 'none', glow: shine = 'none' }: AvatarProps) {
  const { t } = useTranslation();
  const [broken, setBroken] = useState(false);
  const gap = size >= 40 ? 3 : 2;
  const ringColor = ring === 'me' ? 'var(--qd-me)' : 'var(--qd-opp)';
  const glow = ring === 'me' ? 'var(--qd-me-glow)' : 'var(--qd-opp-glow)';
  const inner = `inset 0 1px 0 rgba(255, 255, 255, 0.45), inset 0 -${Math.max(3, Math.round(size * 0.08))}px ${Math.max(6, Math.round(size * 0.2))}px rgba(0, 0, 0, 0.2)`;
  const outer =
    ring === 'none'
      ? ''
      : on === 'none'
        ? `0 0 0 2px ${ringColor}, 0 0 12px ${glow}`
        : `0 0 0 ${gap}px var(--qd-ring-gap), 0 0 0 ${gap * 2}px ${ringColor}, 0 0 ${Math.round(size * 0.45)}px ${glow}`;
  const photo = Boolean(photoUrl && !broken);

  const b = badge === 'none' ? null : BADGES[badge];
  const border = size >= 40 ? 3 : 2;
  const bs = badge === 'online' ? Math.max(12, Math.round(size * 0.3)) : Math.max(16, Math.round(size * 0.44));
  const bOff = badge === 'online' ? 0 : -Math.round(bs * 0.18);

  const g = shine === 'none' ? null : GLOW_LOOK[shine];
  const ringOut = ring === 'none' ? 0 : on === 'none' ? 2 : gap * 2;
  const gOff = ringOut + (size >= 40 ? 3 : 2);
  const gStyle = { left: -gOff, top: -gOff, width: size + gOff * 2, height: size + gOff * 2 };

  return (
    <div className="relative shrink-0" style={{ width: size, height: size }}>
      {g && <span aria-hidden="true" className={`qd-glow-${g.anim} pointer-events-none absolute rounded-full`} style={{ ...gStyle, boxShadow: g.shadow }} />}
      {g?.ring === 'conic' && <span aria-hidden="true" className="qd-glow-spin qd-glow-ring pointer-events-none absolute rounded-full" style={gStyle} />}
      <div
        className="flex items-center justify-center rounded-full leading-none font-bold text-white"
        style={{
          width: size,
          height: size,
          fontSize: Math.round(size * 0.42),
          background: `radial-gradient(circle at 32% 24%, rgba(255, 255, 255, 0.55), rgba(255, 255, 255, 0) 48%), ${avatarColor(id)}`,
          // У фото внутренний блик не рисуем - только кольцо.
          boxShadow: [photo ? '' : inner, outer].filter(Boolean).join(', ') || undefined,
          textShadow: '0 1px 2px rgba(0, 0, 0, 0.25)',
        }}
      >
        {photo ? (
          <img
            src={photoUrl!}
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
          style={{
            right: bOff,
            bottom: bOff,
            width: bs,
            height: bs,
            border: `${border}px solid var(--qd-ring-gap)`,
            background: b.bg,
            color: b.fg,
            boxShadow: `0 0 10px ${b.glow}`,
          }}
        >
          {b.glyph && <Icon glyph={b.glyph} size={Math.max(8, Math.round((bs - border * 2) * 0.75))} stroke={3.5} />}
        </div>
      )}
    </div>
  );
}
