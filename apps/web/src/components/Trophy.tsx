import { useMemo, type CSSProperties } from 'react';
import { Icon, type IconGlyph } from './Icon';

/** Сфера итога: золотой кубок (победа, рекорд), красный крестик (поражение), фиолетовые мечи (ничья) или мишень (тренировка). */
export const TROPHY = {
  gold: { glyph: 'rating', stroke: 2, ink: 'var(--qd-gold-text)', core: 'rgba(255, 211, 107, 0.75)', halo: 'rgba(255, 211, 107, 0.32)', glowA: 'rgba(255, 211, 107, 0.28)', glowB: 'rgba(255, 211, 107, 0.6)' },
  red: { glyph: 'close', stroke: 3, ink: 'var(--qd-wrong-text)', core: 'rgba(255, 90, 122, 0.7)', halo: 'rgba(255, 90, 122, 0.22)', glowA: 'rgba(255, 90, 122, 0.22)', glowB: 'rgba(255, 90, 122, 0.42)' },
  violet: { glyph: 'duel', stroke: 2, ink: 'var(--qd-brand-text)', core: 'rgba(155, 92, 255, 0.75)', halo: 'rgba(155, 92, 255, 0.28)', glowA: 'rgba(155, 92, 255, 0.25)', glowB: 'rgba(155, 92, 255, 0.5)' },
} satisfies Record<string, { glyph: IconGlyph; stroke: number; ink: string; core: string; halo: string; glowA: string; glowB: string }>;

export type TrophyTone = keyof typeof TROPHY;

const EDGE = 'inset 0 1.5px 0 rgba(255, 255, 255, 0.7), inset 0 0 0 1px rgba(255, 255, 255, 0.22)';

/**
 * Кубок итогов: стеклянная сфера выпрыгивает и «дышит» свечением своего цвета.
 * rays - победа и рекорд: за сферой медленно вращаются солнечные лучи (24 с) и радужное кольцо.
 */
export function Trophy({ tone, glyph, rays = false }: { tone: TrophyTone; glyph?: IconGlyph; rays?: boolean }) {
  const o = TROPHY[tone];
  return (
    <div aria-hidden="true" className="relative flex h-[168px] w-[220px] items-center justify-center">
      <span
        className="absolute top-1/2 left-1/2 -mt-[130px] -ml-[130px] h-[260px] w-[260px] rounded-full"
        style={{ background: `radial-gradient(closest-side, ${o.halo}, rgba(0, 0, 0, 0))` }}
      />
      {rays && (
        <>
          <span
            className="qd-turn absolute top-1/2 left-1/2 -mt-[150px] -ml-[150px] h-[300px] w-[300px] rounded-full"
            style={{
              background: 'repeating-conic-gradient(from 0deg, rgba(255, 211, 107, 0.42) 0deg 5deg, rgba(255, 211, 107, 0) 5deg 18deg)',
              WebkitMaskImage: 'radial-gradient(closest-side, transparent 30%, #000 46%, rgba(0, 0, 0, 0.55) 70%, transparent 100%)',
              maskImage: 'radial-gradient(closest-side, transparent 30%, #000 46%, rgba(0, 0, 0, 0.55) 70%, transparent 100%)',
              animationDuration: '24s',
            }}
          />
          <span
            className="qd-turn absolute top-1/2 left-1/2 -mt-[100px] -ml-[100px] h-[200px] w-[200px] rounded-full"
            style={{
              background:
                'conic-gradient(from 0deg, rgba(79, 141, 255, 0), rgba(79, 141, 255, 0.9), rgba(155, 92, 255, 0.9), rgba(255, 106, 136, 0.9), rgba(255, 211, 107, 0.9), rgba(34, 211, 238, 0.9), rgba(79, 141, 255, 0))',
              WebkitMaskImage: 'radial-gradient(closest-side, transparent 70%, #000 74%, #000 86%, transparent 92%)',
              maskImage: 'radial-gradient(closest-side, transparent 70%, #000 74%, #000 86%, transparent 92%)',
            }}
          />
        </>
      )}
      <div className="qd-trophy relative z-[1]">
        <div
          className="qd-breathe flex h-[124px] w-[124px] items-center justify-center rounded-full"
          style={
            {
              background: `linear-gradient(155deg, rgba(255, 255, 255, 0.34), rgba(255, 255, 255, 0.06) 55%), radial-gradient(circle at 50% 115%, ${o.core}, rgba(0, 0, 0, 0) 62%), var(--qd-glass)`,
              color: o.ink,
              '--qd-ga': `${EDGE}, 0 0 40px ${o.glowA}, 0 20px 40px rgba(0, 0, 0, 0.3)`,
              '--qd-gb': `${EDGE}, 0 0 74px ${o.glowB}, 0 20px 40px rgba(0, 0, 0, 0.3)`,
              boxShadow: 'var(--qd-ga)',
            } as CSSProperties
          }
        >
          <Icon glyph={glyph ?? o.glyph} size={58} stroke={o.stroke} />
        </div>
      </div>
    </div>
  );
}

const BURST = [
  ['#4F8DFF', 'rgba(79, 141, 255, 0.6)'],
  ['#9B5CFF', 'rgba(155, 92, 255, 0.6)'],
  ['#FF6A88', 'rgba(255, 106, 136, 0.6)'],
  ['#FFD36B', 'rgba(255, 211, 107, 0.7)'],
  ['#22D3EE', 'rgba(34, 211, 238, 0.6)'],
  ['#3BE58B', 'rgba(59, 229, 139, 0.6)'],
] as const;

/**
 * Яркое конфетти: частицы вылетают из кубка вверх и падают (класс qd-burst), один раз.
 * Ставится внутрь relative-экрана; в режиме без анимаций скрыто.
 */
export function Burst({ count = 40, top = 96 }: { count?: number; top?: number }) {
  const pieces = useMemo(
    () =>
      Array.from({ length: count }, (_, i) => {
        const round = i % 3 === 0;
        const [bg, glow] = BURST[i % BURST.length]!;
        return {
          w: round ? 8 + (i % 3) : 12 + (i % 4),
          h: round ? 8 + (i % 3) : 6,
          r: round ? 6 : 2,
          bg,
          glow,
          dx: ((i * 53) % 340) - 170,
          up: -(120 + ((i * 37) % 150)),
          rot: 240 + ((i * 47) % 480),
          d: 2300 + ((i * 131) % 1000),
          dl: (i * 29) % 320,
        };
      }),
    [count],
  );
  return (
    <div aria-hidden="true" className="pointer-events-none absolute inset-x-0 z-[2] h-0" style={{ top }}>
      {pieces.map((c, i) => (
        <span
          key={i}
          className="qd-burst"
          style={
            {
              width: c.w,
              height: c.h,
              borderRadius: c.r,
              background: c.bg,
              boxShadow: `0 0 8px ${c.glow}`,
              '--qd-dx': `${c.dx}px`,
              '--qd-up': `${c.up}px`,
              '--qd-rot': `${c.rot}deg`,
              '--qd-cd': `${c.d}ms`,
              '--qd-cdl': `${c.dl}ms`,
            } as CSSProperties
          }
        />
      ))}
    </div>
  );
}
