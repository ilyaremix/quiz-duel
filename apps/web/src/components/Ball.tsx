import type { CSSProperties, ReactNode } from 'react';

interface BallProps {
  size: number;
  /** Цвет шара, свечение вокруг и цвет иконки на нём. */
  color: string;
  glow: string;
  ink: string;
  className?: string;
  style?: CSSProperties;
  children?: ReactNode;
}

/** Глянцевый шар-иконка стиля C: блик сверху слева и свечение своего цвета (класс qd-ball). */
export function Ball({ size, color, glow, ink, className = '', style, children }: BallProps) {
  return (
    <span
      aria-hidden="true"
      className={`qd-ball ${className}`}
      style={{ width: size, height: size, '--qd-ball': color, '--qd-ball-glow': glow, color: ink, ...style } as CSSProperties}
    >
      {children}
    </span>
  );
}

/** Готовые шары: фиолетовый (бренд), золотой, зелёный, красный, синий. */
export const BALLS = {
  brand: { color: '#9B5CFF', glow: 'var(--qd-brand-glow)', ink: '#FFFFFF' },
  gold: { color: '#FFD36B', glow: 'var(--qd-gold-glow)', ink: '#3A2600' },
  ok: { color: '#3BE58B', glow: 'var(--qd-ok-glow)', ink: '#04261A' },
  bad: { color: '#FF5A7A', glow: 'var(--qd-bad-glow)', ink: '#2E0310' },
  me: { color: '#4F8DFF', glow: 'var(--qd-me-glow)', ink: '#FFFFFF' },
  opp: { color: '#FF8A3D', glow: 'var(--qd-opp-glow)', ink: '#2A1405' },
} as const;
