import { useState } from 'react';

/** Цвета круга без фото, как на макетах; выбираются по id, чтобы не меняться между входами. */
const COLORS = ['#2F6FEB', '#C2569B', '#4F9A6A', '#B9782E', '#6C4CF0', '#3F8FA6'];

export function initialsOf(name: string): string {
  const letter = [...name.trim()][0];
  return letter ? letter.toLocaleUpperCase() : '?';
}

export function avatarColor(id: number): string {
  return COLORS[Math.abs(id) % COLORS.length]!;
}

interface AvatarProps {
  id: number;
  name: string;
  photoUrl?: string | null;
  size?: number;
  ring?: 'none' | 'me' | 'opp';
}

export function Avatar({ id, name, photoUrl, size = 44, ring = 'none' }: AvatarProps) {
  const [broken, setBroken] = useState(false);
  const gap = size >= 40 ? 3 : 2;
  const ringColor = ring === 'me' ? 'var(--qd-me)' : 'var(--qd-opp)';
  const shadow =
    ring === 'none' ? undefined : `0 0 0 ${gap}px var(--tg-theme-section-bg-color), 0 0 0 ${gap * 2}px ${ringColor}`;

  return (
    <div
      className="flex shrink-0 items-center justify-center overflow-hidden rounded-full font-extrabold leading-none text-white"
      style={{ width: size, height: size, fontSize: Math.round(size * 0.42), background: avatarColor(id), boxShadow: shadow }}
    >
      {photoUrl && !broken ? (
        <img
          src={photoUrl}
          alt=""
          width={size}
          height={size}
          className="h-full w-full object-cover"
          referrerPolicy="no-referrer"
          draggable={false}
          onError={() => setBroken(true)}
        />
      ) : (
        <span aria-hidden="true">{initialsOf(name)}</span>
      )}
    </div>
  );
}
